import { apiRequest } from './client';

export interface EmailAttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  url?: string;
}

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: string;
  read: boolean;
  isEncrypted?: boolean;
  encryptionMetadata?: Record<string, unknown> | null;
  attachments?: EmailAttachmentMeta[];
}

export interface SentEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string;
  deliveryStatus: string;
}

export interface MailboxAddress {
  address: string;
  isPrimary: boolean;
}

export interface MailboxResponse {
  emails: Email[];
  total: number;
  limit: number;
  offset: number;
  addresses: MailboxAddress[];
}

export async function getMailbox(
  userId: number,
  limit = 50,
  offset = 0,
  sourceAddress?: string
) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  if (sourceAddress) {
    params.set('sourceAddress', sourceAddress);
  }
  return apiRequest<MailboxResponse>(
    `/emails/mailbox/${userId}?${params.toString()}`
  );
}

export async function getEmail(userId: number, emailId: string) {
  return apiRequest<{ email: Email }>(`/emails/mailbox/${userId}/${emailId}`);
}

export interface SendAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export async function sendEmail(data: {
  userId: number;
  fromAddressId: number;
  toAddress: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: SendAttachment[];
}) {
  return apiRequest<{ success: boolean; messageId: string; emailId: string }>(
    '/emails/send',
    { method: 'POST', body: JSON.stringify(data) }
  );
}

export async function getSentEmails(userId: number, limit = 50, offset = 0) {
  return apiRequest<{ emails: SentEmail[]; total: number }>(
    `/emails/sent?userId=${userId}&limit=${limit}&offset=${offset}`
  );
}

export async function getFromAddresses(userId: number) {
  return apiRequest<{ addresses: Array<{ id: number; address: string; email: string; blockchain: string }> }>(
    `/emails/from-addresses?userId=${userId}`
  );
}

export async function deleteEmail(emailId: string) {
  return apiRequest<{ success: boolean }>(
    `/emails/${emailId}`,
    { method: 'DELETE' }
  );
}
