'use client';

import Link from 'next/link';
import styles from './MobileHeader.module.css';

interface MobileHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function MobileHeader({ isOpen, onToggle }: MobileHeaderProps) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        <span>📬</span> PubKeyMail
      </Link>
      <button
        className={`${styles.hamburger} ${isOpen ? styles.open : ''}`}
        onClick={onToggle}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
      </button>
    </header>
  );
}
