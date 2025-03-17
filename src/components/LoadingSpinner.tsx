
import React from 'react';
import { Rabbit } from 'lucide-react';

const LoadingSpinner = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 bg-kids-blue rounded-full opacity-20 animate-pulse-scale"></div>
        <Rabbit className="w-24 h-24 text-kids-blue animate-bounce-slight" />
      </div>
    </div>
  );
};

export default LoadingSpinner;
