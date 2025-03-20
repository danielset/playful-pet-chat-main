import React, { useState, useEffect, useRef } from 'react';
import TalkButton from '@/components/TalkButton';
import RandomButton from '@/components/RandomButton';
import SettingsPanel, { ChildSettings } from '@/components/SettingsPanel';
import useAudioChat from '@/hooks/useAudioChat';
import { toast } from "sonner";
import { getOpenAIApiKey, isOpenAIApiKeyConfigured } from '@/lib/config/env';
import { ArrowRight } from 'lucide-react';

const Index = () => {
  const [settings, setSettings] = useState<ChildSettings>(() => {
    // Try to load settings from localStorage
    const savedSettings = localStorage.getItem('childSettings');
    // Check if we need to migrate old settings format
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      // If it has the old customPrompt field, remove it
      if ('customPrompt' in parsed) {
        const { customPrompt, ...rest } = parsed;
        // Save the migrated settings back to localStorage
        localStorage.setItem('childSettings', JSON.stringify(rest));
        return rest;
      }
      return parsed;
    }
    
    // Default settings
    return {
      name: '',
      age: '',
      gender: 'other',
      language: 'english',
      apiKey: ''
    };
  });

  // Reference to settings drawer toggle button
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  
  const { 
    isRecording, 
    isLoading, 
    startRecording, 
    stopRecording, 
    startRandomConversation, 
    stream 
  } = useAudioChat(settings);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('childSettings', JSON.stringify(settings));
  }, [settings]);

  // Check if essential settings are configured
  const areSettingsConfigured = () => {
    // Check if API key is available either in env or settings
    const hasApiKey = isOpenAIApiKeyConfigured() || !!settings.apiKey;
    
    // Check if essential child profile settings are filled in
    const hasName = !!settings.name && settings.name.trim() !== '';
    const hasAge = !!settings.age && settings.age.trim() !== '';
    const hasGender = !!settings.gender; // This should always be set as it has a default
    const hasLanguage = !!settings.language; // This should always be set as it has a default
    
    // Return true only if API key AND all profile information is set
    return hasApiKey && hasName && hasAge && hasGender && hasLanguage;
  };
  
  // Handle start recording with settings check
  const handleStartRecording = () => {
    if (!areSettingsConfigured()) {
      // Get the missing settings
      const missingSettings = [];
      if (!settings.name || settings.name.trim() === '') missingSettings.push('Name');
      if (!settings.age || settings.age.trim() === '') missingSettings.push('Age');
      if (!settings.gender) missingSettings.push('Gender');
      if (!settings.language) missingSettings.push('Language');
      if (!isOpenAIApiKeyConfigured() && !settings.apiKey) missingSettings.push('API Key');
      
      // Create a description of what's missing
      const description = missingSettings.length > 0 
        ? `Missing: ${missingSettings.join(', ')}`
        : "Opening settings panel...";
      
      // Show toast notification
      toast.info("Please complete the child profile settings", {
        description,
        duration: 3000,
      });
      
      // Programmatically click the settings button
      setTimeout(() => {
        if (settingsButtonRef.current) {
          settingsButtonRef.current.click();
        }
      }, 500);
      
      return;
    }
    
    // If settings are configured, start recording
    startRecording();
  };

  // Handle random conversation with settings check
  const handleRandomConversation = () => {
    if (!areSettingsConfigured()) {
      // Get the missing settings
      const missingSettings = [];
      if (!settings.name || settings.name.trim() === '') missingSettings.push('Name');
      if (!settings.age || settings.age.trim() === '') missingSettings.push('Age');
      if (!settings.gender) missingSettings.push('Gender');
      if (!settings.language) missingSettings.push('Language');
      if (!isOpenAIApiKeyConfigured() && !settings.apiKey) missingSettings.push('API Key');
      
      // Create a description of what's missing
      const description = missingSettings.length > 0 
        ? `Missing: ${missingSettings.join(', ')}`
        : "Opening settings panel...";
      
      // Show toast notification
      toast.info("Please complete the child profile settings", {
        description,
        duration: 3000,
      });
      
      // Programmatically click the settings button
      setTimeout(() => {
        if (settingsButtonRef.current) {
          settingsButtonRef.current.click();
        }
      }, 500);
      
      return;
    }
    
    // If settings are configured, start random conversation
    startRandomConversation();
  };

  // Store the settings configuration state
  const settingsConfigured = areSettingsConfigured();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative p-4 overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-kids-blue rounded-full opacity-10 blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-kids-orange rounded-full opacity-10 blur-3xl"></div>
      
      {/* Settings pointer label (only shown when settings are not configured) */}
      {!settingsConfigured && (
        <div className="absolute top-8 right-20 bg-kids-orange text-white px-3 py-1 rounded-lg text-sm animate-pulse z-20 shadow-md">
          Complete child profile first
          <div className="absolute top-1/2 -right-6 transform -translate-y-1/2">
            <ArrowRight className="w-5 h-5" />
          </div>
        </div>
      )}
      
      {/* Main content */}
      <main className="w-full max-w-md mx-auto flex flex-col items-center justify-center z-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-kids-blue via-kids-green to-kids-orange">
          Talk to Me!
        </h1>
        
        <div className="w-full p-6 bg-glass rounded-3xl shadow-lg border border-white border-opacity-20">
          <div className="text-center mb-4">
            <p className="text-gray-600">
              {!settingsConfigured 
                ? "Please complete the child profile to start" 
                : isRecording 
                  ? "I'm listening... Click to stop" 
                  : isLoading 
                    ? "Thinking..." 
                    : "Click to start talking"}
            </p>
          </div>
          
          <TalkButton
            isRecording={isRecording}
            isLoading={isLoading}
            onStart={handleStartRecording}
            onStop={stopRecording}
            stream={stream}
            disabled={!settingsConfigured || isLoading}
          />
          
          {/* Random conversation button */}
          <div className="flex justify-center mt-4">
            <div className="relative">
              <RandomButton 
                onClick={handleRandomConversation}
                isLoading={isLoading}
                disabled={!settingsConfigured || isLoading}
              />
              <span className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs text-gray-500">
                Random topic
              </span>
            </div>
          </div>
        </div>
      </main>
      
      {/* Settings panel */}
      <SettingsPanel 
        settings={settings} 
        onSettingsChange={setSettings} 
        buttonRef={settingsButtonRef}
      />
    </div>
  );
};

export default Index;
