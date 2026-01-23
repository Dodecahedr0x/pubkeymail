'use client';

import { ReactNode } from 'react';
import { WalletProvider } from './WalletProvider';
import { AuthProvider } from './AuthProvider';

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <WalletProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </WalletProvider>
  );
}

export { useAuth } from './AuthProvider';
