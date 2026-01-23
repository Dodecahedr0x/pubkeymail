import { apiRequest } from './client';

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: string;
  read: boolean;
}

export interface SentEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string;
  deliveryStatus: string;
}

export interface MailboxResponse {
  emails: Email[];
  total: number;
  limit: number;
  offset: number;
}

export async function getMailbox(addressId: number, limit = 50, offset = 0) {
  return apiRequest<MailboxResponse>(
    `/emails/mailbox/${addressId}?limit=${limit}&offset=${offset}`
  );
}

export async function getEmail(emailId: string) {
  return apiRequest<{ email: Email }>(`/emails/${emailId}`);
}

export async function sendEmail(data: {
  userId: number;
  fromAddressId: number;
  toAddress: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
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
