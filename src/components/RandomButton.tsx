import React from 'react';
import { Shuffle } from 'lucide-react';

interface RandomButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

const RandomButton: React.FC<RandomButtonProps> = ({
  onClick,
  isLoading,
  disabled = false,
}) => {
  return (
    <button
      className={`
        w-12 h-12 rounded-full 
        bg-kids-blue text-white
        shadow-md transition-all duration-150 ease-in-out
        hover:bg-kids-blue/90 focus:outline-none focus:ring-2 focus:ring-kids-blue
        transform hover:scale-105 active:scale-95
        cursor-pointer select-none flex items-center justify-center
        ${isLoading || disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onClick={onClick}
      disabled={isLoading || disabled}
      aria-label="Start a random conversation"
      title="Start a random conversation"
    >
      <Shuffle className="w-5 h-5" />
    </button>
  );
};

export default RandomButton; 