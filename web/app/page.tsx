'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WalletButton } from '@/components/WalletButton';
import { useAuth } from '@/providers';
import styles from './page.module.css';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/mailbox');
    }
  }, [isAuthenticated, isLoading, router]);
  
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>📬</span>
          <h1>PubKeyMail</h1>
        </div>
        
        <p className={styles.tagline}>
          Your wallet address is your email address.
          <br />
          Decentralized email for the blockchain era.
        </p>
        
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔐</span>
            <h3>Wallet Authentication</h3>
            <p>Sign in with your Solana wallet. No passwords needed.</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📧</span>
            <h3>Receive Emails</h3>
            <p>Get emails at your_wallet@pubkeymail.com</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✉️</span>
            <h3>Send Emails</h3>
            <p>Upgrade to send emails from your wallet address.</p>
          </div>
        </div>
        
        <div className={styles.cta}>
          <WalletButton />
        </div>
        
        <p className={styles.note}>
          Currently supporting Solana wallets (Phantom, Solflare)
        </p>
      </div>
    </main>
  );
}
