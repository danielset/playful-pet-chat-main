import React from 'react';
import { Rabbit, MicOff } from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import LoadingSpinner from './LoadingSpinner';

interface TalkButtonProps {
  isRecording: boolean;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
}

const TalkButton: React.FC<TalkButtonProps> = ({
  isRecording,
  isLoading,
  onStart,
  onStop,
}) => {
  // Handle click based on recording state
  const handleClick = () => {
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  // Determine button color based on state
  const buttonColor = isLoading 
    ? 'bg-kids-yellow' 
    : isRecording 
      ? 'bg-kids-red' // Red color when recording
      : 'bg-kids-orange';

  const buttonClasses = `
    relative w-48 h-48 md:w-56 md:h-56 rounded-full 
    shadow-lg transition-all duration-200 ease-in-out 
    ${buttonColor}
    focus:outline-none focus:ring-4 focus:ring-kids-blue
    transform hover:scale-105 active:scale-95
  `;

  return (
    <div className="flex items-center justify-center py-10">
      <button
        className={buttonClasses}
        onClick={handleClick}
        disabled={isLoading}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            {isRecording && <AudioVisualizer />}
            <div className="transition-all duration-300">
              {isRecording ? (
                <div className="relative">
                  <Rabbit className="w-24 h-24 md:w-32 md:h-32 text-white opacity-70" />
                  <MicOff className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 md:w-16 md:h-16 text-white" />
                </div>
              ) : (
                <Rabbit className="w-24 h-24 md:w-32 md:h-32 text-white" />
              )}
            </div>
          </div>
        )}
      </button>
    </div>
  );
};

export default TalkButton;
