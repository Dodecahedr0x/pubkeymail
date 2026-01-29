/**
 * Email Cleanup Service Tests
 * Tests cleanup logic, safety checks, and monitoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PoolClient } from 'pg';
import { EmailCleanupService } from '../cleanup-service.js';
import { db } from '../../../database/connection.js';
import { mockQueryResult, mockMutationResult } from '../../../test-utils/mock-query-result.js';

interface MockPoolClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

/**
 * Mock database for testing
 * In a real implementation, this would use test database or transactions
 */
vi.mock('../../../database/connection.js', () => ({
  db: {
    query: vi.fn(),
    getClient: vi.fn(() => ({
      query: vi.fn(),
      release: vi.fn(),
    })),
  },
}));

describe('EmailCleanupService', () => {
  let cleanupService: EmailCleanupService;

  beforeEach(() => {
    cleanupService = new EmailCleanupService();
    vi.clearAllMocks();
  });

  describe('getCleanupStats', () => {
    it('should return accurate cleanup statistics', async () => {
      // Mock query responses
      const mockQueryResults = [
        mockQueryResult([{ count: '10000' }]), // Total emails
        mockQueryResult([{ count: '500' }]), // Expired emails
        mockQueryResult([{ count: '8000' }]), // Registered user emails
        mockQueryResult([{ count: '2000' }]), // Unregistered user emails
        mockQueryResult([
          {
            oldest: new Date('2024-01-01'),
            newest: new Date('2024-01-10'),
          },
        ]), // Date range
      ];

      let callIndex = 0;
      vi.mocked(db.query).mockImplementation(() =>
        Promise.resolve(mockQueryResults[callIndex++]!)
      );

      const stats = await cleanupService.getCleanupStats();

      expect(stats.totalEmailsInSystem).toBe(10000);
      expect(stats.expiredEmailsCount).toBe(500);
      expect(stats.registeredUserEmailsCount).toBe(8000);
      expect(stats.unregisteredUserEmailsCount).toBe(2000);
      expect(stats.oldestExpiredEmail).toEqual(new Date('2024-01-01'));
      expect(stats.newestExpiredEmail).toEqual(new Date('2024-01-10'));
    });

    it('should handle case with no expired emails', async () => {
      const mockQueryResults = [
        mockQueryResult([{ count: '5000' }]), // Total emails
        mockQueryResult([{ count: '0' }]), // Expired emails
        mockQueryResult([{ count: '5000' }]), // Registered user emails
        mockQueryResult([{ count: '0' }]), // Unregistered user emails
        mockQueryResult([{ oldest: null, newest: null }]), // Date range
      ];

      let callIndex = 0;
      vi.mocked(db.query).mockImplementation(() =>
        Promise.resolve(mockQueryResults[callIndex++]!)
      );

      const stats = await cleanupService.getCleanupStats();

      expect(stats.expiredEmailsCount).toBe(0);
      expect(stats.oldestExpiredEmail).toBeNull();
      expect(stats.newestExpiredEmail).toBeNull();
    });
  });

  describe('cleanupExpiredEmails', () => {
    it('should skip cleanup when no expired emails exist', async () => {
      // Mock stats showing no expired emails
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '5000' }])); // Total
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '0' }])); // Expired
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '5000' }])); // Registered
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '0' }])); // Unregistered
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: null, newest: null }])
      );

      const result = await cleanupService.cleanupExpiredEmails();

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
      expect(result.details.totalExpired).toBe(0);
      expect(result.details.batchesProcessed).toBe(0);
    });

    it('should respect safety threshold', async () => {
      // Mock stats showing too many expired emails
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '200000' }])); // Total
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '150000' }])); // Expired (exceeds safety threshold)
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '50000' }])); // Registered
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '150000' }])); // Unregistered
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      const result = await cleanupService.cleanupExpiredEmails();

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.details.errors).toHaveLength(1);
      expect(result.details.errors[0]!.message).toContain('Safety threshold exceeded');
    });

    it('should perform cleanup in batches (dry run)', async () => {
      // Mock stats
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '1500' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '8500' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '1500' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      // Mock batch queries (dry run)
      vi.mocked(db.query)
        .mockResolvedValueOnce(
          mockQueryResult([{ count: '1000', addresses: [1, 2, 3] }])
        ) // Batch 1
        .mockResolvedValueOnce(
          mockQueryResult([{ count: '500', addresses: [4, 5] }])
        ) // Batch 2
        .mockResolvedValueOnce(mockQueryResult([{ count: '0', addresses: [] }])); // No more

      const result = await cleanupService.cleanupExpiredEmails({
        dryRun: true,
        batchSize: 1000,
        maxBatches: 10,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.deletedCount).toBe(1500);
      expect(result.details.batchesProcessed).toBe(2);
      expect(result.details.addressesAffected).toBe(5);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Mock stats
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '100' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '9900' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '100' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      // Mock batch query to fail
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Database error'));

      const result = await cleanupService.cleanupExpiredEmails({
        dryRun: true,
        batchSize: 100,
      });

      expect(result.success).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.details.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getExpiredEmailsPreview', () => {
    it('should return preview of expired emails', async () => {
      const mockEmails = [
        {
          id: 'email-1',
          recipient_address_id: 1,
          recipient_email: 'user1@example.tld',
          received_at: new Date('2024-01-01'),
          expires_at: new Date('2024-01-31'),
        },
        {
          id: 'email-2',
          recipient_address_id: 2,
          recipient_email: 'user2@example.tld',
          received_at: new Date('2024-01-05'),
          expires_at: new Date('2024-02-04'),
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult(mockEmails));

      const preview = await cleanupService.getExpiredEmailsPreview(10);

      expect(preview).toHaveLength(2);
      expect(preview[0]!.id).toBe('email-1');
      expect(preview[0]!.recipientEmail).toBe('user1@example.tld');
      expect(preview[1]!.id).toBe('email-2');
    });

    it('should respect limit parameter', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([]));

      await cleanupService.getExpiredEmailsPreview(50);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [50]
      );
    });
  });

  describe('cleanupAddressEmails', () => {
    it('should cleanup emails for specific address (dry run)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '25' }]));

      const result = await cleanupService.cleanupAddressEmails(123, 60, true);

      expect(result).toBe(25);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        expect.any(Array)
      );
    });

    it('should delete emails for specific address', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(mockMutationResult(15));

      const result = await cleanupService.cleanupAddressEmails(456, 90, false);

      expect(result).toBe(15);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM emails'),
        expect.any(Array)
      );
    });

    it('should only delete emails with expires_at set', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(mockMutationResult(10));

      await cleanupService.cleanupAddressEmails(789, 30, false);

      // Verify query includes expires_at IS NOT NULL check
      const callArgs = vi.mocked(db.query).mock.calls[0];
      expect(callArgs![0]).toContain('expires_at IS NOT NULL');
    });
  });

  describe('Batch deletion logic', () => {
    it('should use transactions for actual deletions', async () => {
      // Setup mock client for transaction
      const mockClient: MockPoolClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      vi.mocked(db.getClient).mockResolvedValueOnce(mockClient as unknown as PoolClient);

      // Mock stats
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '1000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '50' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '950' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '50' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      // Mock transaction queries
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(
          mockQueryResult([
            { id: 'email-1', recipient_address_id: 1 },
            { id: 'email-2', recipient_address_id: 2 },
          ])
        ) // SELECT for batch
        .mockResolvedValueOnce(mockMutationResult(2)) // DELETE
        .mockResolvedValueOnce(undefined) // COMMIT
        .mockResolvedValueOnce(undefined) // BEGIN (second batch)
        .mockResolvedValueOnce(mockQueryResult([])) // SELECT empty
        .mockResolvedValueOnce(undefined); // COMMIT

      await cleanupService.cleanupExpiredEmails({
        dryRun: false,
        batchSize: 10,
        maxBatches: 2,
      });

      // Verify transaction was used
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error during deletion', async () => {
      const mockClient: MockPoolClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      vi.mocked(db.getClient).mockResolvedValueOnce(mockClient as unknown as PoolClient);

      // Mock stats
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '1000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '990' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      // Mock transaction with error
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(
          mockQueryResult([{ id: 'email-1', recipient_address_id: 1 }])
        ) // SELECT
        .mockRejectedValueOnce(new Error('Delete failed')); // DELETE fails

      await cleanupService.cleanupExpiredEmails({
        dryRun: false,
        batchSize: 10,
      });

      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Safety checks', () => {
    it('should never delete emails with expires_at = NULL', async () => {
      // This test verifies the SQL query includes proper WHERE clause
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '1000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '990' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ count: '10', addresses: [1] }])
      );

      await cleanupService.cleanupExpiredEmails({ dryRun: true });

      // Check that the query includes expires_at IS NOT NULL
      const batchQueryCall = vi.mocked(db.query).mock.calls.find((call) =>
        call[0].includes('expires_at IS NOT NULL')
      );

      expect(batchQueryCall).toBeDefined();
    });

    it('should respect maxBatches limit', async () => {
      // Mock stats
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '10000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '5000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '5000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '5000' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: new Date(), newest: new Date() }])
      );

      // Mock many batches available
      for (let i = 0; i < 10; i++) {
        vi.mocked(db.query).mockResolvedValueOnce(
          mockQueryResult([{ count: '100', addresses: [i] }])
        );
      }

      const result = await cleanupService.cleanupExpiredEmails({
        dryRun: true,
        batchSize: 100,
        maxBatches: 3,
      });

      expect(result.details.batchesProcessed).toBe(3);
    });
  });

  describe('Performance considerations', () => {
    it('should complete cleanup within reasonable time', async () => {
      const startTime = Date.now();

      // Mock quick responses
      vi.mocked(db.query).mockResolvedValue(mockQueryResult([{ count: '0' }]));

      await cleanupService.cleanupExpiredEmails();

      const duration = Date.now() - startTime;

      // Should complete in under 1 second for mocked queries
      expect(duration).toBeLessThan(1000);
    });

    it('should report duration in cleanup result', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '100' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '0' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '100' }]));
      vi.mocked(db.query).mockResolvedValueOnce(mockQueryResult([{ count: '0' }]));
      vi.mocked(db.query).mockResolvedValueOnce(
        mockQueryResult([{ oldest: null, newest: null }])
      );

      const result = await cleanupService.cleanupExpiredEmails();

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});
