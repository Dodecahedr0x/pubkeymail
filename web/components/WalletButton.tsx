'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/providers';
import styles from './WalletButton.module.css';

export function WalletButton() {
  const { connected, publicKey, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { isAuthenticated, login, logout, isLoading, user } = useAuth();
  
  const handleClick = async () => {
    if (!connected) {
      setVisible(true);
    } else if (!isAuthenticated) {
      await login();
    } else {
      logout();
    }
  };
  
  const getButtonText = () => {
    if (connecting || isLoading) return 'Connecting...';
    if (isAuthenticated && user) {
      const addr = user.primaryAddress;
      return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    }
    if (connected && publicKey) {
      return 'Sign In';
    }
    return 'Connect Wallet';
  };
  
  return (
    <button 
      className={`${styles.walletButton} ${isAuthenticated ? styles.connected : ''}`}
      onClick={handleClick}
      disabled={connecting || isLoading}
    >
      {(connecting || isLoading) && <span className="spinner" />}
      {getButtonText()}
    </button>
  );
}
