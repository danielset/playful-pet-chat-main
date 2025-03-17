
import React from 'react';

const AudioVisualizer = () => {
  return (
    <div className="wave-group absolute top-[60%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 animate-fade-in">
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
      <div className="wave-bar"></div>
    </div>
  );
};

export default AudioVisualizer;
