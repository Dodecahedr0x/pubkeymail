'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useToast } from '@/providers';
import * as emailsApi from '@/lib/api/emails';
import type { SendAttachment } from '@/lib/api/emails';
import { RichTextEditor } from '@/components/RichTextEditor';
import styles from './page.module.css';

interface FromAddress {
  id: number;
  address: string;
  email: string;
  blockchain: string;
}

interface AttachmentFile {
  file: File;
  preview: string;
}

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComposePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [fromAddresses, setFromAddresses] = useState<FromAddress[]>([]);
  const [selectedFromId, setSelectedFromId] = useState<number | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
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
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newAttachments: AttachmentFile[] = [];
    let hasError = false;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENTS) {
        setError(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
        hasError = true;
        break;
      }
      
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError(`File "${file.name}" is too large. Maximum size is 10MB.`);
        hasError = true;
        continue;
      }
      
      newAttachments.push({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      });
    }
    
    if (!hasError) {
      setError(null);
    }
    
    setAttachments([...attachments, ...newAttachments]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const removeAttachment = (index: number) => {
    const newAttachments = [...attachments];
    const removed = newAttachments.splice(index, 1);
    if (removed[0]?.preview) {
      URL.revokeObjectURL(removed[0].preview);
    }
    setAttachments(newAttachments);
  };
  
  const convertAttachmentsToBase64 = async (): Promise<SendAttachment[]> => {
    const result: SendAttachment[] = [];
    
    for (const att of attachments) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64Data = dataUrl.split(',')[1] || '';
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(att.file);
      });
      
      result.push({
        filename: att.file.name,
        content: base64,
        contentType: att.file.type || 'application/octet-stream',
      });
    }
    
    return result;
  };
  
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
      // Convert attachments to base64
      const attachmentData = await convertAttachmentsToBase64();
      
      const result = await emailsApi.sendEmail({
        userId: user.id,
        fromAddressId: selectedFromId,
        toAddress: toAddress.trim(),
        subject: subject.trim(),
        bodyText: bodyText,
        bodyHtml: bodyHtml,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
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
        
        <div className={styles.field}>
          <label>Attachments</label>
          <div className={styles.attachmentSection}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className={styles.fileInput}
              id="attachments"
            />
            <label htmlFor="attachments" className={styles.attachButton}>
              📎 Add Attachments
            </label>
            <span className={styles.attachHint}>
              Max {MAX_ATTACHMENTS} files, 10MB each
            </span>
          </div>
          
          {attachments.length > 0 && (
            <div className={styles.attachmentList}>
              {attachments.map((att, index) => (
                <div key={index} className={styles.attachmentItem}>
                  <div className={styles.attachmentInfo}>
                    <span className={styles.attachmentIcon}>
                      {att.file.type.startsWith('image/') ? '🖼️' : '📄'}
                    </span>
                    <span className={styles.attachmentName} title={att.file.name}>
                      {att.file.name.length > 30 
                        ? `${att.file.name.slice(0, 27)}...` 
                        : att.file.name}
                    </span>
                    <span className={styles.attachmentSize}>
                      {formatFileSize(att.file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.removeAttachment}
                    onClick={() => removeAttachment(index)}
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
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
