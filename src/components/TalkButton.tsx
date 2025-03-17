
import React, { useState } from 'react';
import { Rabbit } from 'lucide-react';
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
  const [isPressed, setIsPressed] = useState(false);

  const handleMouseDown = () => {
    setIsPressed(true);
    onStart();
  };

  const handleMouseUp = () => {
    setIsPressed(false);
    onStop();
  };

  // For touch devices
  const handleTouchStart = () => {
    setIsPressed(true);
    onStart();
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
    onStop();
  };

  const buttonSize = isPressed ? 'scale-95' : 'scale-100';
  const buttonClasses = `
    relative w-48 h-48 md:w-56 md:h-56 rounded-full 
    shadow-lg transition-all duration-200 ease-in-out ${buttonSize}
    ${isLoading ? 'bg-kids-yellow' : 'bg-kids-orange'}
    focus:outline-none focus:ring-4 focus:ring-kids-blue
  `;

  return (
    <div className="flex items-center justify-center py-10">
      <button
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
            {isRecording && <AudioVisualizer />}
            <div className={`transition-all duration-300 ${isRecording ? 'opacity-70 scale-90' : 'opacity-100'}`}>
              <Rabbit className="w-24 h-24 md:w-32 md:h-32 text-white" />
            </div>
          </div>
        )}
      </button>
    </div>
  );
};

export default TalkButton;
