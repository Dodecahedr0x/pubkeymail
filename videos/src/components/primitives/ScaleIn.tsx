import React from 'react';
import { useCurrentFrame, interpolate, Easing, spring, useVideoConfig } from 'remotion';

interface ScaleInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: React.CSSProperties;
}

export const ScaleIn: React.FC<ScaleInProps> = ({
  children,
  delay = 0,
  duration = 20,
  style,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.5)),
  });
  const opacity = interpolate(frame, [delay, delay + duration * 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ transform: `scale(${scale})`, opacity, ...style }}>
      {children}
    </div>
  );
};

interface SpringInProps {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}

export const SpringIn: React.FC<SpringInProps> = ({
  children,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 12,
      stiffness: 200,
      mass: 0.5,
    },
  });

  const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ transform: `scale(${scale})`, opacity, ...style }}>
      {children}
    </div>
  );
};

interface BounceInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: React.CSSProperties;
}

export const BounceIn: React.FC<BounceInProps> = ({
  children,
  delay = 0,
  direction = 'up',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 10,
      stiffness: 100,
      mass: 0.8,
    },
  });

  const offsets = {
    up: { x: 0, y: 50 },
    down: { x: 0, y: -50 },
    left: { x: 50, y: 0 },
    right: { x: -50, y: 0 },
  };

  const offset = offsets[direction];
  const x = offset.x * (1 - progress);
  const y = offset.y * (1 - progress);

  return (
    <div
      style={{
        transform: `translate(${x}px, ${y}px)`,
        opacity: progress,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
