import React from 'react';
import { AbsoluteFill } from 'remotion';

interface BackgroundProps {
  color?: string;
  gradient?: string;
  children?: React.ReactNode;
}

export const Background: React.FC<BackgroundProps> = ({
  color = '#0a0a0a',
  gradient,
  children,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: gradient ?? color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const GradientBackground: React.FC<{
  from?: string;
  to?: string;
  angle?: number;
  children?: React.ReactNode;
}> = ({ from = '#1a1a2e', to = '#16213e', angle = 135, children }) => {
  return (
    <Background
      gradient={`linear-gradient(${angle}deg, ${from}, ${to})`}
    >
      {children}
    </Background>
  );
};
