import { useCurrentFrame, interpolate, Easing } from 'remotion';

interface AnimatedValueOptions {
  start?: number;
  end?: number;
  delay?: number;
  duration?: number;
  easing?: (t: number) => number;
}

export const useAnimatedValue = ({
  start = 0,
  end = 1,
  delay = 0,
  duration = 30,
  easing = Easing.out(Easing.cubic),
}: AnimatedValueOptions = {}) => {
  const frame = useCurrentFrame();

  return interpolate(frame, [delay, delay + duration], [start, end], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
};

export const useFadeIn = (delay = 0, duration = 15) => {
  return useAnimatedValue({ start: 0, end: 1, delay, duration });
};

export const useSlideIn = (
  direction: 'left' | 'right' | 'up' | 'down' = 'up',
  delay = 0,
  duration = 20
) => {
  const offsets = {
    left: { x: -100, y: 0 },
    right: { x: 100, y: 0 },
    up: { x: 0, y: 50 },
    down: { x: 0, y: -50 },
  };

  const offset = offsets[direction];
  const progress = useAnimatedValue({ delay, duration });

  return {
    x: interpolate(progress, [0, 1], [offset.x, 0]),
    y: interpolate(progress, [0, 1], [offset.y, 0]),
    opacity: progress,
  };
};
