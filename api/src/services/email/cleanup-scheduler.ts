/**
 * Email Cleanup Scheduler
 * Runs cleanup jobs on a schedule using node-cron
 *
 * Design:
 * - Configurable schedule (default: daily at 2 AM)
 * - Prevents overlapping executions
 * - Comprehensive logging
 * - Graceful shutdown handling
 * - Health check support
 */

import cron from 'node-cron';
import { emailCleanupService, type CleanupResult } from './cleanup-service.js';
import { emailConfig } from '../../config/index.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('CleanupScheduler');

/**
 * Scheduler state for monitoring
 */
export interface SchedulerState {
  isRunning: boolean;
  lastRun: Date | null;
  lastResult: CleanupResult | null;
  nextScheduledRun: Date | null;
  totalRuns: number;
  totalEmailsDeleted: number;
  totalErrors: number;
}

/**
 * Scheduler options
 */
export interface SchedulerOptions {
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  runOnStartup?: boolean;
}

/**
 * Cleanup result logger function type
 */
type CleanupLogger = (result: CleanupResult) => void | Promise<void>;

/**
 * Email Cleanup Scheduler
 * Manages scheduled execution of email cleanup jobs
 */
export class EmailCleanupScheduler {
  private task: cron.ScheduledTask | null = null;
  private state: SchedulerState = {
    isRunning: false,
    lastRun: null,
    lastResult: null,
    nextScheduledRun: null,
    totalRuns: 0,
    totalEmailsDeleted: 0,
    totalErrors: 0,
  };
  private logger: CleanupLogger | null = null;

  /**
   * Start the scheduler
   *
   * @param options - Scheduler configuration
   * @param logger - Optional logger function
   */
  start(options: SchedulerOptions = {}, logger?: CleanupLogger): void {
    const {
      cronExpression = this.getDefaultCronExpression(),
      timezone = 'UTC',
      enabled = true,
      runOnStartup = false,
    } = options;

    if (!enabled) {
      log.info('Scheduler is disabled');
      return;
    }

    if (this.task) {
      log.debug('Scheduler already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    this.logger = logger || null;

    // Create scheduled task
    this.task = cron.schedule(
      cronExpression,
      async () => {
        await this.executeCleanup();
      },
      {
        scheduled: true,
        timezone,
      }
    );

    log.info('Started with schedule', { cronExpression, timezone });

    // Calculate next run
    this.updateNextScheduledRun(cronExpression);

    // Run immediately on startup if requested
    if (runOnStartup) {
      log.info('Running initial cleanup on startup');
      // Don't await - run in background
      this.executeCleanup().catch((error) => {
        log.error('Startup cleanup failed', { error });
      });
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      log.info('Stopped');
    }
  }

  /**
   * Execute cleanup job
   * Prevents overlapping executions
   */
  private async executeCleanup(): Promise<void> {
    // Prevent overlapping executions
    if (this.state.isRunning) {
      log.warn('Cleanup already running, skipping this execution');
      return;
    }

    this.state.isRunning = true;
    const startTime = Date.now();

    try {
      log.info('Starting cleanup job');

      // Get stats before cleanup
      const statsBefore = await emailCleanupService.getCleanupStats();
      log.debug('Pre-cleanup stats', {
        totalEmails: statsBefore.totalEmailsInSystem,
        expiredEmails: statsBefore.expiredEmailsCount,
        registeredUserEmails: statsBefore.registeredUserEmailsCount,
      });

      // Perform cleanup
      const result = await emailCleanupService.cleanupExpiredEmails({
        dryRun: false,
        batchSize: 1000,
        maxBatches: 100,
      });

      // Update state
      this.state.lastRun = new Date();
      this.state.lastResult = result;
      this.state.totalRuns++;
      this.state.totalEmailsDeleted += result.deletedCount;
      this.state.totalErrors += result.errorCount;

      // Log result
      const duration = Date.now() - startTime;
      log.info('Cleanup completed', {
        success: result.success,
        deletedCount: result.deletedCount,
        duration: `${duration}ms`,
        batchesProcessed: result.details.batchesProcessed,
        addressesAffected: result.details.addressesAffected,
        errorCount: result.errorCount,
      });

      // Log errors if any
      if (result.details.errors.length > 0) {
        log.error('Cleanup errors', { errors: result.details.errors });
      }

      // Call custom logger if provided
      if (this.logger) {
        try {
          await this.logger(result);
        } catch (error) {
          log.error('Logger failed', { error });
        }
      }
    } catch (error) {
      log.error('Cleanup job failed', { error });
      this.state.totalErrors++;
    } finally {
      this.state.isRunning = false;
    }
  }

  /**
   * Get current scheduler state
   * Useful for monitoring and health checks
   */
  getState(): SchedulerState {
    return { ...this.state };
  }

  /**
   * Check if scheduler is healthy
   * Returns false if last run had errors or hasn't run in too long
   */
  isHealthy(maxHoursSinceLastRun = 25): boolean {
    // Check if scheduler is enabled
    if (!this.task) {
      return false;
    }

    // If never run yet, that's okay
    if (!this.state.lastRun) {
      return true;
    }

    // Check if last run was too long ago
    const hoursSinceLastRun =
      (Date.now() - this.state.lastRun.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastRun > maxHoursSinceLastRun) {
      return false;
    }

    // Check if last run had errors
    if (this.state.lastResult && !this.state.lastResult.success) {
      return false;
    }

    return true;
  }

  /**
   * Trigger manual cleanup
   * Useful for testing or admin operations
   *
   * @param dryRun - If true, simulate cleanup without deleting
   * @returns Cleanup result
   */
  async runManualCleanup(dryRun = false): Promise<CleanupResult> {
    if (this.state.isRunning) {
      throw new Error('Cleanup already in progress');
    }

    this.state.isRunning = true;

    try {
      log.info('Running manual cleanup', { dryRun });

      const result = await emailCleanupService.cleanupExpiredEmails({
        dryRun,
        batchSize: 1000,
        maxBatches: 100,
      });

      if (!dryRun) {
        // Update state if actual cleanup
        this.state.lastRun = new Date();
        this.state.lastResult = result;
        this.state.totalRuns++;
        this.state.totalEmailsDeleted += result.deletedCount;
        this.state.totalErrors += result.errorCount;
      }

      return result;
    } finally {
      this.state.isRunning = false;
    }
  }

  /**
   * Get default cron expression
   * Daily at configured hour (default 2 AM UTC)
   */
  private getDefaultCronExpression(): string {
    const hour = emailConfig.cleanupJobHour;
    return `0 ${hour} * * *`; // Run at specified hour every day
  }

  /**
   * Calculate next scheduled run time
   * Note: This is approximate as node-cron doesn't expose next run time
   */
  private updateNextScheduledRun(cronExpression: string): void {
    // Parse cron expression and calculate next run
    // For simplicity, we'll approximate based on the pattern
    const parts = cronExpression.split(' ');
    if (parts.length >= 5) {
      const minute = parseInt(parts[0] || '0');
      const hour = parseInt(parts[1] || '0');

      const now = new Date();
      const next = new Date();
      next.setUTCHours(hour, minute, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }

      this.state.nextScheduledRun = next;
    }
  }
}

/**
 * Singleton instance
 */
export const emailCleanupScheduler = new EmailCleanupScheduler();

/**
 * Graceful shutdown handler
 * Call this when shutting down the application
 */
export function shutdownCleanupScheduler(): void {
  log.info('Shutting down gracefully...');
  emailCleanupScheduler.stop();
}
