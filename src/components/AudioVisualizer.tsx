import React, { useRef, useEffect, useState } from 'react';

interface AudioVisualizerProps {
  stream?: MediaStream | null;
}

// Random heights for idle animation
const getRandomHeight = () => {
  return 10 + Math.random() * 25;
};

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream }) => {
  const [audioData, setAudioData] = useState<number[]>(Array(12).fill(0).map(() => getRandomHeight()));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Initialize the audio analyzer
  useEffect(() => {
    // Create audio analyzer if we have a stream
    if (stream) {
      try {
        // Create audio context
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        
        // Create analyzer
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        // Connect the stream to the analyzer
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        // Set up the data array
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        dataArrayRef.current = dataArray;
        
        // Start the animation
        const updateVisualization = () => {
          if (analyserRef.current && dataArrayRef.current) {
            analyserRef.current.getByteFrequencyData(dataArrayRef.current);
            
            // Get 12 equally spaced points from the data
            const step = Math.floor(dataArrayRef.current.length / 12);
            const newData = Array(12).fill(0).map((_, i) => {
              const value = dataArrayRef.current ? dataArrayRef.current[i * step] : 0;
              // Scale the value to a nice height (between 5 and 50 pixels)
              return 5 + (value / 255) * 45;
            });
            
            setAudioData(newData);
          } else {
            // If no analyzer, just show random heights for a nice idle animation
            setAudioData(prev => 
              prev.map((val, i) => {
                // Slowly fluctuate around current value
                const newVal = val + (Math.random() * 6 - 3);
                // Keep within reasonable bounds
                return Math.max(5, Math.min(40, newVal));
              })
            );
          }
          
          animationFrameRef.current = requestAnimationFrame(updateVisualization);
        };
        
        updateVisualization();
      } catch (err) {
        console.error('Error setting up audio visualization:', err);
        // Fall back to fake visualization
        startFakeVisualization();
      }
    } else {
      // If no stream, just animate randomly
      startFakeVisualization();
    }
    
    return () => {
      // Clean up
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream]);
  
  // Fake visualization with random bars for when we don't have access to the stream
  const startFakeVisualization = () => {
    const animate = () => {
      setAudioData(audioData.map(() => 5 + Math.random() * 35));
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="audio-visualizer absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-64 h-16 flex items-end justify-center gap-1 z-10">
      {audioData.map((height, i) => (
        <div
          key={i}
          className="visualizer-bar rounded-t-md"
          style={{
            height: `${height}px`,
            width: '4px',
            background: `hsl(${180 + i * 15}, 80%, 60%)`, // Rainbow effect from blue to pink
            animation: `wave 0.5s ease infinite ${i * 0.05}s`,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  );
};

export default AudioVisualizer;
