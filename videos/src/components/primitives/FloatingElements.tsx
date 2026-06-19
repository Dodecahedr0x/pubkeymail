import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, random } from 'remotion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  delay: number;
}

interface FloatingParticlesProps {
  count?: number;
  color?: string;
  seed?: string;
}

export const FloatingParticles: React.FC<FloatingParticlesProps> = ({
  count = 20,
  color = '#14F195',
  seed = 'particles',
}) => {
  const frame = useCurrentFrame();

  const particles: Particle[] = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: random(`${seed}-x-${i}`) * 100,
    y: random(`${seed}-y-${i}`) * 100,
    size: random(`${seed}-size-${i}`) * 4 + 2,
    speed: random(`${seed}-speed-${i}`) * 0.5 + 0.2,
    delay: random(`${seed}-delay-${i}`) * 100,
  }));

  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map((p) => {
        const y = ((p.y + (frame + p.delay) * p.speed) % 120) - 10;
        const opacity = interpolate(y, [0, 20, 80, 100], [0, 0.6, 0.6, 0]);
        const wobble = Math.sin((frame + p.delay) * 0.05) * 10;

        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x + wobble * 0.2}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: color,
              opacity: opacity * 0.5,
              boxShadow: `0 0 ${p.size * 2}px ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

interface FloatingIconsProps {
  icons?: string[];
  seed?: string;
}

export const FloatingIcons: React.FC<FloatingIconsProps> = ({
  icons = ['📧', '🔐', '⚡', '💎', '🌐'],
  seed = 'icons',
}) => {
  const frame = useCurrentFrame();

  const items = icons.map((icon, i) => ({
    icon,
    x: random(`${seed}-x-${i}`) * 80 + 10,
    y: random(`${seed}-y-${i}`) * 80 + 10,
    size: random(`${seed}-size-${i}`) * 20 + 30,
    rotateSpeed: (random(`${seed}-rot-${i}`) - 0.5) * 2,
    floatSpeed: random(`${seed}-float-${i}`) * 0.03 + 0.02,
    floatRange: random(`${seed}-range-${i}`) * 20 + 10,
  }));

  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      {items.map((item, i) => {
        const float = Math.sin(frame * item.floatSpeed) * item.floatRange;
        const rotate = frame * item.rotateSpeed;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${item.x}%`,
              top: `${item.y}%`,
              fontSize: item.size,
              transform: `translateY(${float}px) rotate(${rotate}deg)`,
              opacity: 0.15,
            }}
          >
            {item.icon}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
