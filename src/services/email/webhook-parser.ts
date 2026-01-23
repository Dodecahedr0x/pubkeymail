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
  [key: string]: string | undefined;
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
  [key: string]: string | Array<{ Name: string; Value: string }> | Array<{ Name: string; Content: string; ContentType: string; ContentLength: number }> | undefined;
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
  attachments?: Array<{ filename?: string; 'content-type'?: string; size?: number; content?: string }>;
  [key: string]: string | Array<{ filename?: string; 'content-type'?: string; size?: number; content?: string }> | undefined;
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
          ...attachmentData.map((att: { filename?: string; type?: string; content?: string }) => ({
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
      ...payload.attachments.map((att) => ({
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
function isSendGridWebhook(payload: unknown): payload is SendGridWebhook {
  const p = payload as SendGridWebhook;
  return typeof p.to === 'string' && typeof p.from === 'string';
}

function isPostmarkWebhook(payload: unknown): payload is PostmarkWebhook {
  const p = payload as PostmarkWebhook;
  return typeof p.To === 'string' && typeof p.From === 'string';
}

function isMailgunWebhook(payload: unknown): payload is MailgunWebhook {
  const p = payload as MailgunWebhook;
  return typeof p.recipient === 'string' && typeof p.sender === 'string';
}

export function parseWebhookEmail(
  payload: SendGridWebhook | PostmarkWebhook | MailgunWebhook,
  provider?: 'sendgrid' | 'postmark' | 'mailgun'
): ParsedWebhookEmail {
  // If provider specified, use that parser
  if (provider === 'sendgrid') {
    return parseSendGridWebhook(payload as SendGridWebhook);
  }
  if (provider === 'postmark') {
    return parsePostmarkWebhook(payload as PostmarkWebhook);
  }
  if (provider === 'mailgun') {
    return parseMailgunWebhook(payload as MailgunWebhook);
  }

  // Auto-detect provider based on payload structure
  if (isPostmarkWebhook(payload)) {
    return parsePostmarkWebhook(payload);
  }

  if (isMailgunWebhook(payload)) {
    return parseMailgunWebhook(payload);
  }

  // Default to SendGrid format
  if (isSendGridWebhook(payload)) {
    return parseSendGridWebhook(payload);
  }

  // Fallback - treat as SendGrid
  return parseSendGridWebhook(payload as SendGridWebhook);
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
 * Removes potentially dangerous HTML/scripts using comprehensive regex patterns
 *
 * Security measures:
 * - Removes <script>, <style>, <iframe>, <object>, <embed>, <form> tags
 * - Removes all event handlers (onclick, onerror, onload, etc.)
 * - Neutralizes javascript:, data:, and vbscript: URLs
 * - Removes dangerous attributes like srcdoc, formaction
 * - Strips HTML comments that may hide malicious content
 *
 * Note: For enhanced security in production, consider adding sanitize-html package
 * which provides configurable allow-lists for tags and attributes.
 *
 * @param html - HTML content to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHtmlContent(html: string): string {
  let sanitized = html;

  // Remove dangerous tags entirely (including their content)
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'];
  for (const tag of dangerousTags) {
    const tagRegex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
    sanitized = sanitized.replace(tagRegex, '');
    // Also remove self-closing variants
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // Remove all event handlers (on* attributes)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>"']*/gi, '');

  // Remove javascript:, vbscript:, and data: URLs from href/src/action attributes
  const urlAttrs = ['href', 'src', 'action', 'formaction', 'poster', 'data', 'codebase', 'cite'];
  for (const attr of urlAttrs) {
    // Handle quoted values
    sanitized = sanitized.replace(
      new RegExp(`${attr}\\s*=\\s*["']\\s*(javascript|vbscript|data):[^"']*["']`, 'gi'),
      `${attr}="#"`
    );
    // Handle unquoted values
    sanitized = sanitized.replace(
      new RegExp(`${attr}\\s*=\\s*(javascript|vbscript|data):[^\\s>]*`, 'gi'),
      `${attr}="#"`
    );
  }

  // Remove dangerous attributes
  const dangerousAttrs = ['srcdoc', 'formaction', 'xlink:href', 'dynsrc', 'lowsrc'];
  for (const attr of dangerousAttrs) {
    sanitized = sanitized.replace(new RegExp(`\\s+${attr}\\s*=\\s*["'][^"']*["']`, 'gi'), '');
    sanitized = sanitized.replace(new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>"']*`, 'gi'), '');
  }

  // Remove HTML comments (can hide malicious content)
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  // Remove XML processing instructions
  sanitized = sanitized.replace(/<\?[\s\S]*?\?>/g, '');

  return sanitized;
}
