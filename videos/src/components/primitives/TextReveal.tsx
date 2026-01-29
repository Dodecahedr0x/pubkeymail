import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface TextRevealProps {
  text: string;
  delay?: number;
  charDelay?: number;
  style?: React.CSSProperties;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  delay = 0,
  charDelay = 2,
  style,
}) => {
  const frame = useCurrentFrame();

  return (
    <span style={style}>
      {text.split('').map((char, i) => {
        const charStart = delay + i * charDelay;
        const opacity = interpolate(frame, [charStart, charStart + 5], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <span key={i} style={{ opacity }}>
            {char}
          </span>
        );
      })}
    </span>
  );
};
