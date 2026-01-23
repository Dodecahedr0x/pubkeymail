'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import * as emailsApi from '@/lib/api/emails';
import type { Email } from '@/lib/api/emails';
import styles from './page.module.css';

export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const emailId = params.id as string;
  
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchEmail() {
      setLoading(true);
      setError(null);
      
      try {
        const result = await emailsApi.getEmail(emailId);
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        
        setEmail(result.data!.email);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load email');
      } finally {
        setLoading(false);
      }
    }
    
    fetchEmail();
  }, [emailId]);
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
        <p>Loading email...</p>
      </div>
    );
  }
  
  if (error || !email) {
    return (
      <div className={styles.error}>
        <h2>Email not found</h2>
        <p>{error || 'The email you are looking for does not exist.'}</p>
        <Link href="/mailbox" className="btn btn-primary">
          Back to Inbox
        </Link>
      </div>
    );
  }
  
  return (
    <div className={styles.emailDetail}>
      <div className={styles.toolbar}>
        <button className="btn btn-secondary" onClick={() => router.back()}>
          ← Back
        </button>
        <div className={styles.actions}>
          <button className="btn btn-secondary">Reply</button>
          <button className="btn btn-secondary">Forward</button>
          <button className="btn btn-danger">Delete</button>
        </div>
      </div>
      
      <div className={styles.emailContent}>
        <header className={styles.header}>
          <h1 className={styles.subject}>{email.subject || '(No subject)'}</h1>
          
          <div className={styles.meta}>
            <div className={styles.from}>
              <strong>From:</strong> {email.from}
            </div>
            <div className={styles.to}>
              <strong>To:</strong> {email.to}
            </div>
            <div className={styles.date}>
              {formatDate(email.receivedAt)}
            </div>
          </div>
        </header>
        
        <div className={styles.body}>
          {email.bodyHtml ? (
            <div 
              className={styles.htmlContent}
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className={styles.textContent}>{email.bodyText}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
