'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers';
import * as emailsApi from '@/lib/api/emails';
import type { SentEmail } from '@/lib/api/emails';
import styles from './page.module.css';

const LIMIT = 50;

export default function SentPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  
  const fetchEmails = useCallback(async (newOffset = 0, append = false) => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await emailsApi.getSentEmails(user.id, LIMIT, newOffset);
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      if (append) {
        setEmails((prev) => [...prev, ...result.data!.emails]);
      } else {
        setEmails(result.data!.emails);
      }
      setTotal(result.data!.total);
      setOffset(newOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sent emails');
    } finally {
      setLoading(false);
    }
  }, [user]);
  
  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);
  
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
  
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      sent: { label: 'Sent', color: 'var(--color-secondary)' },
      delivered: { label: 'Delivered', color: 'var(--color-secondary)' },
      bounced: { label: 'Bounced', color: 'var(--color-danger)' },
      failed: { label: 'Failed', color: 'var(--color-danger)' },
    };
    
    const info = statusMap[status] || { label: status, color: 'var(--text-muted)' };
    return <span style={{ color: info.color }}>{info.label}</span>;
  };
  
  return (
    <div className={styles.sent}>
      <div className={styles.header}>
        <h1>Sent</h1>
        {user?.subscriptionTier === 'paid' && (
          <Link href="/mailbox/compose" className="btn btn-primary">
            ✏️ Compose
          </Link>
        )}
      </div>
      
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}
      
      {loading && emails.length === 0 ? (
        <div className={styles.loading}>
          <div className="spinner" />
          <p>Loading sent emails...</p>
        </div>
      ) : emails.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>📤</span>
          <h3>No sent emails</h3>
          <p>Emails you send will appear here.</p>
          {user?.subscriptionTier === 'paid' && (
            <Link href="/mailbox/compose" className="btn btn-primary">
              Compose Email
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <span>{total} email{total !== 1 ? 's' : ''}</span>
          </div>
          
          {emails.map((email) => (
            <div key={email.id} className={styles.emailItem}>
              <div className={styles.to}>To: {email.to}</div>
              <div className={styles.content}>
                <span className={styles.subject}>{email.subject || '(No subject)'}</span>
              </div>
              <div className={styles.meta}>
                {getStatusBadge(email.deliveryStatus)}
                <span className={styles.date}>{formatDate(email.sentAt)}</span>
              </div>
            </div>
          ))}
          
          {offset + LIMIT < total && (
            <button
              className={styles.loadMore}
              onClick={() => fetchEmails(offset + LIMIT, true)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
