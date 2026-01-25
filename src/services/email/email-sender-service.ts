/**
 * Email Sender Service
 * Handles outbound email sending via SMTP providers
 *
 * SECURITY NOTES:
 * - Only paid users can send emails
 * - Rate limiting per address
 * - Validate sender owns the "from" address
 */

import { db } from '../../database/connection.js';
import { smtpConfig, config } from '../../config/index.js';
import { userService } from '../user/index.js';
import { mailjetParseRouteService } from './mailjet-parse-route-service.js';
import type { BlockchainType } from '../../types/blockchain.js';

/**
 * Email attachment for sending
 */
export interface SendAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
}

/**
 * Email composition data
 */
export interface ComposeEmailInput {
  fromAddressId: number;
  toAddress: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
  attachments?: SendAttachment[];
}

/**
 * Sent email result
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  emailId?: string;
  error?: string;
  details?: {
    provider: string;
    deliveryStatus: string;
    sentAt: Date;
  };
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

/**
 * Email delivery status
 */
export type DeliveryStatus = 'sent' | 'delivered' | 'bounced' | 'failed';

/**
 * Sent email record
 */
export interface SentEmail {
  id: string;
  senderAddressId: number;
  senderEmail: string;
  recipientAddress: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: Date;
  smtpMessageId: string | null;
  deliveryStatus: DeliveryStatus;
}

/**
 * Email Sender Service Class
 */
export class EmailSenderService {
  private readonly provider: string;
  private readonly fromDomain: string;

  constructor() {
    this.provider = smtpConfig.provider;
    this.fromDomain = smtpConfig.fromDomain;
  }

