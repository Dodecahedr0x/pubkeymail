/**
 * Forwarding Service Tests
 * Tests for email forwarding rule management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForwardingService, type FilterConditions } from '../forwarding-service.js';

// Mock database
vi.mock('../../../database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

// Mock tier service
vi.mock('../../tier/tier-service.js', () => ({
  tierService: {
    checkFeatureAccess: vi.fn(),
  },
}));

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({
      toString: () => 'mock-verification-token-12345',
    })),
  },
}));

import { db } from '../../../database/connection.js';
import { tierService } from '../../tier/tier-service.js';

describe('ForwardingService', () => {
  let forwardingService: ForwardingService;
  const mockQuery = vi.mocked(db.query);
  const mockCheckFeatureAccess = vi.mocked(tierService.checkFeatureAccess);

  beforeEach(() => {
    vi.clearAllMocks();
    forwardingService = new ForwardingService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createRule', () => {
    const validInput = {
      userId: 1,
      sourceAddressId: 1,
      destinationEmail: 'forward@example.com',
      filterConditions: { fromContains: ['@important.com'] },
    };

    it('should create a forwarding rule successfully', async () => {
      mockCheckFeatureAccess.mockResolvedValue({ allowed: true });

      // Mock address ownership check - primary address
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock insert
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'forward@example.com',
              filter_conditions: { fromContains: ['@important.com'] },
              enabled: true,
              verified: false,
              verification_token: 'mock-verification-token-12345',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.createRule(validInput);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.destinationEmail).toBe('forward@example.com');
      expect(result.data?.verified).toBe(false);
      expect(result.data?.enabled).toBe(true);
    });

    it('should fail if user does not have email_forwarding feature', async () => {
      mockCheckFeatureAccess.mockResolvedValue({
        allowed: false,
        reason: "Feature 'email_forwarding' requires paid subscription",
        requiredTier: 'paid',
      });

      const result = await forwardingService.createRule(validInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('paid subscription');
    });

    it('should fail if user does not own the source address', async () => {
      mockCheckFeatureAccess.mockResolvedValue({ allowed: true });

      // Mock primary address check - not owned
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock linked address check - not owned
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.createRule({
        ...validInput,
        sourceAddressId: 999,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not own this address');
    });

    it('should fail for invalid destination email format', async () => {
      mockCheckFeatureAccess.mockResolvedValue({ allowed: true });

      // Mock address ownership check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.createRule({
        ...validInput,
        destinationEmail: 'invalid-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid destination email format');
    });

    it('should create rule without filter conditions', async () => {
      mockCheckFeatureAccess.mockResolvedValue({ allowed: true });

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'forward@example.com',
              filter_conditions: null,
              enabled: true,
              verified: false,
              verification_token: 'mock-verification-token-12345',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.createRule({
        userId: 1,
        sourceAddressId: 1,
        destinationEmail: 'forward@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data?.filterConditions).toBeNull();
    });

    it('should work with linked address ownership', async () => {
      mockCheckFeatureAccess.mockResolvedValue({ allowed: true });

      // Primary check fails
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Linked check succeeds
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Insert
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2,
              user_id: 1,
              source_address_id: 2,
              destination_email: 'forward@example.com',
              filter_conditions: null,
              enabled: true,
              verified: false,
              verification_token: 'mock-verification-token-12345',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.createRule({
        userId: 1,
        sourceAddressId: 2,
        destinationEmail: 'forward@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data?.sourceAddressId).toBe(2);
    });
  });

  describe('getRules', () => {
    it('should return all rules for a user', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            source_address_id: 1,
            destination_email: 'forward1@example.com',
            filter_conditions: null,
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
          {
            id: 2,
            user_id: 1,
            source_address_id: 2,
            destination_email: 'forward2@example.com',
            filter_conditions: { fromContains: ['@test.com'] },
            enabled: false,
            verified: false,
            verification_token: 'token-abc',
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.getRules(1);

      expect(result).toHaveLength(2);
      expect(result[0]?.destinationEmail).toBe('forward1@example.com');
      expect(result[1]?.destinationEmail).toBe('forward2@example.com');
    });

    it('should return empty array for user with no rules', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.getRules(999);

      expect(result).toHaveLength(0);
    });
  });

  describe('updateRule', () => {
    it('should update rule destination and reset verification', async () => {
      const now = new Date();

      // Get existing rule
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'old@example.com',
              filter_conditions: null,
              enabled: true,
              verified: true,
              verification_token: null,
              created_at: now,
              updated_at: now,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Update
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'new@example.com',
              filter_conditions: null,
              enabled: true,
              verified: false,
              verification_token: 'mock-verification-token-12345',
              created_at: now,
              updated_at: now,
            },
          ],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.updateRule(1, 1, {
        destinationEmail: 'new@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data?.destinationEmail).toBe('new@example.com');
      expect(result.data?.verified).toBe(false);
    });

    it('should update filter conditions', async () => {
      const now = new Date();
      const newConditions: FilterConditions = { subjectContains: ['URGENT'] };

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'forward@example.com',
              filter_conditions: null,
              enabled: true,
              verified: true,
              verification_token: null,
              created_at: now,
              updated_at: now,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'forward@example.com',
              filter_conditions: newConditions,
              enabled: true,
              verified: true,
              verification_token: null,
              created_at: now,
              updated_at: now,
            },
          ],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.updateRule(1, 1, {
        filterConditions: newConditions,
      });

      expect(result.success).toBe(true);
      expect(result.data?.filterConditions).toEqual(newConditions);
    });

    it('should update enabled status', async () => {
      const now = new Date();

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'forward@example.com',
              filter_conditions: null,
              enabled: true,
              verified: true,
              verification_token: null,
              created_at: now,
              updated_at: now,
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 1,
              source_address_id: 1,
              destination_email: 'forward@example.com',
              filter_conditions: null,
              enabled: false,
              verified: true,
              verification_token: null,
              created_at: now,
              updated_at: now,
            },
          ],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        });

      const result = await forwardingService.updateRule(1, 1, { enabled: false });

      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(false);
    });

    it('should fail if rule not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.updateRule(999, 1, { enabled: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Forwarding rule not found');
    });

    it('should fail if user does not own the rule', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 2, // Different user
            source_address_id: 1,
            destination_email: 'forward@example.com',
            filter_conditions: null,
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.updateRule(1, 1, { enabled: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not own this forwarding rule');
    });

    it('should fail for invalid destination email on update', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            source_address_id: 1,
            destination_email: 'forward@example.com',
            filter_conditions: null,
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.updateRule(1, 1, {
        destinationEmail: 'not-an-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid destination email format');
    });

    it('should return existing rule if no updates provided', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            source_address_id: 1,
            destination_email: 'forward@example.com',
            filter_conditions: null,
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.updateRule(1, 1, {});

      expect(result.success).toBe(true);
      expect(result.data?.destinationEmail).toBe('forward@example.com');
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.deleteRule(1, 1);

      expect(result.success).toBe(true);
    });

    it('should fail if rule not found or not owned', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.deleteRule(999, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Forwarding rule not found');
    });
  });

  describe('verifyDestination', () => {
    it('should verify destination with valid token', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            source_address_id: 1,
            destination_email: 'forward@example.com',
            filter_conditions: null,
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.verifyDestination('valid-token');

      expect(result.success).toBe(true);
      expect(result.data?.verified).toBe(true);
      expect(result.data?.verificationToken).toBeNull();
    });

    it('should fail with invalid token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.verifyDestination('invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired verification token');
    });

    it('should fail with empty token', async () => {
      const result = await forwardingService.verifyDestination('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid verification token');
    });
  });

  describe('getActiveRulesForAddress', () => {
    it('should return only enabled and verified rules', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            source_address_id: 1,
            destination_email: 'forward1@example.com',
            filter_conditions: null,
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
          {
            id: 3,
            user_id: 1,
            source_address_id: 1,
            destination_email: 'forward3@example.com',
            filter_conditions: { fromContains: ['@vip.com'] },
            enabled: true,
            verified: true,
            verification_token: null,
            created_at: now,
            updated_at: now,
          },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.getActiveRulesForAddress(1);

      expect(result).toHaveLength(2);
      expect(result[0]?.enabled).toBe(true);
      expect(result[0]?.verified).toBe(true);
    });

    it('should return empty array if no active rules', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await forwardingService.getActiveRulesForAddress(999);

      expect(result).toHaveLength(0);
    });
  });

  describe('matchesFilter', () => {
    it('should match all emails when no conditions specified', () => {
      const result = forwardingService.matchesFilter(
        { from: 'sender@example.com', subject: 'Hello World' },
        null
      );

      expect(result).toBe(true);
    });

    it('should match emails with fromContains condition', () => {
      const conditions: FilterConditions = { fromContains: ['@important.com'] };

      expect(
        forwardingService.matchesFilter(
          { from: 'boss@important.com', subject: 'Meeting' },
          conditions
        )
      ).toBe(true);

      expect(
        forwardingService.matchesFilter(
          { from: 'spam@random.com', subject: 'Meeting' },
          conditions
        )
      ).toBe(false);
    });

    it('should match emails with subjectContains condition', () => {
      const conditions: FilterConditions = { subjectContains: ['URGENT'] };

      expect(
        forwardingService.matchesFilter(
          { from: 'anyone@example.com', subject: 'URGENT: Please respond' },
          conditions
        )
      ).toBe(true);

      expect(
        forwardingService.matchesFilter(
          { from: 'anyone@example.com', subject: 'Regular email' },
          conditions
        )
      ).toBe(false);
    });

    it('should exclude emails with excludeFrom condition', () => {
      const conditions: FilterConditions = { excludeFrom: ['@spam.com', 'noreply@'] };

      expect(
        forwardingService.matchesFilter(
          { from: 'offer@spam.com', subject: 'Buy now!' },
          conditions
        )
      ).toBe(false);

      expect(
        forwardingService.matchesFilter(
          { from: 'noreply@service.com', subject: 'Notification' },
          conditions
        )
      ).toBe(false);

      expect(
        forwardingService.matchesFilter(
          { from: 'friend@gmail.com', subject: 'Hello!' },
          conditions
        )
      ).toBe(true);
    });

    it('should exclude emails with excludeSubject condition', () => {
      const conditions: FilterConditions = { excludeSubject: ['unsubscribe', 'newsletter'] };

      expect(
        forwardingService.matchesFilter(
          { from: 'sender@example.com', subject: 'Click to unsubscribe' },
          conditions
        )
      ).toBe(false);

      expect(
        forwardingService.matchesFilter(
          { from: 'sender@example.com', subject: 'Weekly Newsletter' },
          conditions
        )
      ).toBe(false);

      expect(
        forwardingService.matchesFilter(
          { from: 'sender@example.com', subject: 'Important Update' },
          conditions
        )
      ).toBe(true);
    });

    it('should be case insensitive', () => {
      const conditions: FilterConditions = {
        fromContains: ['@IMPORTANT.COM'],
        subjectContains: ['urgent'],
        excludeFrom: ['SPAM@'],
      };

      expect(
        forwardingService.matchesFilter(
          { from: 'boss@important.com', subject: 'hello' },
          conditions
        )
      ).toBe(true);

      expect(
        forwardingService.matchesFilter(
          { from: 'test@test.com', subject: 'URGENT MATTER' },
          conditions
        )
      ).toBe(true);

      expect(
        forwardingService.matchesFilter(
          { from: 'spam@bad.com', subject: 'Buy now' },
          conditions
        )
      ).toBe(false);
    });

    it('should apply exclusions before inclusions', () => {
      const conditions: FilterConditions = {
        fromContains: ['@company.com'],
        excludeFrom: ['noreply@company.com'],
      };

      expect(
        forwardingService.matchesFilter(
          { from: 'noreply@company.com', subject: 'Notification' },
          conditions
        )
      ).toBe(false);

      expect(
        forwardingService.matchesFilter(
          { from: 'boss@company.com', subject: 'Meeting' },
          conditions
        )
      ).toBe(true);
    });

    it('should match if ANY inclusion condition matches', () => {
      const conditions: FilterConditions = {
        fromContains: ['@vip.com'],
        subjectContains: ['urgent', 'important'],
      };

      // Matches from
      expect(
        forwardingService.matchesFilter(
          { from: 'ceo@vip.com', subject: 'Regular email' },
          conditions
        )
      ).toBe(true);

      // Matches subject
      expect(
        forwardingService.matchesFilter(
          { from: 'random@example.com', subject: 'IMPORTANT: Read now' },
          conditions
        )
      ).toBe(true);

      // Matches neither
      expect(
        forwardingService.matchesFilter(
          { from: 'random@example.com', subject: 'Hello there' },
          conditions
        )
      ).toBe(false);
    });

    it('should handle empty arrays in conditions', () => {
      const conditions: FilterConditions = {
        fromContains: [],
        subjectContains: [],
        excludeFrom: [],
        excludeSubject: [],
      };

      expect(
        forwardingService.matchesFilter(
          { from: 'anyone@example.com', subject: 'Anything' },
          conditions
        )
      ).toBe(true);
    });
  });
});
