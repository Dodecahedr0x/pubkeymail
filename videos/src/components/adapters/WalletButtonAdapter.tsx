import React from 'react';
import { useFadeIn } from '@/hooks/useAnimatedValue';

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
  const opacity = useFadeIn(delay, 15);

  return (
    <div style={{ opacity }}>
      <button
        style={{
          background: connected
            ? 'linear-gradient(135deg, #14F195, #9945FF)'
            : '#512da8',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {connected ? (
          <>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#14F195',
              }}
            />
            {address}
          </>
        ) : (
          'Connect Wallet'
        )}
      </button>
    </div>
  );
};
