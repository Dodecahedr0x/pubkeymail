import React from 'react';
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';

interface SidebarAdapterProps {
  delay?: number;
  activeItem?: 'inbox' | 'sent' | 'compose';
}

export const SidebarAdapter: React.FC<SidebarAdapterProps> = ({
  delay = 0,
  activeItem = 'inbox',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 120, mass: 0.6 },
  });

  const items = [
    { id: 'inbox', label: 'Inbox', count: 12, icon: '📥' },
    { id: 'sent', label: 'Sent', count: 0, icon: '📤' },
    { id: 'compose', label: 'Compose', count: 0, icon: '✏️' },
  ] as const;

  return (
    <div
      style={{
        opacity: progress,
        transform: `translateX(${(1 - progress) * -50}px)`,
        width: 280,
        background: 'linear-gradient(180deg, rgba(26, 26, 46, 0.95) 0%, rgba(15, 15, 30, 0.95) 100%)',
        borderRadius: 20,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        border: '2px solid rgba(153, 69, 255, 0.3)',
        boxShadow: '0 0 40px rgba(153, 69, 255, 0.2)',
      }}
    >
      {items.map((item, i) => {
        const isActive = activeItem === item.id;
        const itemProgress = spring({
          frame: frame - delay - i * 5,
          fps,
          config: { damping: 12, stiffness: 150, mass: 0.4 },
        });

        return (
          <div
            key={item.id}
            style={{
              opacity: itemProgress,
              transform: `translateX(${(1 - itemProgress) * 30}px)`,
              padding: '18px 22px',
              borderRadius: 14,
              background: isActive
                ? 'linear-gradient(135deg, #9945FF, #512da8)'
                : 'rgba(255,255,255,0.05)',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 18,
              fontWeight: isActive ? 700 : 500,
              boxShadow: isActive ? '0 0 30px rgba(153, 69, 255, 0.4)' : 'none',
              border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              {item.label}
            </span>
            {item.count > 0 && (
              <span
                style={{
                  background: '#14F195',
                  color: '#0a0a0a',
                  borderRadius: 12,
                  padding: '4px 12px',
                  fontSize: 14,
                  fontWeight: 800,
                  boxShadow: '0 0 15px rgba(20, 241, 149, 0.5)',
                }}
              >
                {item.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
