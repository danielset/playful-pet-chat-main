import React, { useState, useEffect } from 'react';
import TalkButton from '@/components/TalkButton';
import SettingsPanel, { ChildSettings } from '@/components/SettingsPanel';
import useAudioChat from '@/hooks/useAudioChat';

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

  const { isRecording, isLoading, startRecording, stopRecording } = useAudioChat(settings);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('childSettings', JSON.stringify(settings));
  }, [settings]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative p-4 overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-kids-blue rounded-full opacity-10 blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-kids-orange rounded-full opacity-10 blur-3xl"></div>
      
      {/* Main content */}
      <main className="w-full max-w-md mx-auto flex flex-col items-center justify-center z-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-kids-blue via-kids-green to-kids-orange">
          Talk to Me!
        </h1>
        
        <div className="w-full p-6 bg-glass rounded-3xl shadow-lg border border-white border-opacity-20">
          <div className="text-center mb-4">
            <p className="text-gray-600">
              {isRecording 
                ? "I'm listening... Click to stop" 
                : isLoading 
                  ? "Thinking..." 
                  : "Click to start talking"}
            </p>
          </div>
          
          <TalkButton
            isRecording={isRecording}
            isLoading={isLoading}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </div>
      </main>
      
      {/* Settings panel */}
      <SettingsPanel settings={settings} onSettingsChange={setSettings} />
    </div>
  );
};

export default Index;
