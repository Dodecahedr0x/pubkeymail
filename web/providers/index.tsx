'use client';

import { ReactNode } from 'react';
import { WalletProvider } from './WalletProvider';
import { AuthProvider } from './AuthProvider';
import { ToastProvider } from './ToastProvider';

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <WalletProvider>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </WalletProvider>
  );
}

export { useAuth } from './AuthProvider';
export { useToast } from './ToastProvider';
