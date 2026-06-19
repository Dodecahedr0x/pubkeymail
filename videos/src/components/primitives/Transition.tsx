import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

interface TransitionProps {
  children: React.ReactNode;
  type?: 'fade' | 'slide' | 'zoom' | 'wipe';
  direction?: 'left' | 'right' | 'up' | 'down';
  durationInFrames?: number;
}

export const TransitionIn: React.FC<TransitionProps> = ({
  children,
  type = 'fade',
  direction = 'up',
  durationInFrames = 20,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const getStyle = (): React.CSSProperties => {
    switch (type) {
      case 'slide': {
        const offsets = {
          left: { x: -100, y: 0 },
          right: { x: 100, y: 0 },
          up: { x: 0, y: 100 },
          down: { x: 0, y: -100 },
        };
        const offset = offsets[direction];
        return {
          opacity: progress,
          transform: `translate(${offset.x * (1 - progress)}%, ${offset.y * (1 - progress)}%)`,
        };
      }
      case 'zoom':
        return {
          opacity: progress,
          transform: `scale(${0.8 + 0.2 * progress})`,
        };
      case 'wipe': {
        const clipPaths = {
          left: `inset(0 ${100 - progress * 100}% 0 0)`,
          right: `inset(0 0 0 ${100 - progress * 100}%)`,
          up: `inset(${100 - progress * 100}% 0 0 0)`,
          down: `inset(0 0 ${100 - progress * 100}% 0)`,
        };
        return {
          clipPath: clipPaths[direction],
        };
      }
      case 'fade':
      default:
        return { opacity: progress };
    }
  };

  return <div style={getStyle()}>{children}</div>;
};

export const TransitionOut: React.FC<TransitionProps & { startFrame: number }> = ({
  children,
  type = 'fade',
  direction = 'up',
  durationInFrames = 20,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(Easing.cubic),
    }
  );

  const getStyle = (): React.CSSProperties => {
    switch (type) {
      case 'slide': {
        const offsets = {
          left: { x: -100, y: 0 },
          right: { x: 100, y: 0 },
          up: { x: 0, y: -100 },
          down: { x: 0, y: 100 },
        };
        const offset = offsets[direction];
        return {
          opacity: progress,
          transform: `translate(${offset.x * (1 - progress)}%, ${offset.y * (1 - progress)}%)`,
        };
      }
      case 'zoom':
        return {
          opacity: progress,
          transform: `scale(${0.8 + 0.2 * progress})`,
        };
      case 'fade':
      default:
        return { opacity: progress };
    }
  };

  return <div style={getStyle()}>{children}</div>;
};
