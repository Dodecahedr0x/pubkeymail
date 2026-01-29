/**
 * Email Sender Service Tests
 * Tests for outbound email sending functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailSenderService } from '../email-sender-service.js';
import { mockQueryResult } from '../../../test-utils/mock-query-result.js';

// Mock database
vi.mock('../../../database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

// Mock config
vi.mock('../../../config/index.js', () => ({
  config: {
    RATE_LIMIT_EMAIL_SEND_PAID_TIER: 500,
    RATE_LIMIT_EMAIL_SEND_FREE_TIER: 0,
    MOCK_SMTP_PROVIDER: true,
  },
  smtpConfig: {
    provider: 'sendgrid',
    fromDomain: 'pubkeymail.com',
    apiKey: 'test-api-key',
  },
}));

// Mock user service
vi.mock('../../user/index.js', () => ({
  userService: {
    getUserById: vi.fn(),
  },
}));

import { db } from '../../../database/connection.js';
import { userService } from '../../user/index.js';

describe('EmailSenderService', () => {
  let emailSenderService: EmailSenderService;
  const mockQuery = vi.mocked(db.query);
  const mockGetUserById = vi.mocked(userService.getUserById);

  beforeEach(() => {
    vi.clearAllMocks();
    emailSenderService = new EmailSenderService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendEmail', () => {
    const validInput = {
      fromAddressId: 1,
      toAddress: 'recipient@example.com',
      subject: 'Test Subject',
      bodyText: 'Test body content',
    };

    it('should fail if user not found', async () => {
      mockGetUserById.mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await emailSenderService.sendEmail(999, validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail if user is on free tier', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'free',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await emailSenderService.sendEmail(1, validInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email sending requires a paid subscription');
    });

    it('should fail if user does not own the from address', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      // Mock address ownership check - TWO queries: primary check and linked check
      mockQuery
        // Primary address check - returns count 0
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Linked address check - returns count 0
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await emailSenderService.sendEmail(1, {
        ...validInput,
        fromAddressId: 999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not have permission to send from this address');
    });

    it('should fail if rate limit exceeded', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      // Mock address ownership check - primary address check (user owns address)
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock tier lookup for rate limit
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'paid' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock rate limit count - at limit
        .mockResolvedValueOnce({
          rows: [{ count: '500' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await emailSenderService.sendEmail(1, validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should fail for invalid recipient email format', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      // Mock address ownership check (primary address check)
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock tier lookup for rate limit
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'paid' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock rate limit count - under limit
        .mockResolvedValueOnce({
          rows: [{ count: '10' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock get sender address
        .mockResolvedValueOnce({
          rows: [{ id: 1, address: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch', blockchain: 'solana' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await emailSenderService.sendEmail(1, {
        ...validInput,
        toAddress: 'invalid-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipient email format');
    });

    it('should successfully send email for paid user', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      // Mock all the queries in order
      mockQuery
        // Address ownership check (primary address check)
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Tier lookup for rate limit
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'paid' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Rate limit count
        .mockResolvedValueOnce({
          rows: [{ count: '10' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Get sender address
        .mockResolvedValueOnce({
          rows: [{ id: 1, address: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch', blockchain: 'solana' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Store sent email
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-uuid-123',
            sender_address_id: 1,
            sender_email: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch@pubkeymail.com',
            recipient_address: 'recipient@example.com',
            subject: 'Test Subject',
            body_text: 'Test body content',
            body_html: null,
            sent_at: new Date(),
            smtp_message_id: 'mock_123_abc',
            delivery_status: 'sent',
          }],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const result = await emailSenderService.sendEmail(1, validInput);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.emailId).toBe('email-uuid-123');
      expect(result.details?.provider).toBe('sendgrid');
      expect(result.details?.deliveryStatus).toBe('sent');
    });

    it('should allow sending with HTML body', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      mockQuery
        .mockResolvedValueOnce(mockQueryResult([{ count: '1' }]))
        .mockResolvedValueOnce(mockQueryResult([{ subscription_tier: 'paid' }]))
        .mockResolvedValueOnce(mockQueryResult([{ count: '10' }]))
        .mockResolvedValueOnce(mockQueryResult([{ id: 1, address: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch', blockchain: 'solana' }]))
        .mockResolvedValueOnce(mockQueryResult([{
            id: 'email-uuid-456',
            sender_address_id: 1,
            sender_email: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch@pubkeymail.com',
            recipient_address: 'recipient@example.com',
            subject: 'HTML Email',
            body_text: null,
            body_html: '<p>Hello World</p>',
            sent_at: new Date(),
            smtp_message_id: 'mock_456_def',
            delivery_status: 'sent',
          }]));

      const result = await emailSenderService.sendEmail(1, {
        fromAddressId: 1,
        toAddress: 'recipient@example.com',
        subject: 'HTML Email',
        bodyHtml: '<p>Hello World</p>',
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email-uuid-456');
    });

    it('should allow sending from a linked address', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [
            {
              id: 1,
              addressId: 2,
              address: 'LinkedAddress123456789012345678901234567890123',
              blockchain: 'solana' as const,
              verifiedAt: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      });

      mockQuery
        // Address ownership check - primary check (not primary, returns 0)
        .mockResolvedValueOnce(mockQueryResult([{ count: '0' }]))
        // Address ownership check - linked check (is linked, returns 1)
        .mockResolvedValueOnce(mockQueryResult([{ count: '1' }]))
        .mockResolvedValueOnce(mockQueryResult([{ subscription_tier: 'paid' }]))
        .mockResolvedValueOnce(mockQueryResult([{ count: '5' }]))
        .mockResolvedValueOnce(mockQueryResult([{ id: 2, address: 'LinkedAddress123456789012345678901234567890123', blockchain: 'solana' }]))
        .mockResolvedValueOnce(mockQueryResult([{
            id: 'email-uuid-789',
            sender_address_id: 2,
            sender_email: 'LinkedAddress123456789012345678901234567890123@pubkeymail.com',
            recipient_address: 'recipient@example.com',
            subject: 'From Linked',
            body_text: 'Sent from linked address',
            body_html: null,
            sent_at: new Date(),
            smtp_message_id: 'mock_789_ghi',
            delivery_status: 'sent',
          }]));

      const result = await emailSenderService.sendEmail(1, {
        fromAddressId: 2,
        toAddress: 'recipient@example.com',
        subject: 'From Linked',
        bodyText: 'Sent from linked address',
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email-uuid-789');
    });
  });

  describe('getSentEmails', () => {
    it('should return empty list for user with no sent emails', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      mockQuery
        .mockResolvedValueOnce(mockQueryResult([]))
        .mockResolvedValueOnce(mockQueryResult([{ count: '0' }]));

      const result = await emailSenderService.getSentEmails(1);

      expect(result.emails).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should return sent emails with pagination', async () => {
      const sentDate = new Date();
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      mockQuery
        .mockResolvedValueOnce(mockQueryResult([
            {
              id: 'email-1',
              sender_address_id: 1,
              sender_email: 'addr@pubkeymail.com',
              recipient_address: 'user1@example.com',
              subject: 'Email 1',
              body_text: 'Body 1',
              body_html: null,
              sent_at: sentDate,
              smtp_message_id: 'msg-1',
              delivery_status: 'delivered',
            },
            {
              id: 'email-2',
              sender_address_id: 1,
              sender_email: 'addr@pubkeymail.com',
              recipient_address: 'user2@example.com',
              subject: 'Email 2',
              body_text: 'Body 2',
              body_html: null,
              sent_at: sentDate,
              smtp_message_id: 'msg-2',
              delivery_status: 'sent',
            },
          ]))
        .mockResolvedValueOnce(mockQueryResult([{ count: '5' }]));

      const result = await emailSenderService.getSentEmails(1, 2, 0);

      expect(result.emails).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.emails[0]?.subject).toBe('Email 1');
      expect(result.emails[0]?.deliveryStatus).toBe('delivered');
    });

    it('should return empty for non-existent user', async () => {
      mockGetUserById.mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await emailSenderService.getSentEmails(999);

      expect(result.emails).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getFromAddresses', () => {
    it('should return primary and linked addresses', async () => {
      mockGetUserById.mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'PrimaryAddress12345678901234567890123456789012',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [
            {
              id: 1,
              addressId: 2,
              address: 'LinkedAddress123456789012345678901234567890123',
              blockchain: 'solana' as const,
              verifiedAt: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      });

      const result = await emailSenderService.getFromAddresses(1);

      expect(result).toHaveLength(2);
      expect(result[0]?.address).toBe('PrimaryAddress12345678901234567890123456789012');
      expect(result[0]?.email).toBe('PrimaryAddress12345678901234567890123456789012@pubkeymail.com');
      expect(result[1]?.address).toBe('LinkedAddress123456789012345678901234567890123');
    });

    it('should return empty for non-existent user', async () => {
      mockGetUserById.mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await emailSenderService.getFromAddresses(999);

      expect(result).toHaveLength(0);
    });
  });
});
