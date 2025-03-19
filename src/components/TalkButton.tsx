import React, { useState, useRef, useEffect } from 'react';
import { Rabbit, Settings } from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import LoadingSpinner from './LoadingSpinner';

interface TalkButtonProps {
  isRecording: boolean;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  stream?: MediaStream | null;
  usingAlternativeRecording?: boolean;
  onToggleRecordingMethod?: () => void;
}

const TalkButton: React.FC<TalkButtonProps> = ({
  isRecording,
  isLoading,
  onStart,
  onStop,
  stream,
  usingAlternativeRecording = false,
  onToggleRecordingMethod,
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Handle mouse events for desktop
  const handleMouseDown = () => {
    setIsPressed(true);
    onStart();
  };

  const handleMouseUp = () => {
    setIsPressed(false);
    onStop();
  };

  // Handle touch events for mobile
  const handleTouchStart = () => {
    setIsPressed(true);
    onStart();
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
    onStop();
  };

  // Safety handler for cases where mouseUp happens outside the button
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isPressed) {
        setIsPressed(false);
        onStop();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [isPressed, onStop]);

  const buttonSize = isPressed ? 'scale-95' : 'scale-100';
  const buttonShadow = isPressed ? 'shadow-sm' : 'shadow-lg';
  
  const buttonClasses = `
    relative w-48 h-48 md:w-56 md:h-56 rounded-full 
    ${buttonShadow} transition-all duration-150 ease-in-out ${buttonSize}
    ${isLoading ? 'bg-kids-yellow' : 'bg-kids-orange'}
    focus:outline-none focus:ring-4 focus:ring-kids-blue
    transform active:scale-95
    cursor-pointer select-none
  `;

  return (
    <div className="flex flex-col items-center justify-center py-6">
      {onToggleRecordingMethod && (
        <div className="mb-4">
          <button
            onClick={onToggleRecordingMethod}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              usingAlternativeRecording 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-800'
            } hover:opacity-90 transition-colors`}
            title="Switch recording method"
          >
            {usingAlternativeRecording ? 'Using Alternative Mode' : 'Using Standard Mode'}
          </button>
          <div className="text-xs text-gray-500 mt-1">
            {usingAlternativeRecording 
              ? "Using WAV audio format (better compatibility)" 
              : "Using MP3/WebM format"}
          </div>
        </div>
      )}
      
      <button
        ref={buttonRef}
        className={buttonClasses}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={isPressed ? handleMouseUp : undefined}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={isLoading}
        aria-label="Push to talk"
      >
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={`transition-all duration-150 ${isPressed ? 'opacity-70 scale-95' : 'opacity-100'}`}>
              <Rabbit className="w-24 h-24 md:w-32 md:h-32 text-white" />
            </div>
          </div>
        )}
      </button>
      
      {isRecording && (
        <div className="mt-4 h-20 w-full flex justify-center items-center">
          <AudioVisualizer stream={stream} />
        </div>
      )}
    </div>
  );
};

export default TalkButton;
