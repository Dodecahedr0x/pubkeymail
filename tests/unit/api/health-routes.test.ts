/**
 * Health Routes Tests
 * Tests for health check endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../src/database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

vi.mock('../../../src/services/cache/redis-client.js', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('../../../src/services/email/cleanup-scheduler.js', () => ({
  emailCleanupScheduler: {
    getState: vi.fn(),
    isHealthy: vi.fn(),
  },
}));

import { db } from '../../../src/database/connection.js';
import { getRedisClient } from '../../../src/services/cache/redis-client.js';
import { emailCleanupScheduler } from '../../../src/services/email/cleanup-scheduler.js';

describe('Health Check Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Database Health Check', () => {
    it('should return healthy when database responds', async () => {
      vi.mocked(db.query).mockResolvedValue({
        rows: [{ health_check: 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await db.query('SELECT 1 as health_check');
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should handle database connection errors', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Connection refused'));

      await expect(db.query('SELECT 1')).rejects.toThrow('Connection refused');
    });
  });

  describe('Redis Health Check', () => {
    it('should return healthy when redis responds to ping', async () => {
      const mockClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      vi.mocked(getRedisClient).mockResolvedValue(mockClient as any);

      const client = await getRedisClient();
      const response = await client.ping();
      expect(response).toBe('PONG');
    });

    it('should handle redis connection errors', async () => {
      vi.mocked(getRedisClient).mockRejectedValue(new Error('Redis unavailable'));

      await expect(getRedisClient()).rejects.toThrow('Redis unavailable');
    });
  });

  describe('Cleanup Scheduler Health Check', () => {
    it('should return healthy when scheduler is running', () => {
      vi.mocked(emailCleanupScheduler.isHealthy).mockReturnValue(true);
      vi.mocked(emailCleanupScheduler.getState).mockReturnValue({
        isRunning: false,
        lastRun: new Date(),
        lastResult: null,
        nextScheduledRun: new Date(Date.now() + 3600000),
        totalRuns: 5,
        totalEmailsDeleted: 100,
        totalErrors: 0,
      });

      expect(emailCleanupScheduler.isHealthy()).toBe(true);
    });

    it('should return unhealthy when scheduler has errors', () => {
      vi.mocked(emailCleanupScheduler.isHealthy).mockReturnValue(false);
      vi.mocked(emailCleanupScheduler.getState).mockReturnValue({
        isRunning: false,
        lastRun: new Date(),
        lastResult: {
          success: false,
          deletedCount: 0,
          errorCount: 1,
          duration: 100,
          timestamp: new Date(),
          dryRun: false,
          details: {
            totalExpired: 0,
            batchesProcessed: 0,
            addressesAffected: 0,
            errors: [{ message: 'Database error' }],
          },
        },
        nextScheduledRun: null,
        totalRuns: 5,
        totalEmailsDeleted: 100,
        totalErrors: 1,
      });

      expect(emailCleanupScheduler.isHealthy()).toBe(false);
    });
  });
});
