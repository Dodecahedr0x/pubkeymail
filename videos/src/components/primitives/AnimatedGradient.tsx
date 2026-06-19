import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface AnimatedGradientProps {
  colors?: string[];
  speed?: number;
  children?: React.ReactNode;
}

export const AnimatedGradient: React.FC<AnimatedGradientProps> = ({
  colors = ['#0a0a1a', '#1a1a3e', '#2a1a4e', '#1a1a3e'],
  speed = 0.5,
  children,
}) => {
  const frame = useCurrentFrame();
  const angle = interpolate(frame * speed, [0, 360], [0, 360]) % 360;

  const gradient = `linear-gradient(${angle}deg, ${colors.join(', ')})`;

  return (
    <AbsoluteFill
      style={{
        background: gradient,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const PulsingGlow: React.FC<{
  color?: string;
  size?: number;
  children?: React.ReactNode;
}> = ({ color = '#14F195', size = 200, children }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.3, 0.8]);
  const scale = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.9, 1.1]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: size,
          height: size,
          transform: `translate(-50%, -50%) scale(${scale})`,
          background: `radial-gradient(circle, ${color}${Math.round(pulse * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          borderRadius: '50%',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
};
