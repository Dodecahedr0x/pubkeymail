import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface TypeWriterProps {
  text: string;
  startFrame?: number;
  speed?: number;
  cursor?: boolean;
  cursorChar?: string;
  style?: React.CSSProperties;
}

export const TypeWriter: React.FC<TypeWriterProps> = ({
  text,
  startFrame = 0,
  speed = 3,
  cursor = true,
  cursorChar = '|',
  style,
}) => {
  const frame = useCurrentFrame();
  const charsToShow = Math.floor(
    interpolate(frame, [startFrame, startFrame + text.length * speed], [0, text.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  const displayText = text.slice(0, charsToShow);
  const showCursor = cursor && frame >= startFrame && charsToShow < text.length;
  const cursorBlink = Math.floor(frame / 15) % 2 === 0;

  return (
    <span style={style}>
      {displayText}
      {showCursor && cursorBlink && (
        <span style={{ opacity: 0.8 }}>{cursorChar}</span>
      )}
    </span>
  );
};

interface GlitchTextProps {
  text: string;
  intensity?: number;
  style?: React.CSSProperties;
}

export const GlitchText: React.FC<GlitchTextProps> = ({
  text,
  intensity = 0.3,
  style,
}) => {
  const frame = useCurrentFrame();
  const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const shouldGlitch = Math.random() < intensity * 0.1;
  const glitchOffset = shouldGlitch ? (Math.random() - 0.5) * 4 : 0;

  const displayText = text
    .split('')
    .map((char, i) => {
      if (Math.random() < intensity * 0.02) {
        return glitchChars[Math.floor(Math.random() * glitchChars.length)];
      }
      return char;
    })
    .join('');

  return (
    <span
      style={{
        ...style,
        transform: `translate(${glitchOffset}px, ${glitchOffset * 0.5}px)`,
        textShadow: shouldGlitch
          ? `${-glitchOffset}px 0 #ff0000, ${glitchOffset}px 0 #00ffff`
          : undefined,
      }}
    >
      {displayText}
    </span>
  );
};
