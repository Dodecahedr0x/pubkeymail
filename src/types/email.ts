/**
 * Email Type Definitions
 * Types for email storage, retrieval, and processing
 */

/**
 * Email attachment structure
 */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: string; // Base64 encoded content
  url?: string; // URL to download attachment
}

/**
 * Email headers (subset of common headers)
 */
export interface EmailHeaders {
  messageId?: string;
  date?: string;
  replyTo?: string;
  references?: string;
  inReplyTo?: string;
  [key: string]: string | undefined;
}

/**
 * Stored email record
 * CRITICAL: recipientEmail is case-sensitive
 */
export interface Email {
  id: string;
  recipientAddressId: number;
  recipientEmail: string; // Case-sensitive!
  senderAddress: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  headers: EmailHeaders;
  attachments: EmailAttachment[];
  receivedAt: Date;
  expiresAt: Date | null; // null = keep indefinitely (paid users)
  isEncrypted: boolean;
  encryptionMetadata: Record<string, any> | null;
}

/**
 * Email creation data (for incoming emails)
 */
export interface CreateEmailData {
  recipientEmail: string; // Case-sensitive!
  senderAddress: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  headers?: EmailHeaders;
  attachments?: EmailAttachment[];
  isEncrypted?: boolean;
  encryptionMetadata?: Record<string, any>;
}

/**
 * Email query filters
 */
export interface EmailQueryFilters {
  recipientAddressId?: number;
  recipientEmail?: string; // Case-sensitive!
  senderAddress?: string;
  startDate?: Date;
  endDate?: Date;
  hasAttachments?: boolean;
  isEncrypted?: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: 'received_at' | 'sender' | 'subject';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated email results
 */
export interface PaginatedEmails {
  emails: Email[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Sent email record
 */
export interface SentEmail {
  id: string;
  senderAddressId: number;
  senderEmail: string; // Case-sensitive!
  recipientAddress: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: Date;
  smtpMessageId: string | null;
  deliveryStatus: 'sent' | 'delivered' | 'bounced' | 'failed';
}

/**
 * Email statistics
 */
export interface EmailStats {
  totalEmails: number;
  unreadEmails: number;
  storageUsed: number; // in bytes
  oldestEmail: Date | null;
  newestEmail: Date | null;
}
