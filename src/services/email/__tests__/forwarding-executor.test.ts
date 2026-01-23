/**
 * Forwarding Executor Tests
 * Tests for processing incoming emails against forwarding rules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ForwardingExecutor,
  type IncomingEmailData,
} from '../forwarding-executor.js';
import type { ForwardingRule, FilterConditions } from '../forwarding-service.js';

// Mock database
vi.mock('../../../database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

// Mock forwarding service
vi.mock('../forwarding-service.js', () => ({
  forwardingService: {
    getActiveRulesForAddress: vi.fn(),
    matchesFilter: vi.fn(),
  },
}));

import { db } from '../../../database/connection.js';
import { forwardingService } from '../forwarding-service.js';

describe('ForwardingExecutor', () => {
  let executor: ForwardingExecutor;
  const mockQuery = vi.mocked(db.query);
  const mockGetActiveRulesForAddress = vi.mocked(
    forwardingService.getActiveRulesForAddress
  );
  const mockMatchesFilter = vi.mocked(forwardingService.matchesFilter);

  const createMockRule = (overrides: Partial<ForwardingRule> = {}): ForwardingRule => ({
    id: 1,
    userId: 1,
    sourceAddressId: 1,
    destinationEmail: 'forward@example.com',
    filterConditions: null,
    enabled: true,
    verified: true,
    verificationToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockEmail = (overrides: Partial<IncomingEmailData> = {}): IncomingEmailData => ({
    recipientAddressId: 1,
    from: 'sender@example.com',
    subject: 'Test Email',
    bodyText: 'Test body',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new ForwardingExecutor();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processIncomingEmail', () => {
    it('should return processed=true and forwarded=0 when no rules exist', async () => {
      mockGetActiveRulesForAddress.mockResolvedValue([]);

      const email = createMockEmail();
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(0);
      expect(mockGetActiveRulesForAddress).toHaveBeenCalledWith(
        email.recipientAddressId
      );
    });

    it('should forward email when rule matches', async () => {
      const rule = createMockRule();
      mockGetActiveRulesForAddress.mockResolvedValue([rule]);
      mockMatchesFilter.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({
        rows: [{ address: 'recipient@pubkeymail.com' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const email = createMockEmail();
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual({
        ruleId: rule.id,
        destination: rule.destinationEmail,
        success: true,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ForwardingExecutor] Forwarding email:',
        expect.objectContaining({
          from: 'recipient@pubkeymail.com',
          to: 'forward@example.com',
          originalFrom: 'sender@example.com',
          subject: '[Fwd] Test Email',
          ruleId: 1,
        })
      );
      consoleSpy.mockRestore();
    });

    it('should skip forwarding when filter does not match', async () => {
      const rule = createMockRule({
        filterConditions: { fromContains: ['@vip.com'] } as FilterConditions,
      });
      mockGetActiveRulesForAddress.mockResolvedValue([rule]);
      mockMatchesFilter.mockReturnValue(false);

      const email = createMockEmail({ from: 'nobody@random.com' });
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(0);
      expect(mockMatchesFilter).toHaveBeenCalledWith(
        { from: email.from, subject: email.subject },
        rule.filterConditions
      );
    });

    it('should process all matching rules for multiple rules', async () => {
      const rule1 = createMockRule({ id: 1, destinationEmail: 'forward1@example.com' });
      const rule2 = createMockRule({
        id: 2,
        destinationEmail: 'forward2@example.com',
        filterConditions: { subjectContains: ['URGENT'] } as FilterConditions,
      });
      const rule3 = createMockRule({ id: 3, destinationEmail: 'forward3@example.com' });

      mockGetActiveRulesForAddress.mockResolvedValue([rule1, rule2, rule3]);
      mockMatchesFilter
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ address: 'recipient@pubkeymail.com' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ address: 'recipient@pubkeymail.com' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const email = createMockEmail({ subject: 'Regular Email' });
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(2);
      expect(result.details[0]?.ruleId).toBe(1);
      expect(result.details[1]?.ruleId).toBe(3);
    });

    it('should handle forwarding errors and track failures', async () => {
      const rule = createMockRule();
      mockGetActiveRulesForAddress.mockResolvedValue([rule]);
      mockMatchesFilter.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const email = createMockEmail();
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toEqual({
        ruleId: rule.id,
        destination: rule.destinationEmail,
        success: false,
        error: 'Source address not found',
      });
    });

    it('should capture database errors in details', async () => {
      const rule = createMockRule();
      mockGetActiveRulesForAddress.mockResolvedValue([rule]);
      mockMatchesFilter.mockReturnValue(true);
      mockQuery.mockRejectedValueOnce(new Error('Database connection lost'));

      const email = createMockEmail();
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.details[0]).toEqual({
        ruleId: rule.id,
        destination: rule.destinationEmail,
        success: false,
        error: 'Database connection lost',
      });
    });

    it('should handle mixed success and failure across multiple rules', async () => {
      const rule1 = createMockRule({ id: 1, sourceAddressId: 1 });
      const rule2 = createMockRule({ id: 2, sourceAddressId: 999 });
      const rule3 = createMockRule({ id: 3, sourceAddressId: 1 });

      mockGetActiveRulesForAddress.mockResolvedValue([rule1, rule2, rule3]);
      mockMatchesFilter.mockReturnValue(true);

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ address: 'addr1@pubkeymail.com' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ address: 'addr1@pubkeymail.com' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const email = createMockEmail();
      const result = await executor.processIncomingEmail(email);

      expect(result.forwarded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.details).toHaveLength(3);
      expect(result.details[0]?.success).toBe(true);
      expect(result.details[1]?.success).toBe(false);
      expect(result.details[1]?.error).toBe('Source address not found');
      expect(result.details[2]?.success).toBe(true);
    });

    it('should handle email with HTML body', async () => {
      const rule = createMockRule();
      mockGetActiveRulesForAddress.mockResolvedValue([rule]);
      mockMatchesFilter.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({
        rows: [{ address: 'recipient@pubkeymail.com' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const email = createMockEmail({
        bodyText: undefined,
        bodyHtml: '<html><body><p>Test</p></body></html>',
      });
      const result = await executor.processIncomingEmail(email);

      expect(result.processed).toBe(true);
      expect(result.forwarded).toBe(1);
    });
  });
});
