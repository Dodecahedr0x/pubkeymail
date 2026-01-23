'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/providers';
import styles from './Sidebar.module.css';

const navItems = [
  { href: '/mailbox', label: 'Inbox', icon: '📥' },
  { href: '/mailbox/sent', label: 'Sent', icon: '📤' },
  { href: '/mailbox/compose', label: 'Compose', icon: '✏️', paidOnly: true },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  const isPaid = user?.subscriptionTier === 'paid';

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };
  
  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.logo}>
        <Link href="/">
          <span>📬</span> PubKeyMail
        </Link>
      </div>
      
      <nav className={styles.nav}>
        {navItems.map((item) => {
          if (item.paidOnly && !isPaid) return null;
          
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={handleNavClick}
            >
              <span className={styles.icon}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      <div className={styles.userSection}>
        {user && (
          <>
            <div className={styles.address}>
              {user.primaryAddress.slice(0, 8)}...
            </div>
            <div className={styles.tier}>
              {user.subscriptionTier === 'paid' ? '⭐ Pro' : 'Free'}
            </div>
            {user.subscriptionTier !== 'paid' && (
              <Link href="/settings/upgrade" className={styles.upgradeLink}>
                Upgrade to Pro
              </Link>
            )}
            <button onClick={logout} className={styles.logoutBtn}>
              Sign Out
            </button>
          </>
        )}
      </div>
      </aside>
    </>
  );
}
