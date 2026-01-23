/**
 * SMTP Webhook Parser
 * Parses incoming email webhooks from various SMTP providers
 * Supports: SendGrid, Postmark, Mailgun
 */

import { CreateEmailData, EmailHeaders, EmailAttachment } from '../../types/email.js';

/**
 * Generic parsed email structure from webhook
 */
export interface ParsedWebhookEmail {
  to: string; // Recipient email address (case-sensitive)
  from: string; // Sender email address
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  headers?: EmailHeaders;
  attachments?: EmailAttachment[];
}

/**
 * SendGrid Inbound Parse webhook format
 * https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook
 */
export interface SendGridWebhook {
  to: string;
  from: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: string; // JSON string
  attachments?: string; // JSON string or number of attachments
  [key: string]: any;
}

/**
 * Postmark Inbound webhook format
 * https://postmarkapp.com/developer/webhooks/inbound-webhook
 */
export interface PostmarkWebhook {
  To: string;
  From: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: Array<{ Name: string; Value: string }>;
  Attachments?: Array<{
    Name: string;
    Content: string;
    ContentType: string;
    ContentLength: number;
  }>;
  [key: string]: any;
}

/**
 * Mailgun Inbound webhook format
 * https://documentation.mailgun.com/en/latest/api-sending.html#receiving-messages
 */
export interface MailgunWebhook {
  recipient: string;
  sender: string;
  subject?: string;
  'body-plain'?: string;
  'body-html'?: string;
  'message-headers'?: string; // JSON string
  attachments?: any[];
  [key: string]: any;
}

/**
 * Parse SendGrid inbound webhook
 */
