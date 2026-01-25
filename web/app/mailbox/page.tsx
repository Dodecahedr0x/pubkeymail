'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/providers';
import { EmailList } from '@/components/EmailList';
import * as emailsApi from '@/lib/api/emails';
import type { Email, MailboxAddress } from '@/lib/api/emails';
import styles from './page.module.css';

const LIMIT = 50;
const AUTO_REFRESH_INTERVAL = 30000;
const AUTO_REFRESH_KEY = 'pubkeymail_auto_refresh';

function formatAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function InboxPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [addresses, setAddresses] = useState<MailboxAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | undefined>(undefined);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(AUTO_REFRESH_KEY);
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });
  const [newEmailCount, setNewEmailCount] = useState(0);
  const lastTotalRef = useRef<number | null>(null);
  
  const fetchEmails = useCallback(async (
    newOffset = 0,
    append = false,
    silent = false,
    sourceAddress?: string
  ) => {
    if (!user) return;
    
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    
    try {
      const result = await emailsApi.getMailbox(user.id, LIMIT, newOffset, sourceAddress);
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      const newTotal = result.data!.total;
      
      if (silent && lastTotalRef.current !== null && newTotal > lastTotalRef.current) {
        setNewEmailCount(newTotal - lastTotalRef.current);
      } else if (!silent) {
        setNewEmailCount(0);
      }
      
      if (!silent) {
        if (append) {
          setEmails((prev) => [...prev, ...result.data!.emails]);
        } else {
          setEmails(result.data!.emails);
        }
        setOffset(newOffset);
        lastTotalRef.current = newTotal;
        
        // Update addresses list (only on initial load)
        if (result.data!.addresses && result.data!.addresses.length > 0 && addresses.length === 0) {
          setAddresses(result.data!.addresses);
        }
      }
      setTotal(newTotal);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load emails');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [user, addresses.length]);
  
  useEffect(() => {
    fetchEmails(0, false, false, selectedAddress);
  }, [selectedAddress]); // eslint-disable-line react-hooks/exhaustive-deps
  
  useEffect(() => {
    if (!autoRefresh || offset > 0) return;
    
    let intervalId: NodeJS.Timeout | null = null;
    
    const startPolling = () => {
      intervalId = setInterval(() => {
        if (!document.hidden) {
          fetchEmails(0, false, true, selectedAddress);
        }
      }, AUTO_REFRESH_INTERVAL);
    };
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        fetchEmails(0, false, true, selectedAddress);
        startPolling();
      }
    };
    
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoRefresh, offset, fetchEmails, selectedAddress]);
  
  const toggleAutoRefresh = () => {
    const newValue = !autoRefresh;
    setAutoRefresh(newValue);
    localStorage.setItem(AUTO_REFRESH_KEY, String(newValue));
  };
  
  const handleLoadMore = () => {
    fetchEmails(offset + LIMIT, true, false, selectedAddress);
  };
  
  const handleRefresh = () => {
    setNewEmailCount(0);
    fetchEmails(0, false, false, selectedAddress);
  };
  
  const handleAddressChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedAddress(value === 'all' ? undefined : value);
    setOffset(0);
    lastTotalRef.current = null;
  };
  
  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <h1>
          Inbox
          {newEmailCount > 0 && (
            <span className={styles.newBadge}>{newEmailCount} new</span>
          )}
        </h1>
        <div className={styles.headerActions}>
          {addresses.length > 1 && (
            <select
              className={styles.addressFilter}
              value={selectedAddress || 'all'}
              onChange={handleAddressChange}
              title="Filter by address"
            >
              <option value="all">All addresses</option>
              {addresses.map((addr) => (
                <option key={addr.address} value={addr.address}>
                  {formatAddress(addr.address)}
                  {addr.isPrimary ? ' (Primary)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            className={styles.autoRefreshToggle}
            onClick={toggleAutoRefresh}
            title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            Auto-refresh: {autoRefresh ? 'On' : 'Off'}
          </button>
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
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
