import React from 'react';
import { useSlideIn } from '@/hooks/useAnimatedValue';

interface SlideInProps {
  children: React.ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  duration?: number;
  style?: React.CSSProperties;
}

export const SlideIn: React.FC<SlideInProps> = ({
  children,
  direction = 'up',
  delay = 0,
  duration = 20,
  style,
}) => {
  const { x, y, opacity } = useSlideIn(direction, delay, duration);

  return (
    <div
      style={{
        opacity,
        transform: `translate(${x}px, ${y}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
