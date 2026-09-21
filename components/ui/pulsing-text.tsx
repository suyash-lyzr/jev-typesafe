'use client';

import React, { useEffect, useState } from 'react';

interface PulsingTextProps {
  text: string;
  duration?: number; // Animation duration in ms
  charDelay?: number; // Delay between characters in ms
  className?: string;
  paused?: boolean;
  isComplete?: boolean; // To show completion state
}

export const PulsingText: React.FC<PulsingTextProps> = ({
  text,
  duration = 2000,
  charDelay = 30,
  className = '',
  paused = false,
  isComplete = false
}) => {
  const [chars, setChars] = useState<string[]>([]);

  useEffect(() => {
    // Split text into characters
    setChars(text.split(''));
  }, [text]);

  useEffect(() => {
    // Add styles if not already present
    if (!document.getElementById('pulsing-text-styles')) {
      const style = document.createElement('style');
      style.id = 'pulsing-text-styles';
      style.textContent = `
        @keyframes pulseWave {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1) translateY(0);
          }
          50% {
            opacity: 1;
            transform: scale(1.02) translateY(-0.5px);
          }
        }

        .pulsing-text-container {
          display: inline-flex;
          align-items: baseline;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        }

        .pulsing-text-char {
          display: inline-block;
          transition: all 0.3s ease;
        }

        .pulsing-text-char.animating {
          animation: pulseWave infinite;
          animation-fill-mode: both;
        }

        .pulsing-text-char.complete {
          opacity: 1;
          color: inherit;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <span className={`pulsing-text-container ${className}`}>
      {chars.map((char, index) => (
        <span
          key={index}
          className={`pulsing-text-char ${!isComplete ? 'animating' : 'complete'}`}
          style={{
            animationName: !isComplete ? 'pulseWave' : 'none',
            animationDuration: !isComplete ? `${duration}ms` : '0ms',
            animationIterationCount: !isComplete ? 'infinite' : '0',
            animationDelay: !isComplete ? `${index * charDelay}ms` : '0ms',
            animationFillMode: 'both',
            animationPlayState: paused ? 'paused' : 'running'
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
};

export default PulsingText;