import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

interface WalletButtonAdapterProps {
  delay?: number;
  connected?: boolean;
  address?: string;
}

export const WalletButtonAdapter: React.FC<WalletButtonAdapterProps> = ({
  delay = 0,
  connected = false,
  address = 'ABC...XYZ',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.5 },
  });

  const pulse = Math.sin(frame * 0.15) * 0.05 + 1;

  return (
    <div style={{ opacity: progress, transform: `scale(${progress})` }}>
      <button
        style={{
          background: connected
            ? 'linear-gradient(135deg, #14F195 0%, #0fa67a 50%, #14F195 100%)'
            : 'linear-gradient(135deg, #9945FF 0%, #512da8 50%, #9945FF 100%)',
          backgroundSize: '200% 200%',
          color: connected ? '#0a0a0a' : 'white',
          border: 'none',
          borderRadius: 16,
          padding: '20px 40px',
          fontSize: 22,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          boxShadow: connected
            ? '0 0 40px rgba(20, 241, 149, 0.5), inset 0 0 20px rgba(255,255,255,0.2)'
            : '0 0 40px rgba(153, 69, 255, 0.5), inset 0 0 20px rgba(255,255,255,0.1)',
          transform: connected ? `scale(${pulse})` : 'scale(1)',
          textTransform: 'uppercase',
          letterSpacing: '2px',
        }}
      >
        {connected ? (
          <>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#0a0a0a',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
              }}
            />
            <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{address}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 24 }}>🔗</span>
            Connect Wallet
          </>
        )}
      </button>
    </div>
  );
};
