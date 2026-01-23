'use client';

import Link from 'next/link';
import { useAuth } from '@/providers';
import styles from './page.module.css';

export default function SettingsPage() {
  const { user } = useAuth();
  
  if (!user) return null;
  
  return (
    <div className={styles.settings}>
      <h1>Settings</h1>
      
      <section className={styles.section}>
        <h2>Account</h2>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>Wallet Address</span>
            <code className={styles.value}>{user.primaryAddress}</code>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Email Address</span>
            <code className={styles.value}>{user.primaryAddress}@pubkeymail.com</code>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Blockchain</span>
            <span className={styles.value}>{user.blockchain}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Member Since</span>
            <span className={styles.value}>
              {new Date(user.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </section>
      
      <section className={styles.section}>
        <h2>Subscription</h2>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>Current Plan</span>
            <span className={`${styles.value} ${styles.tier}`}>
              {user.subscriptionTier === 'paid' ? '⭐ Pro' : 'Free'}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Status</span>
            <span className={styles.value}>{user.subscriptionStatus}</span>
          </div>
          
          {user.subscriptionTier !== 'paid' && (
            <div className={styles.upgrade}>
              <p>Upgrade to Pro to unlock email sending and more features.</p>
              <Link href="/settings/upgrade" className="btn btn-primary">
                Upgrade to Pro
              </Link>
            </div>
          )}
        </div>
      </section>
      
      <section className={styles.section}>
        <h2>Features</h2>
        <div className={styles.features}>
          <div className={`${styles.feature} ${user.subscriptionTier === 'paid' ? styles.active : ''}`}>
            <span className={styles.featureIcon}>📥</span>
            <span>Receive Emails</span>
            <span className={styles.featureStatus}>✅</span>
          </div>
          <div className={`${styles.feature} ${user.subscriptionTier === 'paid' ? styles.active : styles.locked}`}>
            <span className={styles.featureIcon}>✉️</span>
            <span>Send Emails</span>
            <span className={styles.featureStatus}>
              {user.subscriptionTier === 'paid' ? '✅' : '🔒'}
            </span>
          </div>
          <div className={`${styles.feature} ${user.subscriptionTier === 'paid' ? styles.active : styles.locked}`}>
            <span className={styles.featureIcon}>📂</span>
            <span>Extended Retention (1 year)</span>
            <span className={styles.featureStatus}>
              {user.subscriptionTier === 'paid' ? '✅' : '🔒'}
            </span>
          </div>
          <div className={`${styles.feature} ${user.subscriptionTier === 'paid' ? styles.active : styles.locked}`}>
            <span className={styles.featureIcon}>🔗</span>
            <span>Link Multiple Addresses</span>
            <span className={styles.featureStatus}>
              {user.subscriptionTier === 'paid' ? '✅' : '🔒'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