export function parseSendGridWebhook(payload: SendGridWebhook): ParsedWebhookEmail {
  const headers: EmailHeaders = {};

  // Parse headers if present
  if (payload.headers) {
    try {
      const parsedHeaders =
        typeof payload.headers === 'string'
          ? JSON.parse(payload.headers)
          : payload.headers;
      Object.assign(headers, parsedHeaders);
    } catch {
      // Ignore parsing errors
    }
  }

  // Parse attachments
  const attachments: EmailAttachment[] = [];
  if (payload.attachments) {
    try {
      const attachmentData =
        typeof payload.attachments === 'string'
          ? JSON.parse(payload.attachments)
          : payload.attachments;

      if (Array.isArray(attachmentData)) {
        attachments.push(
          ...attachmentData.map((att: any) => ({
            filename: att.filename || 'attachment',
            contentType: att.type || 'application/octet-stream',
            size: att.content?.length || 0,
            content: att.content,
          }))
        );
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return {
    to: payload.to,
    from: payload.from,
    subject: payload.subject,
    bodyText: payload.text,
    bodyHtml: payload.html,
    headers,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Parse Postmark inbound webhook
 */
export function parsePostmarkWebhook(payload: PostmarkWebhook): ParsedWebhookEmail {
  const headers: EmailHeaders = {};

  // Parse headers
  if (payload.Headers && Array.isArray(payload.Headers)) {
    for (const header of payload.Headers) {
      headers[header.Name] = header.Value;
    }
  }

  // Parse attachments
  const attachments: EmailAttachment[] = [];
  if (payload.Attachments && Array.isArray(payload.Attachments)) {
    attachments.push(
      ...payload.Attachments.map((att) => ({
        filename: att.Name,
        contentType: att.ContentType,
        size: att.ContentLength,
        content: att.Content, // Base64 encoded
      }))
    );
  }

  return {
    to: payload.To,
    from: payload.From,
    subject: payload.Subject,
    bodyText: payload.TextBody,
    bodyHtml: payload.HtmlBody,
    headers,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Parse Mailgun inbound webhook
 */
export function parseMailgunWebhook(payload: MailgunWebhook): ParsedWebhookEmail {
  const headers: EmailHeaders = {};

  // Parse headers
  if (payload['message-headers']) {
    try {
      const parsedHeaders =
        typeof payload['message-headers'] === 'string'
          ? JSON.parse(payload['message-headers'])
          : payload['message-headers'];

      if (Array.isArray(parsedHeaders)) {
        for (const [key, value] of parsedHeaders) {
          headers[key] = value;
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Parse attachments
  const attachments: EmailAttachment[] = [];
  if (payload.attachments && Array.isArray(payload.attachments)) {
    attachments.push(
      ...payload.attachments.map((att: any) => ({
        filename: att.filename || 'attachment',
        contentType: att['content-type'] || 'application/octet-stream',
        size: att.size || 0,
        content: att.content,
      }))
    );
  }

  return {
    to: payload.recipient,
    from: payload.sender,
    subject: payload.subject,
    bodyText: payload['body-plain'],
    bodyHtml: payload['body-html'],
    headers,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

/**
 * Generic webhook parser
 * Automatically detects provider based on payload structure
 *
 * @param payload - Webhook payload from SMTP provider
 * @param provider - SMTP provider (optional, will auto-detect if not provided)
 * @returns Parsed email data
 */
export function parseWebhookEmail(
  payload: any,
  provider?: 'sendgrid' | 'postmark' | 'mailgun'
): ParsedWebhookEmail {
  // If provider specified, use that parser
  if (provider === 'sendgrid') {
    return parseSendGridWebhook(payload);
  }
  if (provider === 'postmark') {
    return parsePostmarkWebhook(payload);
  }
  if (provider === 'mailgun') {
    return parseMailgunWebhook(payload);
  }

  // Auto-detect provider based on payload structure
  if (payload.To && payload.From && payload.TextBody !== undefined) {
    // Postmark format (capitalized fields)
    return parsePostmarkWebhook(payload);
  }

  if (payload.recipient && payload.sender && payload['body-plain'] !== undefined) {
    // Mailgun format (kebab-case fields)
    return parseMailgunWebhook(payload);
  }

  // Default to SendGrid format
  return parseSendGridWebhook(payload);
}

/**
 * Convert parsed webhook email to CreateEmailData
 * CRITICAL: Preserves case sensitivity of recipient email
 *
 * @param parsed - Parsed webhook email
 * @returns Email creation data
 */
export function webhookToCreateEmailData(
  parsed: ParsedWebhookEmail
): CreateEmailData {
  return {
    recipientEmail: parsed.to, // CRITICAL: Case-sensitive
    senderAddress: parsed.from,
    subject: parsed.subject,
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    headers: parsed.headers,
    attachments: parsed.attachments,
  };
}

/**
 * Validate email data before storage
 * Checks for required fields and basic format validation
 *
 * @param data - Email data to validate
 * @returns Validation errors (empty array if valid)
 */
export function validateEmailData(data: CreateEmailData): string[] {
  const errors: string[] = [];

  // Validate recipient email
  if (!data.recipientEmail || !data.recipientEmail.includes('@')) {
    errors.push('Invalid recipient email address');
  }

  // Validate sender
  if (!data.senderAddress || !data.senderAddress.includes('@')) {
    errors.push('Invalid sender email address');
  }

  // Check for content
  if (!data.bodyText && !data.bodyHtml) {
    errors.push('Email must have either text or HTML body');
  }

  // Validate attachment sizes if present
  if (data.attachments) {
    for (const attachment of data.attachments) {
      if (attachment.size > 10 * 1024 * 1024) {
        // 10MB limit
        errors.push(`Attachment ${attachment.filename} exceeds 10MB limit`);
      }
    }
  }

  return errors;
}

/**
 * Sanitize email content
 * Removes potentially dangerous HTML/scripts
 *
 * @param html - HTML content to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHtmlContent(html: string): string {
  // Basic sanitization - remove script tags and event handlers
  // TODO: Use a proper HTML sanitization library in production (e.g., DOMPurify)
  let sanitized = html;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

  return sanitized;
}
