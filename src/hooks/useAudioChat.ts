import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from "sonner";
import { ChildSettings } from '@/components/SettingsPanel';
import { CHILD_CHAT_PROMPT, RANDOM_CONVERSATION_PROMPT } from '@/lib/config/prompts';
import { getOpenAIApiKey, isOpenAIApiKeyConfigured } from '@/lib/config/env';
import { getRandomConversationStarter } from '@/lib/config/conversation-starters';

// Helper to detect iOS
const isIOS = (): boolean => {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform) || 
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

// Check if it's Safari browser
const isSafari = (): boolean => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

// Helper to validate audio blob
const isValidAudioBlob = (blob: Blob): boolean => {
  // Check if the blob has a reasonable size (at least 1KB)
  return blob.size > 1024;
};

// Types for conversation management
interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content?: string;
  audio?: {
    id?: string;
  };
}

const CONVERSATION_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

const useAudioChat = (settings: ChildSettings) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isFirstRecordRef = useRef<boolean>(true);
  // Track if we've successfully initialized audio
  const audioInitializedRef = useRef<boolean>(false);
  
  // Conversation state
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const conversationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  
  // Track data request interval to clean it up properly
  const dataRequestIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to properly release all audio resources
  const releaseAudioResources = useCallback(() => {
    console.log("Releasing all audio resources");
    
    // Stop any ongoing recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping recorder during cleanup:", e);
      }
    }
    
    // Clear media recorder
    mediaRecorderRef.current = null;
    
    // Release the microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
          console.log("Audio track stopped");
        } catch (e) {
          console.error("Error stopping track:", e);
        }
      });
      streamRef.current = null;
    }
    
    // Clear any data request interval
    if (dataRequestIntervalRef.current) {
      clearInterval(dataRequestIntervalRef.current);
      dataRequestIntervalRef.current = null;
    }
    
    setIsRecording(false);
  }, []);

  // Reset conversation after timeout
  const resetConversationIfNeeded = useCallback(() => {
    const now = Date.now();
    const timeSinceLastInteraction = now - lastInteractionTimeRef.current;
    
    if (timeSinceLastInteraction > CONVERSATION_TIMEOUT) {
      console.log("Conversation timeout reached, resetting conversation");
      setConversationMessages([]);
      return true;
    }
    return false;
  }, []);
  
  // Schedule conversation reset
  const scheduleConversationReset = useCallback(() => {
    // Clear any existing timeout
    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
    }
    
    // Set a new timeout
    conversationTimeoutRef.current = setTimeout(() => {
      const wasReset = resetConversationIfNeeded();
      if (wasReset) {
        toast.info("Starting a new conversation");
      }
    }, CONVERSATION_TIMEOUT);
    
    // Update last interaction time
    lastInteractionTimeRef.current = Date.now();
  }, [resetConversationIfNeeded]);

  // Process audio function (wrapped in useCallback to maintain reference)
  const processAudio = useCallback(async (blob: Blob) => {
    setIsLoading(true);
    
    try {
      // Check if conversation should be reset due to timeout
      resetConversationIfNeeded();
      
      // Get API key from environment variable or settings
      const apiKey = getOpenAIApiKey() || settings.apiKey;
      
      // Check if API key is provided
      if (!apiKey) {
        throw new Error("Please provide an OpenAI API key in the settings");
      }
      
      // Validate the audio blob
      if (!isValidAudioBlob(blob)) {
        console.error("Invalid audio blob:", blob);
        throw new Error("The recorded audio is too small or empty. Please try again and speak clearly.");
      }
      
      // For iOS/Safari, we need to ensure we're sending a compatible format
      // The Whisper API accepts m4a, mp3, mp4, mpeg, mpga, wav, and webm formats
      let processedBlob = blob;
      let filename = 'recording.webm';
      
      // Convert to mp3 for iOS consistently - this format is very reliable with Whisper API
      if (isIOS()) {
        try {
          // For iOS, always use mp3 as it's most reliable with Whisper
          filename = 'recording.mp3';
          
          // If the blob type is not already mp3, explicitly set it
          if (!blob.type.includes('mp3')) {
            // Create a new blob with mp3 MIME type
            processedBlob = new Blob([await blob.arrayBuffer()], { type: 'audio/mp3' });
            console.log("Converted blob to audio/mp3 format for iOS");
          }
        } catch (e) {
          console.error("Error converting blob format:", e);
          // If conversion fails, try to use original with mp3 extension
          processedBlob = blob;
        }
      } else {
        // For non-iOS, use the original MIME type to determine extension
        if (blob.type.includes('mp4')) {
          filename = 'recording.mp4';
        } else if (blob.type.includes('mp3')) {
          filename = 'recording.mp3';
        } else if (blob.type.includes('wav')) {
          filename = 'recording.wav';
        } else if (blob.type.includes('mpeg')) {
          filename = 'recording.mpeg';
        } else if (blob.type.includes('m4a')) {
          filename = 'recording.m4a';
        }
      }
      
      console.log(`Sending audio with filename: ${filename} and type: ${processedBlob.type}, size: ${processedBlob.size} bytes`);
      
      // 1. First convert audio to text using OpenAI Whisper API
      const formData = new FormData();
      
      formData.append('file', processedBlob, filename);
      formData.append('model', 'whisper-1');
      
      // Always include language parameter - important for reliable transcription
      if (settings.language === 'german') {
        formData.append('language', 'de');
      } else {
        formData.append('language', 'en');
      }
      
      // Log formData details for debugging
      console.log(`Sending audio file of size: ${processedBlob.size} bytes`);
      
      // Enhanced error handling for the fetch request
      let transcriptionResponse;
      try {
        transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          body: formData
        });
      } catch (fetchError) {
        console.error("Network error during transcription fetch:", fetchError);
        throw new Error("Network error while transcribing audio. Please check your internet connection.");
      }
      
      if (!transcriptionResponse.ok) {
        let errorMessage = "Unknown error";
        try {
          const errorData = await transcriptionResponse.json();
          console.error("Transcription error details:", errorData);
          errorMessage = errorData.error?.message || 'API error';
          
          // Better handling for common iOS-related errors with more user-friendly messages
          if (errorMessage.includes("could not be decoded") || 
              errorMessage.includes("File is empty") || 
              errorMessage.includes("Invalid file format")) {
            errorMessage = "The recording format wasn't recognized. Please try again with a stronger voice.";
            
            // If on iOS, provide more specific guidance
            if (isIOS()) {
              errorMessage += " Make sure you allow microphone access and speak clearly.";
            }
          }
        } catch (e) {
          console.error("Failed to parse error response:", e);
        }
        throw new Error(`Error transcribing audio: ${errorMessage}`);
      }
      
      const transcriptionData = await transcriptionResponse.json();
      const transcribedText = transcriptionData.text;
      
      if (!transcribedText || transcribedText.trim() === '') {
        throw new Error("Could not understand the audio. Please try speaking more clearly.");
      }
      
      // 2. Now send the transcribed text to OpenAI Chat API with audio modality
      // Get the appropriate prompt based on the selected language
      const promptForChild = CHILD_CHAT_PROMPT[settings.language];
      const childName = settings.name ? `\n\nThe child's name is ${settings.name}.` : '';
      const languageContext = settings.language === 'german' ? "Please respond in German." : "Please respond in English.";
      
      // System message for the model
      const systemMessage: ConversationMessage = {
        role: 'system',
        content: `${promptForChild}${childName} ${languageContext} Keep responses short and engaging for children.`
      };
      
      // Add current user message
      const userMessage: ConversationMessage = {
        role: 'user',
        content: transcribedText
      };
      
      // Prepare messages array for the API call
      let messages: ConversationMessage[] = [];
      
      // Check if we have existing conversation to continue
      if (conversationMessages.length > 0) {
        // Use existing conversation
        console.log("Continuing existing conversation with message count:", conversationMessages.length);
        
        // Add new user message to existing conversation
        messages = [
          systemMessage,
          ...conversationMessages,
          userMessage
        ];
      } else {
        // Start new conversation
        console.log("Starting new conversation");
        messages = [
          systemMessage,
          userMessage
        ];
      }
      
      // Choose the right model based on whether we want audio output or not
      // gpt-4o-audio-preview is required for audio modality
      const useAudioOutput = true; // Set to false to use only text output
      const model = useAudioOutput ? 'gpt-4o-audio-preview' : 'gpt-4o-mini';
      
      // Prepare the request body
      const requestBody: any = {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      };
      
      // Add audio settings only if using audio output
      if (useAudioOutput) {
        requestBody.modalities = ["text", "audio"];
        requestBody.audio = { 
          voice: settings.gender === 'girl' ? 'shimmer' : (settings.gender === 'boy' ? 'echo' : 'alloy'), 
          format: 'mp3'
        };
      }
      
      console.log("Sending chat completion request with messages:", requestBody.messages);
      
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!chatResponse.ok) {
        const errorData = await chatResponse.json();
        throw new Error(`Error from OpenAI: ${errorData.error?.message || 'Unknown error'}`);
      }
      
      const chatData = await chatResponse.json();
      const responseText = chatData.choices[0]?.message?.content || "";
      
      // Add user and assistant messages to conversation history
      const newUserMessage: ConversationMessage = { role: 'user', content: transcribedText };
      
      // Check if there's an audio ID in the response
      let newAssistantMessage: ConversationMessage = { 
        role: 'assistant', 
        content: responseText
      };
      
      // Extract audio ID if available for future multi-turn conversations
      if (chatData.choices[0]?.message?.audio?.id) {
        const audioId = chatData.choices[0].message.audio.id;
        console.log("Received audio ID for conversation continuity:", audioId);
        newAssistantMessage.audio = { id: audioId };
        
        // If content is null (which can happen with audio responses), use the transcript
        if (newAssistantMessage.content === null && chatData.choices[0].message.audio?.transcript) {
          newAssistantMessage.content = chatData.choices[0].message.audio.transcript;
        }
      }
      
      // Update conversation history
      const updatedConversation = [
        ...conversationMessages,
        newUserMessage,
        newAssistantMessage
      ];
      setConversationMessages(updatedConversation);
      
      // Schedule conversation reset
      scheduleConversationReset();
      
      // Get the audio data from the response if available
      if (useAudioOutput && chatData.choices[0]?.message?.audio?.data) {
        // Convert base64 to blob
        const audioData = chatData.choices[0].message.audio.data;
        const audioBytes = atob(audioData);
        const audioArrayBuffer = new ArrayBuffer(audioBytes.length);
        const audioBufferView = new Uint8Array(audioArrayBuffer);
        
        for (let i = 0; i < audioBytes.length; i++) {
          audioBufferView[i] = audioBytes.charCodeAt(i);
        }
        
        const audioResponseBlob = new Blob([audioArrayBuffer], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioResponseBlob);
        
        // Play the audio - special handling for iOS Safari
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          
          try {
            // For iOS Safari, we need to play in response to a user gesture
            await audioRef.current.play();
          } catch (playError) {
            console.error('Error playing audio:', playError);
            // Fallback to browser speech synthesis
            const msg = new SpeechSynthesisUtterance(responseText);
            msg.lang = settings.language === 'german' ? 'de-DE' : 'en-US';
            window.speechSynthesis.speak(msg);
          }
        }
      } else {
        // Fallback to browser's speech synthesis if no audio is returned
        const msg = new SpeechSynthesisUtterance(responseText);
        msg.lang = settings.language === 'german' ? 'de-DE' : 'en-US';
        msg.pitch = 1.2;
        msg.rate = 0.9;
        window.speechSynthesis.speak(msg);
      }
      
    } catch (error: any) {
      console.error('Error processing audio:', error);
      toast.error(error.message || "Error processing your voice. Please try again.");
      
      // Give a friendly fallback response using the browser's speech synthesis
      const fallbackMsg = new SpeechSynthesisUtterance(
        settings.language === 'german'
          ? "Entschuldigung, ich konnte dich nicht verstehen. Bitte versuche es noch einmal."
          : "Sorry, I couldn't understand you. Please try again."
      );
      fallbackMsg.lang = settings.language === 'german' ? 'de-DE' : 'en-US';
      window.speechSynthesis.speak(fallbackMsg);
    } finally {
      setIsLoading(false);
    }
  }, [settings, conversationMessages, resetConversationIfNeeded, scheduleConversationReset]);
  
  // Clear conversation (can be called manually)
  const clearConversation = useCallback(() => {
    console.log("Manually clearing conversation");
    setConversationMessages([]);
    toast.info("Started a new conversation");
  }, []);

  // Reset conversation when settings change (important for language changes)
  useEffect(() => {
    // Reset conversation when language changes to avoid mixing languages in the same conversation
    if (conversationMessages.length > 0) {
      console.log("Settings changed, resetting conversation");
      setConversationMessages([]);
    }
  }, [settings.language, settings.gender]);

  // Function to initialize audio context (important for iOS)
  const initAudioContext = useCallback(() => {
    // Create audio context to initialize audio system (important for iOS)
    try {
      // @ts-ignore - AudioContext may not be defined in all environments
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const audioContext = new AudioContext();
        
        // On iOS, we need to resume the audio context after creation
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        
        // Create a silent oscillator to activate the audio system
        const oscillator = audioContext.createOscillator();
        oscillator.connect(audioContext.destination);
        oscillator.start(0);
        oscillator.stop(0.001); // Short duration
        
        console.log("AudioContext initialized successfully");
        return true;
      }
    } catch (e) {
      console.error('Error initializing audio context:', e);
    }
    return false;
  }, []);

  useEffect(() => {
    // Create an audio element for playback
    audioRef.current = new Audio();
    
    // For iOS, we need to set up the audio element to be ready to play
    if (isIOS()) {
      if (audioRef.current) {
        // iOS needs a user gesture to enable audio
        audioRef.current.setAttribute('playsinline', '');
        audioRef.current.setAttribute('webkit-playsinline', '');
        audioRef.current.muted = false;
        audioRef.current.volume = 1.0;
        
        // Add a silent audio source and try to play it to unlock audio
        audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjM1LjEwNAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABBgCVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWV//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU5AAAAAAAAAAAAAAAAJAxBAAAAAAAAATYIWCRPAAA=';
        audioRef.current.load();
        audioRef.current.play().catch(e => console.log('Initial silent play failed, expected on iOS:', e));
      }
      
      // For iOS, initialize audio context with user interaction - be aggressive about it
      const handleUserInteraction = () => {
        console.log("User interaction detected - initializing audio on iOS");
        if (!audioInitializedRef.current) {
          audioInitializedRef.current = initAudioContext();
          // Also try to init mic on user interaction (iOS requires this)
          initializeMicrophone().then(success => {
            console.log("iOS microphone initialization on interaction:", success ? "success" : "failed");
          });
          
          // Try to actually play something silent to unlock audio
          if (audioRef.current) {
            audioRef.current.play().catch(e => console.log('Play during interaction failed:', e));
          }
        }
      };
      
      // Add event listeners for user interaction
      document.addEventListener('touchstart', handleUserInteraction);
      document.addEventListener('click', handleUserInteraction);
      
      return () => {
        document.removeEventListener('touchstart', handleUserInteraction);
        document.removeEventListener('click', handleUserInteraction);
      };
    } else {
      // Non-iOS devices - initialize microphone on mount
      initializeMicrophone();
    }
    
    return () => {
      // Clean up
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Clean up the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Clear any conversation timeout
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
      }
    };
  }, [initAudioContext]);

  // Function to initialize microphone
  const initializeMicrophone = async () => {
    try {
      console.log("Initializing microphone");
      
      // iOS Safari specific constraints
      const constraints = {
        audio: {
          // Specific settings that work better on iOS
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Add these for iOS to encourage higher quality
          sampleRate: 44100,
          channelCount: 1,
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      console.log("Microphone initialized successfully");
      
      // For Safari/iOS, create a silent recorder to fully initialize the system
      try {
        // Try the most compatible format for iOS first
        const mimeType = isIOS() ? 'audio/mp4' : 'audio/webm';
        console.log(`Using mime type: ${mimeType} for test recorder`);
        
        const testRecorder = new MediaRecorder(stream, { mimeType });
        testRecorder.start();
        setTimeout(() => {
          testRecorder.stop();
        }, 100);
      } catch (e) {
        console.warn('Test recorder failed, trying without mime type', e);
        // Try without mimeType specification (let browser choose)
        const testRecorder = new MediaRecorder(stream);
        testRecorder.start();
        setTimeout(() => {
          testRecorder.stop();
        }, 100);
      }
      
      return true;
    } catch (error) {
      console.error('Error initializing microphone:', error);
      toast.error("Could not access microphone. Please ensure permissions are granted in your browser settings and try again.");
      return false;
    }
  };

  const startRecording = async () => {
    setAudioBlob(null);
    audioChunksRef.current = [];
    
    try {
      console.log(`Starting recording (first time: ${isFirstRecordRef.current}, iOS: ${isIOS()}, Safari: ${isSafari()})`);
      
      // iOS specific handling
      if (isIOS() && !audioInitializedRef.current) {
        audioInitializedRef.current = initAudioContext();
      }
      
      // Always request microphone access on start for iOS
      if (isIOS() || !streamRef.current) {
        const success = await initializeMicrophone();
        if (!success) {
          throw new Error("Could not access microphone. Please check permissions.");
        }
      }
      
      // Use existing stream if available, otherwise request new one
      let stream = streamRef.current;
      if (!stream || stream.getTracks().some(track => !track.enabled || track.readyState !== 'live')) {
        console.log("Getting new media stream");
        const success = await initializeMicrophone();
        if (!success) {
          throw new Error("Could not access microphone. Please check permissions.");
        }
        stream = streamRef.current;
        if (!stream) {
          throw new Error("Could not initialize audio stream");
        }
      }
      
      let mimeType: string;
      let recorderOptions: MediaRecorderOptions = {};
      
      // Define default audio settings for better quality
      if (isIOS()) {
        // iOS-specific settings for better audio quality
        recorderOptions = {
          audioBitsPerSecond: 128000, // 128kbps is a good balance
        };
      }
      
      try {
        // Choose the most compatible format based on platform
        if (isIOS()) {
          // For iOS try formats in this order - these are most likely to work with Whisper API
          const iosFormats = ['audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav'];
          let formatFound = false;
          
          for (const format of iosFormats) {
            try {
              if (MediaRecorder.isTypeSupported(format)) {
                mimeType = format;
                recorderOptions.mimeType = format;
                formatFound = true;
                console.log(`Found supported iOS format: ${format}`);
                break;
              }
            } catch (e) {
              console.warn(`Format check failed for ${format}`, e);
            }
          }
          
          if (!formatFound) {
            console.log("Using default format for iOS");
          }
        } else {
          // Non-iOS devices - prefer webm
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
            recorderOptions.mimeType = mimeType;
          }
        }
        
        // Create the MediaRecorder with the determined options
        if (recorderOptions.mimeType) {
          console.log(`Creating MediaRecorder with mimeType: ${recorderOptions.mimeType}`);
          mediaRecorderRef.current = new MediaRecorder(stream, recorderOptions);
        } else {
          // Let the browser choose the format
          console.log("Creating MediaRecorder with default settings");
          mediaRecorderRef.current = new MediaRecorder(stream);
        }
      } catch (e) {
        console.warn(`Failed to create MediaRecorder with specified settings, trying alternative options`, e);
        
        try {
          // Last resort - create with default settings
          mediaRecorderRef.current = new MediaRecorder(stream);
          console.log("Created MediaRecorder with default settings");
        } catch (fallbackError) {
          console.error("Critical error creating MediaRecorder:", fallbackError);
          throw new Error("Your browser doesn't support audio recording in a compatible format. Please try a different browser.");
        }
      }
      
      console.log(`MediaRecorder created with mimeType: ${mediaRecorderRef.current.mimeType || 'default'}`);
      
      // Register data available handler
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log(`Data available event, size: ${event.data.size}, type: ${event.data.type}`);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        } else {
          console.warn("Received empty audio chunk");
        }
      };
      
      // Register stop event handler
      mediaRecorderRef.current.onstop = async () => {
        console.log(`Recording stopped, chunks: ${audioChunksRef.current.length}`);
        
        // Ensure data is available before proceeding
        if (audioChunksRef.current.length > 0) {
          try {
            // Filter out zero-size chunks
            const validChunks = audioChunksRef.current.filter(chunk => chunk.size > 0);
            
            if (validChunks.length === 0) {
              throw new Error("No valid audio data recorded. Please try again and speak louder.");
            }
            
            // Get the actual MIME type from the first chunk or use a known compatible type
            let actualType = validChunks[0].type;
            
            // If we're on iOS and the type is not recognized or empty, use a compatible format
            if (isIOS() && (!actualType || actualType === 'audio/octet-stream')) {
              actualType = 'audio/mp3'; // Changed from 'm4a' to 'mp3' for better compatibility
            } else if (!actualType) {
              actualType = isIOS() ? 'audio/mp3' : 'audio/webm';
            }
            
            console.log(`Creating blob with type: ${actualType}`);
            
            // Create the blob with the detected type
            const blob = new Blob(validChunks, { type: actualType });
            console.log(`Created blob of size: ${blob.size} and type: ${blob.type}`);
            
            // Minimum size check - 1KB is usually too small to be valid audio
            if (blob.size < 1024) {
              throw new Error("The recorded audio is too short. Please try again and speak clearly.");
            }
            
            // Process the audio
            await processAudio(blob);
          } catch (error) {
            console.error("Error processing recording:", error);
            toast.error(error instanceof Error ? error.message : "Error processing recording. Please try again.");
          }
        } else {
          toast.error("No audio recorded. Please try speaking louder and ensure your microphone is working properly.");
        }
      };
      
      // Set up error handler
      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        toast.error("Recording error occurred. Please try again.");
        setIsRecording(false);
      };
      
      // Start recording with short timeslice to get data frequently
      // iOS works better with shorter timeslices
      const timeslice = isIOS() ? 200 : 1000;  // Even shorter for iOS
      mediaRecorderRef.current.start(timeslice);
      setIsRecording(true);
      
      // For iOS, request data more frequently to avoid large chunks
      if (isIOS()) {
        // Clean up any existing interval first
        if (dataRequestIntervalRef.current) {
          clearInterval(dataRequestIntervalRef.current);
          dataRequestIntervalRef.current = null;
        }
        
        // Create new data request interval
        dataRequestIntervalRef.current = setInterval(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log("Requesting data chunk for iOS");
            mediaRecorderRef.current.requestData();
          } else {
            // Automatically clean up if recorder is no longer active
            if (dataRequestIntervalRef.current) {
              clearInterval(dataRequestIntervalRef.current);
              dataRequestIntervalRef.current = null;
            }
          }
        }, 500); // Request data every 500ms on iOS
        
        // Clean up interval after 30 seconds max (typical max recording time)
        setTimeout(() => {
          if (dataRequestIntervalRef.current) {
            clearInterval(dataRequestIntervalRef.current);
            dataRequestIntervalRef.current = null;
          }
        }, 30000);
      } else if (isFirstRecordRef.current) {
        // Just for the first recording on non-iOS
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log("Requesting first data chunk");
            mediaRecorderRef.current.requestData();
            isFirstRecordRef.current = false;
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error(typeof error === 'object' && error !== null && 'message' in error 
        ? (error as Error).message 
        : "Could not access microphone. Please check permissions in your browser settings.");
      setIsRecording(false);
    }
  };
  
  const stopRecording = () => {
    console.log("Stopping recording");
    
    // Clear data request interval first
    if (dataRequestIntervalRef.current) {
      clearInterval(dataRequestIntervalRef.current);
      dataRequestIntervalRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        // Request data before stopping (important for getting final chunks)
        mediaRecorderRef.current.requestData();
        
        // On iOS, we need a bit more time to make sure we collect all data
        const stopDelay = isIOS() ? 500 : 200;
        console.log(`Using stop delay of ${stopDelay}ms`);
        
        // Short delay to ensure data is available
        setTimeout(() => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            
            // For iOS, sometimes we need to collect data after stop
            if (isIOS()) {
              // Give a bit more time for data to be processed after stop
              setTimeout(() => {
                console.log("iOS post-stop data check");
                
                // Final sanity check
                if (audioChunksRef.current.length === 0 || 
                   audioChunksRef.current.every(chunk => chunk.size === 0)) {
                  console.warn("No valid audio chunks after recording stopped");
                  toast.error("No audio data was captured. Please try again and speak clearly.");
                }
              }, 300);
            }
          }
          setIsRecording(false);
        }, stopDelay);
      } catch (error) {
        console.error("Error stopping recorder:", error);
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };
  
  // Add event listeners for page visibility and unload to properly release microphone
  useEffect(() => {
    // Handler for when the page is hidden or being unloaded
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('Page is hidden, releasing audio resources');
        
        // If recording is in progress, stop it
        if (isRecording) {
          stopRecording();
        }
        
        // Release resources when page is hidden
        releaseAudioResources();
      }
    };
    
    // Handler for page unload
    const handleBeforeUnload = () => {
      console.log('Page is being unloaded, releasing audio resources');
      releaseAudioResources();
    };
    
    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Add page unload listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload); // Especially important for iOS
    
    return () => {
      // Remove listeners on cleanup
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [isRecording, stopRecording, releaseAudioResources]);

  // Function to start a random conversation
  const startRandomConversation = useCallback(async () => {
    if (isRecording || isLoading) {
      return; // Don't start if already recording or processing
    }
    
    setIsLoading(true);
    
    try {
      // Check if conversation should be reset due to timeout
      resetConversationIfNeeded();
      
      // Get API key from environment variable or settings
      const apiKey = getOpenAIApiKey() || settings.apiKey;
      
      // Check if API key is provided
      if (!apiKey) {
        throw new Error("Please provide an OpenAI API key in the settings");
      }
      
      // Get a random conversation starter based on the language
      const conversationStarter = getRandomConversationStarter(settings.language);
      
      // 2. Get system prompt for random conversations
      const promptForRandomConversation = RANDOM_CONVERSATION_PROMPT[settings.language];
      const childName = settings.name ? `\n\nThe child's name is ${settings.name}.` : '';
      const languageContext = settings.language === 'german' ? "Please respond in German." : "Please respond in English.";
      
      // System message for the model
      const systemMessage: ConversationMessage = {
        role: 'system',
        content: `${promptForRandomConversation}${childName} ${languageContext} Keep responses short and engaging for children.`
      };
      
      // Add random conversation starter as user message
      const userMessage: ConversationMessage = {
        role: 'user',
        content: conversationStarter
      };
      
      // Prepare messages array for the API call
      let messages: ConversationMessage[] = [
        systemMessage,
        userMessage
      ];
      
      // Choose the right model
      const useAudioOutput = true; // Set to false to use only text output
      const model = useAudioOutput ? 'gpt-4o-audio-preview' : 'gpt-4o-mini';
      
      // Prepare the request body
      const requestBody: any = {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      };
      
      // Add audio settings only if using audio output
      if (useAudioOutput) {
        requestBody.modalities = ["text", "audio"];
        requestBody.audio = { 
          voice: settings.gender === 'girl' ? 'shimmer' : (settings.gender === 'boy' ? 'echo' : 'alloy'), 
          format: 'mp3'
        };
      }
      
      console.log("Starting random conversation with topic:", conversationStarter);
      console.log("Sending chat completion request with messages:", requestBody.messages);
      
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!chatResponse.ok) {
        const errorData = await chatResponse.json();
        throw new Error(`Error from OpenAI: ${errorData.error?.message || 'Unknown error'}`);
      }
      
      const chatData = await chatResponse.json();
      const responseText = chatData.choices[0]?.message?.content || "";
      
      // Add user and assistant messages to conversation history
      const newUserMessage: ConversationMessage = { role: 'user', content: conversationStarter };
      
      // Check if there's an audio ID in the response
      let newAssistantMessage: ConversationMessage = { 
        role: 'assistant', 
        content: responseText
      };
      
      // Extract audio ID if available for future multi-turn conversations
      if (chatData.choices[0]?.message?.audio?.id) {
        const audioId = chatData.choices[0].message.audio.id;
        console.log("Received audio ID for conversation continuity:", audioId);
        newAssistantMessage.audio = { id: audioId };
        
        // If content is null (which can happen with audio responses), use the transcript
        if (newAssistantMessage.content === null && chatData.choices[0].message.audio?.transcript) {
          newAssistantMessage.content = chatData.choices[0].message.audio.transcript;
        }
      }
      
      // Update conversation history
      const updatedConversation = [
        newUserMessage,
        newAssistantMessage
      ];
      setConversationMessages(updatedConversation);
      
      // Schedule conversation reset
      scheduleConversationReset();
      
      // Get the audio data from the response if available
      if (useAudioOutput && chatData.choices[0]?.message?.audio?.data) {
        // Convert base64 to blob
        const audioData = chatData.choices[0].message.audio.data;
        const audioBytes = atob(audioData);
        const audioArrayBuffer = new ArrayBuffer(audioBytes.length);
        const audioBufferView = new Uint8Array(audioArrayBuffer);
        
        for (let i = 0; i < audioBytes.length; i++) {
          audioBufferView[i] = audioBytes.charCodeAt(i);
        }
        
        const audioResponseBlob = new Blob([audioArrayBuffer], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioResponseBlob);
        
        // Play the audio - special handling for iOS Safari
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          
          try {
            // For iOS Safari, we need to play in response to a user gesture
            await audioRef.current.play();
          } catch (playError) {
            console.error('Error playing audio:', playError);
            // Fallback to browser speech synthesis
            const msg = new SpeechSynthesisUtterance(responseText);
            msg.lang = settings.language === 'german' ? 'de-DE' : 'en-US';
            window.speechSynthesis.speak(msg);
          }
        }
      } else {
        // Fallback to browser's speech synthesis if no audio is returned
        const msg = new SpeechSynthesisUtterance(responseText);
        msg.lang = settings.language === 'german' ? 'de-DE' : 'en-US';
        msg.pitch = 1.2;
        msg.rate = 0.9;
        window.speechSynthesis.speak(msg);
      }
      
    } catch (error: any) {
      console.error('Error starting random conversation:', error);
      toast.error(error.message || "Error processing the random conversation request.");
      
      // Give a friendly fallback response using the browser's speech synthesis
      const fallbackMsg = new SpeechSynthesisUtterance(
        settings.language === 'german'
          ? "Entschuldigung, ich konnte keine zufällige Unterhaltung starten. Bitte versuche es noch einmal."
          : "Sorry, I couldn't start a random conversation. Please try again."
      );
      fallbackMsg.lang = settings.language === 'german' ? 'de-DE' : 'en-US';
      window.speechSynthesis.speak(fallbackMsg);
    } finally {
      setIsLoading(false);
    }
  }, [settings, resetConversationIfNeeded, scheduleConversationReset]);
  
  return {
    isRecording,
    isLoading,
    startRecording,
    stopRecording,
    startRandomConversation,
    stream: streamRef.current,
    clearConversation,
    hasActiveConversation: conversationMessages.length > 0,
  };
};

export default useAudioChat;
