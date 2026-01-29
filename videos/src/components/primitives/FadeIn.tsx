import React from 'react';
import { useFadeIn } from '@/hooks/useAnimatedValue';

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: React.CSSProperties;
}

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  delay = 0,
  duration = 15,
  style,
}) => {
  const opacity = useFadeIn(delay, duration);

  return <div style={{ opacity, ...style }}>{children}</div>;
};
