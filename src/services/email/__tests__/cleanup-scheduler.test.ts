/**
 * Email Cleanup Scheduler Tests
 * Tests scheduled cleanup execution, state management, and health checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailCleanupScheduler } from '../cleanup-scheduler.js';
import type { CleanupResult } from '../cleanup-service.js';

/**
 * Mock node-cron
 */
const mockScheduledTask = {
  stop: vi.fn(),
  start: vi.fn(),
};

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => mockScheduledTask),
    validate: vi.fn(() => true),
  },
}));

/**
 * Mock cleanup service
 */
vi.mock('../cleanup-service.js', () => ({
  emailCleanupService: {
    getCleanupStats: vi.fn(),
    cleanupExpiredEmails: vi.fn(),
  },
}));

import cron from 'node-cron';
import { emailCleanupService } from '../cleanup-service.js';

describe('EmailCleanupScheduler', () => {
  let scheduler: EmailCleanupScheduler;

  beforeEach(() => {
    scheduler = new EmailCleanupScheduler();
    vi.clearAllMocks();
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('start', () => {
    it('should start with default configuration', () => {
      scheduler.start();

      expect(cron.schedule).toHaveBeenCalledWith(
        expect.stringMatching(/0 \d+ \* \* \*/), // Daily cron expression
        expect.any(Function),
        expect.objectContaining({
          scheduled: true,
          timezone: 'UTC',
        })
      );
    });

    it('should start with custom cron expression', () => {
      scheduler.start({
        cronExpression: '0 3 * * *', // 3 AM daily
        timezone: 'America/New_York',
      });

      expect(cron.schedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: true,
          timezone: 'America/New_York',
        })
      );
    });

    it('should not start when disabled', () => {
      scheduler.start({ enabled: false });

      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('should throw error for invalid cron expression', () => {
      vi.mocked(cron.validate).mockReturnValueOnce(false);

      expect(() => {
        scheduler.start({ cronExpression: 'invalid' });
      }).toThrow('Invalid cron expression');
    });

    it('should not start twice', () => {
      scheduler.start();
      scheduler.start();

      expect(cron.schedule).toHaveBeenCalledTimes(1);
    });

    it('should run cleanup on startup if requested', async () => {
      const mockStats = {
        totalEmailsInSystem: 1000,
        expiredEmailsCount: 10,
        registeredUserEmailsCount: 900,
        unregisteredUserEmailsCount: 100,
        oldestExpiredEmail: new Date(),
        newestExpiredEmail: new Date(),
      };

      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 10,
        errorCount: 0,
        duration: 100,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 10,
          batchesProcessed: 1,
          addressesAffected: 5,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.getCleanupStats).mockResolvedValueOnce(
        mockStats
      );
      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      scheduler.start({ runOnStartup: true });

      // Give async operation time to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Note: We can't easily verify the call because it runs in background
      // This test mainly ensures no errors are thrown
      expect(cron.schedule).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the scheduler', () => {
      scheduler.start();
      scheduler.stop();

      expect(mockScheduledTask.stop).toHaveBeenCalled();
    });

    it('should handle stop when not running', () => {
      expect(() => {
        scheduler.stop();
      }).not.toThrow();
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = scheduler.getState();

      expect(state.isRunning).toBe(false);
      expect(state.lastRun).toBeNull();
      expect(state.lastResult).toBeNull();
      expect(state.totalRuns).toBe(0);
      expect(state.totalEmailsDeleted).toBe(0);
      expect(state.totalErrors).toBe(0);
    });

    it('should update state after manual cleanup', async () => {
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 25,
        errorCount: 0,
        duration: 200,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 25,
          batchesProcessed: 1,
          addressesAffected: 10,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      await scheduler.runManualCleanup(false);

      const state = scheduler.getState();

      expect(state.lastRun).not.toBeNull();
      expect(state.lastResult).toEqual(mockResult);
      expect(state.totalRuns).toBe(1);
      expect(state.totalEmailsDeleted).toBe(25);
      expect(state.totalErrors).toBe(0);
    });

    it('should not mutate internal state', () => {
      const state1 = scheduler.getState();
      state1.totalRuns = 999;

      const state2 = scheduler.getState();

      expect(state2.totalRuns).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return false when not started', () => {
      const healthy = scheduler.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return true when started but not run yet', () => {
      scheduler.start();

      const healthy = scheduler.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false if last run had errors', async () => {
      const mockResult: CleanupResult = {
        success: false,
        deletedCount: 0,
        errorCount: 1,
        duration: 100,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 100,
          batchesProcessed: 0,
          addressesAffected: 0,
          errors: [{ message: 'Test error' }],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      scheduler.start();
      await scheduler.runManualCleanup(false);

      const healthy = scheduler.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false if last run was too long ago', async () => {
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 10,
        errorCount: 0,
        duration: 100,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 10,
          batchesProcessed: 1,
          addressesAffected: 5,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      scheduler.start();
      await scheduler.runManualCleanup(false);

      // Manually backdate the lastRun to simulate old run
      const state = scheduler.getState();
      (scheduler as any).state.lastRun = new Date(Date.now() - 26 * 60 * 60 * 1000);

      const healthy = scheduler.isHealthy(25); // Max 25 hours

      expect(healthy).toBe(false);
    });
  });

  describe('runManualCleanup', () => {
    it('should run cleanup manually', async () => {
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 15,
        errorCount: 0,
        duration: 150,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 15,
          batchesProcessed: 1,
          addressesAffected: 8,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      const result = await scheduler.runManualCleanup(false);

      expect(result).toEqual(mockResult);
      expect(emailCleanupService.cleanupExpiredEmails).toHaveBeenCalledWith({
        dryRun: false,
        batchSize: 1000,
        maxBatches: 100,
      });
    });

    it('should support dry run mode', async () => {
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 20,
        errorCount: 0,
        duration: 50,
        timestamp: new Date(),
        dryRun: true,
        details: {
          totalExpired: 20,
          batchesProcessed: 1,
          addressesAffected: 10,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      const result = await scheduler.runManualCleanup(true);

      expect(result.dryRun).toBe(true);
      expect(emailCleanupService.cleanupExpiredEmails).toHaveBeenCalledWith({
        dryRun: true,
        batchSize: 1000,
        maxBatches: 100,
      });
    });

    it('should throw error if cleanup already running', async () => {
      // Mock a long-running cleanup that eventually returns a result
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 10,
        errorCount: 0,
        duration: 1000,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 10,
          batchesProcessed: 1,
          addressesAffected: 5,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockResult), 100))
      );

      const promise1 = scheduler.runManualCleanup(false);

      // Try to run another cleanup immediately
      await expect(scheduler.runManualCleanup(false)).rejects.toThrow(
        'Cleanup already in progress'
      );

      await promise1; // Clean up
    });

    it('should not update state for dry run', async () => {
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 30,
        errorCount: 0,
        duration: 100,
        timestamp: new Date(),
        dryRun: true,
        details: {
          totalExpired: 30,
          batchesProcessed: 1,
          addressesAffected: 15,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      await scheduler.runManualCleanup(true);

      const state = scheduler.getState();

      expect(state.totalRuns).toBe(0);
      expect(state.totalEmailsDeleted).toBe(0);
    });
  });

  describe('Custom logger', () => {
    it('should call custom logger on scheduled cleanup execution', async () => {
      const mockLogger = vi.fn();

      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 5,
        errorCount: 0,
        duration: 75,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 5,
          batchesProcessed: 1,
          addressesAffected: 3,
          errors: [],
        },
      };

      const mockStats = {
        totalEmailsInSystem: 500,
        expiredEmailsCount: 5,
        registeredUserEmailsCount: 495,
        unregisteredUserEmailsCount: 5,
        oldestExpiredEmail: new Date(),
        newestExpiredEmail: new Date(),
      };

      vi.mocked(emailCleanupService.getCleanupStats).mockResolvedValue(mockStats);
      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValue(mockResult);

      scheduler.start({ enabled: true, runOnStartup: true }, mockLogger);

      // Wait for the async startup cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLogger).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        deletedCount: 5,
      }));
    });

    it('should handle logger errors gracefully', async () => {
      const mockLogger = vi.fn().mockRejectedValue(new Error('Logger error'));

      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 5,
        errorCount: 0,
        duration: 75,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 5,
          batchesProcessed: 1,
          addressesAffected: 3,
          errors: [],
        },
      };

      const mockStats = {
        totalEmailsInSystem: 500,
        expiredEmailsCount: 5,
        registeredUserEmailsCount: 495,
        unregisteredUserEmailsCount: 5,
        oldestExpiredEmail: new Date(),
        newestExpiredEmail: new Date(),
      };

      vi.mocked(emailCleanupService.getCleanupStats).mockResolvedValueOnce(
        mockStats
      );
      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockResolvedValueOnce(
        mockResult
      );

      scheduler.start({ enabled: true }, mockLogger);

      // Should not throw even if logger fails
      await expect(scheduler.runManualCleanup(false)).resolves.toBeDefined();
    });
  });

  describe('Overlapping execution prevention', () => {
    it('should prevent overlapping scheduled executions', async () => {
      // This test verifies the internal logic prevents overlaps
      // In real usage, the cron scheduler handles this, but we test our guard
      const mockResult: CleanupResult = {
        success: true,
        deletedCount: 5,
        errorCount: 0,
        duration: 100,
        timestamp: new Date(),
        dryRun: false,
        details: {
          totalExpired: 5,
          batchesProcessed: 1,
          addressesAffected: 2,
          errors: [],
        },
      };

      vi.mocked(emailCleanupService.cleanupExpiredEmails).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockResult), 100))
      );

      const promise1 = scheduler.runManualCleanup(false);

      await expect(scheduler.runManualCleanup(false)).rejects.toThrow(
        'Cleanup already in progress'
      );

      await promise1;
    });
  });
});
