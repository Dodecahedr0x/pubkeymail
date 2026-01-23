'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useToast } from '@/providers';
import * as emailsApi from '@/lib/api/emails';
import { RichTextEditor } from '@/components/RichTextEditor';
import styles from './page.module.css';

interface FromAddress {
  id: number;
  address: string;
  email: string;
  blockchain: string;
}

export default function ComposePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  
  const [fromAddresses, setFromAddresses] = useState<FromAddress[]>([]);
  const [selectedFromId, setSelectedFromId] = useState<number | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  useEffect(() => {
    async function fetchFromAddresses() {
      if (!user) return;
      
      const result = await emailsApi.getFromAddresses(user.id);
      if (result.data?.addresses) {
        setFromAddresses(result.data.addresses);
        if (result.data.addresses.length > 0) {
          setSelectedFromId(result.data.addresses[0].id);
        }
      }
    }
    
    fetchFromAddresses();
  }, [user]);
  
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !selectedFromId) {
      setError('Please select a sender address');
      return;
    }
    
    if (!toAddress.trim()) {
      setError('Please enter a recipient');
      return;
    }
    
    if (!subject.trim()) {
      setError('Please enter a subject');
      return;
    }
    
    setSending(true);
    setError(null);
    
    try {
      const result = await emailsApi.sendEmail({
        userId: user.id,
        fromAddressId: selectedFromId,
        toAddress: toAddress.trim(),
        subject: subject.trim(),
        bodyText: bodyText,
        bodyHtml: bodyHtml,
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      setSuccess(true);
      showToast('Email sent successfully!', 'success');
      setTimeout(() => {
        router.push('/mailbox/sent');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send email';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSending(false);
    }
  };
  
  if (user?.subscriptionTier !== 'paid') {
    return (
      <div className={styles.upgrade}>
        <h2>✉️ Email Sending</h2>
        <p>Upgrade to Pro to send emails from your wallet address.</p>
        <button 
          className="btn btn-primary"
          onClick={() => router.push('/settings/upgrade')}
        >
          Upgrade to Pro
        </button>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>✅</span>
        <h2>Email Sent!</h2>
        <p>Redirecting to sent emails...</p>
      </div>
    );
  }
  
  return (
    <div className={styles.compose}>
      <h1>Compose Email</h1>
      
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}
      
      <form onSubmit={handleSend} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="from">From</label>
          <select
            id="from"
            value={selectedFromId || ''}
            onChange={(e) => setSelectedFromId(Number(e.target.value))}
            className="input"
            required
          >
            {fromAddresses.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.email}
              </option>
            ))}
          </select>
        </div>
        
        <div className={styles.field}>
          <label htmlFor="to">To</label>
          <input
            id="to"
            type="email"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="input"
            placeholder="recipient@example.com"
            required
          />
        </div>
        
        <div className={styles.field}>
          <label htmlFor="subject">Subject</label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input"
            placeholder="Email subject"
            required
          />
        </div>
        
        <div className={styles.field}>
          <label>Message</label>
          <RichTextEditor
            value={bodyHtml}
            onChange={(html, text) => {
              setBodyHtml(html);
              setBodyText(text);
            }}
            placeholder="Write your message..."
          />
        </div>
        
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.back()}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </form>
    </div>
  );
}