  /**
   * Send an email
   *
   * @param userId - Sending user ID (for authorization)
   * @param input - Email composition data
   * @returns Send result
   */
  async sendEmail(userId: number, input: ComposeEmailInput): Promise<SendEmailResult> {
    try {
      // Verify user exists and has permission
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      // Check subscription tier (only paid users can send)
      if (userResult.data.subscriptionTier !== 'paid') {
        return {
          success: false,
          error: 'Email sending requires a paid subscription',
        };
      }

      // Verify user owns the from address
      const ownsAddress = await this.verifyAddressOwnership(
        userId,
        input.fromAddressId
      );
      if (!ownsAddress) {
        return {
          success: false,
          error: 'You do not have permission to send from this address',
        };
      }

      // Check rate limit
      const rateLimit = await this.checkRateLimit(input.fromAddressId);
      if (!rateLimit.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Try again after ${rateLimit.resetAt.toISOString()}`,
        };
      }

      // Get sender address info
      const senderAddress = await this.getAddressById(input.fromAddressId);
      if (!senderAddress) {
        return { success: false, error: 'Sender address not found' };
      }

      // Construct sender email
      const senderEmail = `${senderAddress.address}@${this.fromDomain}`;

      // Validate recipient address format
      if (!this.isValidEmailFormat(input.toAddress)) {
        return { success: false, error: 'Invalid recipient email format' };
      }

      // Send via SMTP provider
      const sendResult = await this.sendViaProvider({
        from: senderEmail,
        to: input.toAddress,
        subject: input.subject,
        text: input.bodyText,
        html: input.bodyHtml,
        replyTo: input.replyTo,
        attachments: input.attachments,
      });

      if (!sendResult.success) {
        return {
          success: false,
          error: sendResult.error || 'Failed to send email',
        };
      }

      // Store sent email record
      const storedEmail = await this.storeSentEmail({
        senderAddressId: input.fromAddressId,
        senderEmail,
        recipientAddress: input.toAddress,
        subject: input.subject,
        bodyText: input.bodyText || null,
        bodyHtml: input.bodyHtml || null,
        smtpMessageId: sendResult.messageId || null,
        deliveryStatus: 'sent',
      });

      // Increment rate limit counter
      await this.incrementRateLimitCounter(input.fromAddressId);

      // If recipient is a @pubkeymail.com address, create mailbox for them
      this.ensureRecipientMailbox(input.toAddress).catch((error) => {
        console.error('Failed to create recipient mailbox:', error);
      });

      return {
        success: true,
        messageId: sendResult.messageId,
        emailId: storedEmail?.id,
        details: {
          provider: this.provider,
          deliveryStatus: 'sent',
          sentAt: new Date(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }

  /**
   * Ensure a mailbox exists for a @pubkeymail.com recipient
   * Creates parse routes for the recipient address if they don't exist
   *
   * @param recipientEmail - Full email address of recipient
   */
  private async ensureRecipientMailbox(recipientEmail: string): Promise<void> {
    // Only process @pubkeymail.com addresses
    const emailLower = recipientEmail.toLowerCase();
    if (!emailLower.endsWith(`@${this.fromDomain}`)) {
      return;
    }

    // Extract local part (wallet address or domain name)
    const localPart = recipientEmail.split('@')[0];
    if (!localPart) {
      return;
    }

    // Register parse route for this address
    const result = await mailjetParseRouteService.registerParseRoute(localPart);
    if (result.success) {
      console.log(`Created mailbox for recipient: ${recipientEmail}`);
    } else {
      console.warn(`Failed to create mailbox for recipient ${recipientEmail}: ${result.error}`);
    }
  }

  /**
   * Get user's sent emails
   *
   * @param userId - User ID
   * @param limit - Max emails to return
   * @param offset - Pagination offset
   */
  async getSentEmails(
    userId: number,
    limit = 50,
    offset = 0
  ): Promise<{ emails: SentEmail[]; total: number }> {
    // Get user's address IDs
    const userResult = await userService.getUserById(userId);
    if (!userResult.success || !userResult.data) {
      return { emails: [], total: 0 };
    }

    const addressIds = [
      userResult.data.primaryAddressId,
      ...userResult.data.linkedAddresses.map((la) => la.addressId),
    ];

    // Query sent emails
    const result = await db.query<{
      id: string;
      sender_address_id: number;
      sender_email: string;
      recipient_address: string;
      subject: string | null;
      body_text: string | null;
      body_html: string | null;
      sent_at: Date;
      smtp_message_id: string | null;
      delivery_status: string;
    }>(
      `SELECT id, sender_address_id, sender_email, recipient_address,
              subject, body_text, body_html, sent_at, smtp_message_id, delivery_status
       FROM sent_emails
       WHERE sender_address_id = ANY($1)
       ORDER BY sent_at DESC
       LIMIT $2 OFFSET $3`,
      [addressIds, limit, offset]
    );

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sent_emails WHERE sender_address_id = ANY($1)`,
      [addressIds]
    );

    return {
      emails: result.rows.map((row) => ({
        id: row.id,
        senderAddressId: row.sender_address_id,
        senderEmail: row.sender_email,
        recipientAddress: row.recipient_address,
        subject: row.subject,
        bodyText: row.body_text,
        bodyHtml: row.body_html,
        sentAt: row.sent_at,
        smtpMessageId: row.smtp_message_id,
        deliveryStatus: row.delivery_status as DeliveryStatus,
      })),
      total: parseInt(countResult.rows[0]?.count || '0'),
    };
  }

  /**
   * Get available "from" addresses for a user
   */
  async getFromAddresses(
    userId: number
  ): Promise<Array<{ id: number; address: string; email: string; blockchain: BlockchainType }>> {
    const userResult = await userService.getUserById(userId);
    if (!userResult.success || !userResult.data) {
      return [];
    }

    const addresses = [
      {
        id: userResult.data.primaryAddressId,
        address: userResult.data.primaryAddress,
        email: `${userResult.data.primaryAddress}@${this.fromDomain}`,
        blockchain: userResult.data.blockchain,
      },
      ...userResult.data.linkedAddresses.map((la) => ({
        id: la.addressId,
        address: la.address,
        email: `${la.address}@${this.fromDomain}`,
        blockchain: la.blockchain,
      })),
    ];

    return addresses;
  }

  /**
   * Update delivery status (called by webhook)
   */
  async updateDeliveryStatus(
    messageId: string,
    status: DeliveryStatus
  ): Promise<boolean> {
    try {
      const result = await db.query(
        `UPDATE sent_emails SET delivery_status = $1 WHERE smtp_message_id = $2`,
        [status, messageId]
      );
      return (result.rowCount || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Verify user owns the address
   */
  private async verifyAddressOwnership(
    userId: number,
    addressId: number
  ): Promise<boolean> {
    // Check if it's the primary address
    const primaryResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users
       WHERE id = $1 AND primary_address_id = $2`,
      [userId, addressId]
    );

    if (parseInt(primaryResult.rows[0]?.count || '0') > 0) {
      return true;
    }

    // Check if it's a linked address
    const linkedResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM address_links
       WHERE user_id = $1 AND address_id = $2`,
      [userId, addressId]
    );

    return parseInt(linkedResult.rows[0]?.count || '0') > 0;
  }

  /**
   * Get address by ID
   */
  private async getAddressById(
    addressId: number
  ): Promise<{ id: number; address: string; blockchain: BlockchainType } | null> {
    const result = await db.query<{
      id: number;
      address: string;
      blockchain: string;
    }>('SELECT id, address, blockchain FROM blockchain_addresses WHERE id = $1', [
      addressId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0]!.id,
      address: result.rows[0]!.address,
      blockchain: result.rows[0]!.blockchain as BlockchainType,
    };
  }

  /**
   * Check rate limit for address
   */
  private async checkRateLimit(addressId: number): Promise<RateLimitResult> {
    // Get user's tier for rate limit
    const userResult = await db.query<{ subscription_tier: string }>(
      `SELECT u.subscription_tier
       FROM users u
       WHERE u.primary_address_id = $1
       UNION
       SELECT u.subscription_tier
       FROM users u
       JOIN address_links al ON u.id = al.user_id
       WHERE al.address_id = $1
       LIMIT 1`,
      [addressId]
    );

    const tier = userResult.rows[0]?.subscription_tier || 'free';
    const limit =
      tier === 'paid'
        ? config.RATE_LIMIT_EMAIL_SEND_PAID_TIER
        : config.RATE_LIMIT_EMAIL_SEND_FREE_TIER;

    // Count emails sent in the last hour
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM sent_emails
       WHERE sender_address_id = $1
         AND sent_at > NOW() - INTERVAL '1 hour'`,
      [addressId]
    );

    const used = parseInt(countResult.rows[0]?.count || '0');
    const remaining = Math.max(0, limit - used);
    const resetAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    return {
      allowed: used < limit,
      remaining,
      limit,
      resetAt,
    };
  }

  /**
   * Increment rate limit counter
   */
  private async incrementRateLimitCounter(_addressId: number): Promise<void> {
    // Rate limiting is done via counting sent_emails, no separate counter needed
    // This method exists for potential Redis-based rate limiting in the future
  }

  /**
   * Store sent email record
   */
  private async storeSentEmail(data: {
    senderAddressId: number;
    senderEmail: string;
    recipientAddress: string;
    subject: string;
    bodyText: string | null;
    bodyHtml: string | null;
    smtpMessageId: string | null;
    deliveryStatus: DeliveryStatus;
  }): Promise<SentEmail | null> {
    try {
      const result = await db.query<{
        id: string;
        sender_address_id: number;
        sender_email: string;
        recipient_address: string;
        subject: string | null;
        body_text: string | null;
        body_html: string | null;
        sent_at: Date;
        smtp_message_id: string | null;
        delivery_status: string;
      }>(
        `INSERT INTO sent_emails
           (sender_address_id, sender_email, recipient_address, subject,
            body_text, body_html, smtp_message_id, delivery_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.senderAddressId,
          data.senderEmail,
          data.recipientAddress,
          data.subject,
          data.bodyText,
          data.bodyHtml,
          data.smtpMessageId,
          data.deliveryStatus,
        ]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0]!;
      return {
        id: row.id,
        senderAddressId: row.sender_address_id,
        senderEmail: row.sender_email,
        recipientAddress: row.recipient_address,
        subject: row.subject,
        bodyText: row.body_text,
        bodyHtml: row.body_html,
        sentAt: row.sent_at,
        smtpMessageId: row.smtp_message_id,
        deliveryStatus: row.delivery_status as DeliveryStatus,
      };
    } catch {
      return null;
    }
  }

  /**
   * Send email via SMTP provider
   */
  private async sendViaProvider(email: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SendAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Mock implementation - in production, this would call the actual SMTP provider
    if (config.MOCK_SMTP_PROVIDER) {
      console.log('[MockSMTP] Sending email:', {
        from: email.from,
        to: email.to,
        subject: email.subject,
        attachmentCount: email.attachments?.length || 0,
      });

      return {
        success: true,
        messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      };
    }

    // Provider-specific implementations
    switch (this.provider) {
      case 'sendgrid':
        return this.sendViaSendGrid(email);
      case 'postmark':
        return this.sendViaPostmark(email);
      case 'mailgun':
        return this.sendViaMailgun(email);
      case 'mailjet':
        return this.sendViaMailjet(email);
      default:
        return { success: false, error: `Unknown provider: ${this.provider}` };
    }
  }

  /**
   * Send via SendGrid API
   * @see https://docs.sendgrid.com/api-reference/mail-send/mail-send
   */
  private async sendViaSendGrid(email: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SendAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const payload: Record<string, unknown> = {
        personalizations: [{ to: [{ email: email.to }] }],
        from: { email: email.from },
        reply_to: email.replyTo ? { email: email.replyTo } : undefined,
        subject: email.subject,
        content: [
          ...(email.text ? [{ type: 'text/plain', value: email.text }] : []),
          ...(email.html ? [{ type: 'text/html', value: email.html }] : []),
        ],
      };

      // Add attachments if present
      if (email.attachments && email.attachments.length > 0) {
        payload['attachments'] = email.attachments.map((att) => ({
          content: att.content,
          filename: att.filename,
          type: att.contentType,
          disposition: 'attachment',
        }));
      }

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${smtpConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `SendGrid API error: ${response.status} - ${errorBody}`,
        };
      }

      const messageId = response.headers.get('x-message-id') || `sg_${Date.now()}`;
      return { success: true, messageId };
    } catch (error) {
      return {
        success: false,
        error: `SendGrid request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Send via Postmark API
   * @see https://postmarkapp.com/developer/api/email-api
   */
  private async sendViaPostmark(email: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SendAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const payload: Record<string, unknown> = {
        From: email.from,
        To: email.to,
        Subject: email.subject,
        TextBody: email.text,
        HtmlBody: email.html,
        ReplyTo: email.replyTo,
      };

      // Add attachments if present
      if (email.attachments && email.attachments.length > 0) {
        payload['Attachments'] = email.attachments.map((att) => ({
          Name: att.filename,
          Content: att.content,
          ContentType: att.contentType,
        }));
      }

      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': smtpConfig.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as { MessageID?: string; ErrorCode?: number; Message?: string };

      if (!response.ok || data.ErrorCode) {
        return {
          success: false,
          error: `Postmark API error: ${data.Message || response.statusText}`,
        };
      }

      return { success: true, messageId: data.MessageID };
    } catch (error) {
      return {
        success: false,
        error: `Postmark request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Send via Mailgun API
   * @see https://documentation.mailgun.com/en/latest/api-sending-messages.html
   */
  private async sendViaMailgun(email: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SendAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Extract domain from the from address for the API endpoint
      const domain = email.from.split('@')[1] || this.fromDomain;

      // Use FormData for multipart/form-data (required for attachments)
      const formData = new FormData();
      formData.append('from', email.from);
      formData.append('to', email.to);
      formData.append('subject', email.subject);
      if (email.text) formData.append('text', email.text);
      if (email.html) formData.append('html', email.html);
      if (email.replyTo) formData.append('h:Reply-To', email.replyTo);

      // Add attachments if present
      if (email.attachments && email.attachments.length > 0) {
        for (const att of email.attachments) {
          const buffer = Buffer.from(att.content, 'base64');
          const blob = new Blob([buffer], { type: att.contentType });
          formData.append('attachment', blob, att.filename);
        }
      }

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${smtpConfig.apiKey}`).toString('base64')}`,
        },
        body: formData,
      });

