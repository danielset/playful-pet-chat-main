import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from "sonner";
import { ChildSettings } from '@/components/SettingsPanel';
import { CHILD_CHAT_PROMPT } from '@/lib/config/prompts';
import { getOpenAIApiKey, isOpenAIApiKeyConfigured } from '@/lib/config/env';

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

  // Process audio function (wrapped in useCallback to maintain reference)
  const processAudio = useCallback(async (blob: Blob) => {
    setIsLoading(true);
    
    try {
      // Get API key from environment variable or settings
      const apiKey = getOpenAIApiKey() || settings.apiKey;
      
      // Check if API key is provided
      if (!apiKey) {
        throw new Error("Please provide an OpenAI API key in the settings");
      }
      
      // For iOS/Safari, we need to ensure we're sending a compatible format
      // The Whisper API accepts m4a, mp3, mp4, mpeg, mpga, wav, and webm formats
      let processedBlob = blob;
      let filename = 'recording.webm';
      
      // Determine the appropriate file extension based on MIME type
      if (blob.type.includes('mp4')) {
        filename = 'recording.mp4';
      } else if (blob.type.includes('mp3')) {
        filename = 'recording.mp3';
      } else if (blob.type.includes('wav')) {
        filename = 'recording.wav';
      }
      
      console.log(`Sending audio with filename: ${filename} and type: ${blob.type}`);
      
      // 1. First convert audio to text using OpenAI Whisper API
      const formData = new FormData();
      formData.append('file', processedBlob, filename);
      formData.append('model', 'whisper-1');
      
      // If language is specified, add it to the request
      if (settings.language === 'german') {
        formData.append('language', 'de');
      } else {
        formData.append('language', 'en');
      }
      
      // Log formData details for debugging
      console.log(`Sending audio file of size: ${processedBlob.size} bytes`);
      
      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });
      
      if (!transcriptionResponse.ok) {
        const errorData = await transcriptionResponse.json();
        console.error("Transcription error details:", errorData);
        throw new Error(`Error transcribing audio: ${errorData.error?.message || 'Unknown error'}`);
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
      
      // Choose the right model based on whether we want audio output or not
      // gpt-4o-audio-preview is required for audio modality
      const useAudioOutput = true; // Set to false to use only text output
      const model = useAudioOutput ? 'gpt-4o-audio-preview' : 'gpt-4o-mini';
      
      // Prepare the request body
      const requestBody: any = {
        model: model,
        messages: [
          {
            role: 'system',
            content: `${promptForChild}${childName} ${languageContext} Keep responses short and engaging for children.`
          },
          {
            role: 'user',
            content: transcribedText
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      };
      
      // Add audio settings only if using audio output
      if (useAudioOutput) {
        requestBody.modalities = ["text", "audio"];
        requestBody.audio = { 
          voice: settings.gender === 'girl' ? 'shimmer' : (settings.gender === 'boy' ? 'echo' : 'alloy'), 
          format: 'mp3'
        };
      }
      
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
  }, [settings]);

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
      }
      
      // For iOS, initialize audio context with user interaction
      const handleUserInteraction = () => {
        if (!audioInitializedRef.current) {
          audioInitializedRef.current = initAudioContext();
          // Also try to init mic on user interaction (iOS requires this)
          initializeMicrophone();
        }
      };
      
      // Add event listeners for user interaction
      document.addEventListener('touchstart', handleUserInteraction, { once: true });
      document.addEventListener('click', handleUserInteraction, { once: true });
      
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
      
      try {
        // Choose the most compatible format based on platform
        // For iOS/Safari, use more common formats that Whisper accepts
        if (isIOS()) {
          // Try MP4 format for iOS
          mimeType = 'audio/mp4';
          console.log(`Attempting to use mime type: ${mimeType}`);
          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
        } else {
          // Use WebM for everything else (Chrome, Firefox, etc)
          mimeType = 'audio/webm';
          console.log(`Attempting to use mime type: ${mimeType}`);
          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
        }
      } catch (e) {
        console.warn(`Failed to create MediaRecorder with specified mime type, trying alternative options`, e);
        
        // Try alternative formats in order of preference
        const formats = isIOS() 
          ? ['audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav'] 
          : ['audio/webm', 'audio/ogg', 'audio/wav'];
        
        let success = false;
        
        for (const format of formats) {
          try {
            console.log(`Trying format: ${format}`);
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: format });
            success = true;
            mimeType = format;
            console.log(`Successfully created MediaRecorder with ${format}`);
            break;
          } catch (formatError) {
            console.warn(`Format ${format} not supported`);
          }
        }
        
        if (!success) {
          console.log("Falling back to default format");
          mediaRecorderRef.current = new MediaRecorder(stream);
          mimeType = mediaRecorderRef.current.mimeType;
        }
      }
      
      console.log(`MediaRecorder created with mimeType: ${mimeType || 'default'}`);
      
      // Register data available handler
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log(`Data available event, size: ${event.data.size}, type: ${event.data.type}`);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Register stop event handler
      mediaRecorderRef.current.onstop = async () => {
        console.log(`Recording stopped, chunks: ${audioChunksRef.current.length}`);
        
        // Ensure data is available before proceeding
        if (audioChunksRef.current.length > 0) {
          try {
            // Get the actual MIME type from the first chunk if available
            const actualType = audioChunksRef.current[0].type || (isIOS() ? 'audio/mp4' : 'audio/webm');
            console.log(`Creating blob with type: ${actualType}`);
            
            // Create the blob with the detected type
            const blob = new Blob(audioChunksRef.current, { type: actualType });
            console.log(`Created blob of size: ${blob.size} and type: ${blob.type}`);
            
            // Process the audio directly
            await processAudio(blob);
          } catch (error) {
            console.error("Error processing recording:", error);
            toast.error("Error processing recording. Please try again.");
          }
        } else {
          toast.error("No audio recorded. Please try speaking louder.");
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
      const timeslice = isIOS() ? 300 : 1000;
      mediaRecorderRef.current.start(timeslice);
      setIsRecording(true);
      
      // Request initial data chunk (important for iOS)
      if (isIOS() || isFirstRecordRef.current) {
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        // Request data before stopping
        mediaRecorderRef.current.requestData();
        
        // Short delay to ensure data is available
        setTimeout(() => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
        }, isIOS() ? 300 : 200); // Longer delay for iOS
      } catch (error) {
        console.error("Error stopping recorder:", error);
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };
  
  return {
    isRecording,
    isLoading,
    startRecording,
    stopRecording,
  };
};

export default useAudioChat;
