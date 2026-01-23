'use client';

import Link from 'next/link';
import type { Email } from '@/lib/api/emails';
import styles from './EmailList.module.css';

interface Props {
  emails: Email[];
  total: number;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function EmailList({ emails, total, loading, onLoadMore, hasMore }: Props) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };
  
  if (loading && emails.length === 0) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
        <p>Loading emails...</p>
      </div>
    );
  }
  
  if (emails.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📭</span>
        <h3>No emails yet</h3>
        <p>Your inbox is empty. Emails sent to your wallet address will appear here.</p>
      </div>
    );
  }
  
  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <span>{total} email{total !== 1 ? 's' : ''}</span>
      </div>
      
      {emails.map((email) => (
        <Link
          key={email.id}
          href={`/mailbox/${email.id}`}
          className={`${styles.emailItem} ${!email.read ? styles.unread : ''}`}
        >
          <div className={styles.sender}>{email.from}</div>
          <div className={styles.content}>
            <span className={styles.subject}>{email.subject || '(No subject)'}</span>
            <span className={styles.preview}>
              {email.bodyText?.slice(0, 100) || ''}
            </span>
          </div>
          <div className={styles.date}>{formatDate(email.receivedAt)}</div>
        </Link>
      ))}
      
      {hasMore && (
        <button
          className={styles.loadMore}
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
