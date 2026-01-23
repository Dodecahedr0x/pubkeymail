'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/providers';
import { EmailList } from '@/components/EmailList';
import * as emailsApi from '@/lib/api/emails';
import type { Email } from '@/lib/api/emails';
import styles from './page.module.css';

const LIMIT = 50;

export default function InboxPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  
  const fetchEmails = useCallback(async (newOffset = 0, append = false) => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await emailsApi.getMailbox(user.id, LIMIT, newOffset);
      
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
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [user]);
  
  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);
  
  const handleLoadMore = () => {
    fetchEmails(offset + LIMIT, true);
  };
  
  const handleRefresh = () => {
    fetchEmails(0, false);
  };
  
  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <h1>Inbox</h1>
        <button className="btn btn-secondary" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>
      
      {error && (
        <div className={styles.error}>
          {error}
          <button onClick={handleRefresh}>Try again</button>
        </div>
      )}
      
      <EmailList
        emails={emails}
        total={total}
        loading={loading}
        onLoadMore={handleLoadMore}
        hasMore={offset + LIMIT < total}
      />
    </div>
  );
}
