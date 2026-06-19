import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, spring, useVideoConfig } from 'remotion';

interface SwingInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'left' | 'right';
  style?: React.CSSProperties;
}

export const SwingIn: React.FC<SwingInProps> = ({
  children,
  delay = 0,
  direction = 'left',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 8, stiffness: 80, mass: 1 },
  });

  const rotate = interpolate(progress, [0, 1], [direction === 'left' ? -90 : 90, 0]);
  const scale = interpolate(progress, [0, 0.5, 1], [0.3, 1.2, 1]);

  return (
    <div
      style={{
        transform: `rotate(${rotate}deg) scale(${scale})`,
        opacity: progress,
        transformOrigin: direction === 'left' ? 'left center' : 'right center',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

interface ElasticPopProps {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}

export const ElasticPop: React.FC<ElasticPopProps> = ({
  children,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 4, stiffness: 150, mass: 0.5 },
  });

  return (
    <div
      style={{
        transform: `scale(${progress})`,
        opacity: Math.min(progress * 2, 1),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

interface FlipInProps {
  children: React.ReactNode;
  delay?: number;
  axis?: 'x' | 'y';
  style?: React.CSSProperties;
}

export const FlipIn: React.FC<FlipInProps> = ({
  children,
  delay = 0,
  axis = 'y',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  const rotate = interpolate(progress, [0, 1], [90, 0]);
  const transform = axis === 'y' ? `rotateY(${rotate}deg)` : `rotateX(${rotate}deg)`;

  return (
    <div
      style={{
        transform,
        opacity: progress,
        perspective: 1000,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

interface ZoomBlurProps {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}

export const ZoomBlur: React.FC<ZoomBlurProps> = ({
  children,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.exp),
  });

  const scale = interpolate(progress, [0, 1], [3, 1]);
  const blur = interpolate(progress, [0, 1], [20, 0]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        filter: `blur(${blur}px)`,
        opacity: progress,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

interface SlideBlastProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  style?: React.CSSProperties;
}

export const SlideBlast: React.FC<SlideBlastProps> = ({
  children,
  delay = 0,
  direction = 'left',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 200, mass: 0.6 },
  });

  const offsets = {
    left: { x: -150, y: 0 },
    right: { x: 150, y: 0 },
    up: { x: 0, y: -150 },
    down: { x: 0, y: 150 },
  };

  const offset = offsets[direction];
  const x = offset.x * (1 - progress);
  const y = offset.y * (1 - progress);
  const rotate = (1 - progress) * (direction === 'left' || direction === 'up' ? -15 : 15);

  return (
    <div
      style={{
        transform: `translate(${x}%, ${y}%) rotate(${rotate}deg)`,
        opacity: progress,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const ScreenFlash: React.FC<{ delay?: number; color?: string }> = ({
  delay = 0,
  color = '#ffffff',
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 5, delay + 15], [0, 0.8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        background: color,
        opacity,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  );
};
