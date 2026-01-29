import React from 'react';
import { useSlideIn } from '@/hooks/useAnimatedValue';

interface SidebarAdapterProps {
  delay?: number;
  activeItem?: 'inbox' | 'sent' | 'compose';
}

export const SidebarAdapter: React.FC<SidebarAdapterProps> = ({
  delay = 0,
  activeItem = 'inbox',
}) => {
  const { x, opacity } = useSlideIn('left', delay, 20);

  const items = [
    { id: 'inbox', label: 'Inbox', count: 12 },
    { id: 'sent', label: 'Sent', count: 0 },
    { id: 'compose', label: 'Compose', count: 0 },
  ] as const;

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${x}px)`,
        width: 240,
        background: '#1a1a2e',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: activeItem === item.id ? '#512da8' : 'transparent',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            fontWeight: activeItem === item.id ? 600 : 400,
          }}
        >
          <span>{item.label}</span>
          {item.count > 0 && (
            <span
              style={{
                background: '#14F195',
                color: '#0a0a0a',
                borderRadius: 10,
                padding: '2px 8px',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {item.count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
