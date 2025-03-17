import { useState, useRef, useEffect } from 'react';
import { toast } from "sonner";
import { ChildSettings } from '@/components/SettingsPanel';
import { CHILD_CHAT_PROMPT } from '@/lib/config/prompts';
import { getOpenAIApiKey, isOpenAIApiKeyConfigured } from '@/lib/config/env';

const useAudioChat = (settings: ChildSettings) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Create an audio element for playback
    audioRef.current = new Audio();
    
    // Initialize microphone access on mount
    const initializeMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (error) {
        console.error('Error initializing microphone:', error);
      }
    };

    initializeMicrophone();
    
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
  }, []);

  const startRecording = async () => {
    audioChunksRef.current = [];
    
    try {
      // Use existing stream if available, otherwise request new one
      let stream = streamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }
      
      // Create new MediaRecorder instance
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAudioBlob(audioBlob);
        }
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error("Could not access microphone. Please check permissions.");
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // After stopping, we would process the audio
      setTimeout(() => processAudio(), 100); // Small delay to ensure blob is set
    }
  };
  
  const processAudio = async () => {
    if (!audioBlob) {
      toast.error("No audio recorded");
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Get API key from environment variable or settings
      const apiKey = getOpenAIApiKey() || settings.apiKey;
      
      // Check if API key is provided
      if (!apiKey) {
        throw new Error("Please provide an OpenAI API key in the settings");
      }
      
      // 1. First convert audio to text using OpenAI Whisper API
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');
      
      // If language is specified, add it to the request
      if (settings.language === 'german') {
        formData.append('language', 'de');
      } else {
        formData.append('language', 'en');
      }
      
      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });
      
      if (!transcriptionResponse.ok) {
        const errorData = await transcriptionResponse.json();
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
        
        // Play the audio
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          await audioRef.current.play();
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
      setAudioBlob(null);
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