      const data = await response.json() as { id?: string; message?: string };

      if (!response.ok) {
        return {
          success: false,
          error: `Mailgun API error: ${data.message || response.statusText}`,
        };
      }

      return { success: true, messageId: data.id };
    } catch (error) {
      return {
        success: false,
        error: `Mailgun request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Send via Mailjet API
   * @see https://dev.mailjet.com/email/guides/send-api-v31/
   */
  private async sendViaMailjet(email: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SendAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const message: Record<string, unknown> = {
        From: { Email: email.from },
        To: [{ Email: email.to }],
        Subject: email.subject,
        TextPart: email.text,
        HTMLPart: email.html,
        ReplyTo: email.replyTo ? { Email: email.replyTo } : undefined,
      };

      // Add attachments if present
      if (email.attachments && email.attachments.length > 0) {
        message['Attachments'] = email.attachments.map((att) => ({
          ContentType: att.contentType,
          Filename: att.filename,
          Base64Content: att.content,
        }));
      }

      const response = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${smtpConfig.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Messages: [message],
        }),
      });

      const data = await response.json() as {
        Messages?: Array<{ Status: string; To: Array<{ MessageID: number }> }>;
        ErrorMessage?: string;
      };

      if (!response.ok || data.Messages?.[0]?.Status === 'error') {
        return {
          success: false,
          error: `Mailjet API error: ${data.ErrorMessage || response.statusText}`,
        };
      }

      const messageId = data.Messages?.[0]?.To?.[0]?.MessageID?.toString();
      return { success: true, messageId };
    } catch (error) {
      return {
        success: false,
        error: `Mailjet request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate email format
   */
  private isValidEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Singleton instance
 */
export const emailSenderService = new EmailSenderService();
