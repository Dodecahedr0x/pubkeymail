/**
 * Email Cleanup Service
 * Handles automated deletion of expired emails for unregistered users
 *
 * CRITICAL SECURITY REQUIREMENTS:
 * - Only delete emails with expires_at < NOW()
 * - Never delete emails for registered users (expires_at IS NULL)
 * - Granular deletion: individual emails, not entire mailboxes
 * - Safety checks: prevent accidental mass deletion
 * - Comprehensive logging and metrics
 *
 * Design Principles:
 * - Batch processing for performance (avoid memory issues)
 * - Dry-run mode for testing
 * - Detailed metrics for monitoring
 * - Transaction-based deletion for consistency
 * - Graceful error handling
 */

import { db } from '../../database/connection.js';
import { metricsService } from '../metrics/metrics-service.js';

/**
 * Cleanup result with detailed metrics
 */
export interface CleanupResult {
  success: boolean;
  deletedCount: number;
  errorCount: number;
  duration: number;
  timestamp: Date;
  dryRun: boolean;
  details: {
    totalExpired: number;
    batchesProcessed: number;
    addressesAffected: number;
    errors: Array<{ message: string; context?: Record<string, unknown> }>;
  };
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
  retentionOverrideDays?: number;
  beforeDate?: Date;
}

/**
 * Cleanup statistics for monitoring
 */
export interface CleanupStats {
  totalEmailsInSystem: number;
  expiredEmailsCount: number;
  registeredUserEmailsCount: number;
  unregisteredUserEmailsCount: number;
  oldestExpiredEmail: Date | null;
  newestExpiredEmail: Date | null;
}

/**
 * Email Cleanup Service
 * Provides methods for cleaning up expired emails
 */
export class EmailCleanupService {
  private static readonly DEFAULT_BATCH_SIZE = 1000;
  private static readonly MAX_BATCHES_PER_RUN = 100;
  private static readonly SAFETY_THRESHOLD = 100000; // Max emails to delete in one run

  /**
   * Get cleanup statistics without performing deletion
   * Useful for monitoring and alerting
   *
   * @param retentionDays - Optional retention period override
   * @returns Cleanup statistics
   */
  async getCleanupStats(_retentionDays?: number): Promise<CleanupStats> {
    // Total emails in system
    const totalResult = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM emails'
    );
    const totalEmailsInSystem = parseInt(totalResult.rows[0]!.count);

    // Expired emails count
    const expiredResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM emails
       WHERE expires_at IS NOT NULL AND expires_at < NOW()`
    );
    const expiredEmailsCount = parseInt(expiredResult.rows[0]!.count);

    // Registered user emails (never expire)
    const registeredResult = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM emails WHERE expires_at IS NULL'
    );
    const registeredUserEmailsCount = parseInt(registeredResult.rows[0]!.count);

    // Unregistered user emails (may expire)
    const unregisteredResult = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM emails WHERE expires_at IS NOT NULL'
    );
    const unregisteredUserEmailsCount = parseInt(unregisteredResult.rows[0]!.count);

    // Oldest and newest expired emails
    const rangeResult = await db.query<{
      oldest: Date | null;
      newest: Date | null;
    }>(
      `SELECT
        MIN(expires_at) as oldest,
        MAX(expires_at) as newest
       FROM emails
       WHERE expires_at IS NOT NULL AND expires_at < NOW()`
    );

    return {
      totalEmailsInSystem,
      expiredEmailsCount,
      registeredUserEmailsCount,
      unregisteredUserEmailsCount,
      oldestExpiredEmail: rangeResult.rows[0]?.oldest || null,
      newestExpiredEmail: rangeResult.rows[0]?.newest || null,
    };
  }

  /**
   * Perform email cleanup
   * Deletes expired emails in batches with safety checks
   *
   * @param options - Cleanup options
   * @returns Cleanup result with metrics
   */
  async cleanupExpiredEmails(
    options: CleanupOptions = {}
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    const {
      dryRun = false,
      batchSize = EmailCleanupService.DEFAULT_BATCH_SIZE,
      maxBatches = EmailCleanupService.MAX_BATCHES_PER_RUN,
      retentionOverrideDays,
      beforeDate,
    } = options;

    const result: CleanupResult = {
      success: false,
      deletedCount: 0,
      errorCount: 0,
      duration: 0,
      timestamp: new Date(),
      dryRun,
      details: {
        totalExpired: 0,
        batchesProcessed: 0,
        addressesAffected: 0,
        errors: [],
      },
    };

    try {
      // Get initial statistics
      const stats = await this.getCleanupStats(retentionOverrideDays);
      result.details.totalExpired = stats.expiredEmailsCount;

      // Safety check: prevent accidental mass deletion
      if (stats.expiredEmailsCount > EmailCleanupService.SAFETY_THRESHOLD) {
        result.details.errors.push({
          message: `Safety threshold exceeded: ${stats.expiredEmailsCount} emails would be deleted (max: ${EmailCleanupService.SAFETY_THRESHOLD})`,
          context: { expiredCount: stats.expiredEmailsCount },
        });
        result.duration = Date.now() - startTime;
        return result;
      }

      // No expired emails to delete
      if (stats.expiredEmailsCount === 0) {
        result.success = true;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Perform batch deletion
      let batchesProcessed = 0;
      let totalDeleted = 0;
      const affectedAddresses = new Set<number>();

      while (batchesProcessed < maxBatches) {
        const batchResult = await this.deleteBatch(
          batchSize,
          dryRun,
          beforeDate
        );

        // Record any errors first
        if (batchResult.error) {
          result.errorCount++;
          result.details.errors.push({
            message: batchResult.error,
            context: { batch: batchesProcessed + 1 },
          });
          // Stop on error - don't continue with potentially corrupted state
          break;
        }

        if (batchResult.deletedCount === 0) {
          // No more emails to delete
          break;
        }

        totalDeleted += batchResult.deletedCount;
        batchesProcessed++;

        // Track affected addresses
        batchResult.affectedAddresses.forEach((id) => affectedAddresses.add(id));
      }

      result.deletedCount = totalDeleted;
      result.details.batchesProcessed = batchesProcessed;
      result.details.addressesAffected = affectedAddresses.size;
      result.success = result.errorCount === 0;
      result.duration = Date.now() - startTime;

      // Record cleanup metrics (skip dry runs so dashboards reflect real work).
      if (!dryRun) {
        metricsService.increment('email_cleanup_runs_total');
        metricsService.increment('email_cleanup_deleted_total', totalDeleted);
        metricsService.gauge('email_cleanup_last_deleted', totalDeleted);
        metricsService.gauge('email_cleanup_last_addresses_affected', affectedAddresses.size);
        metricsService.observe('email_cleanup_duration_ms', result.duration);
      }

      return result;
    } catch (error) {
      result.errorCount++;
      result.details.errors.push({
        message:
          error instanceof Error ? error.message : 'Unknown error during cleanup',
        context: { error },
      });
      result.duration = Date.now() - startTime;
      if (!dryRun) {
        metricsService.increment('email_cleanup_errors_total');
      }
      return result;
    }
  }

  /**
   * Delete a single batch of expired emails
   * Uses transaction for consistency
   *
   * @param batchSize - Number of emails to delete
   * @param dryRun - If true, return count without deleting
   * @param beforeDate - Optional cutoff date
   * @returns Batch result
   */
  private async deleteBatch(
    batchSize: number,
    dryRun: boolean,
    beforeDate?: Date
  ): Promise<{
    deletedCount: number;
    affectedAddresses: number[];
    error?: string;
  }> {
    try {
      // Build WHERE clause
      const conditions = ['expires_at IS NOT NULL', 'expires_at < NOW()'];
      const params: Date[] = [];

      if (beforeDate) {
        params.push(beforeDate);
        conditions.push(`expires_at < $${params.length}`);
      }

      const whereClause = conditions.join(' AND ');

      if (dryRun) {
        // Dry run: just count what would be deleted
        const result = await db.query<{ count: string; addresses: number[] }>(
          `SELECT
            COUNT(*) as count,
            ARRAY_AGG(DISTINCT recipient_address_id) as addresses
           FROM (
             SELECT id, recipient_address_id
             FROM emails
             WHERE ${whereClause}
             LIMIT $${params.length + 1}
           ) subquery`,
          [...params, batchSize]
        );

        return {
          deletedCount: parseInt(result.rows[0]!.count),
          affectedAddresses: result.rows[0]!.addresses || [],
        };
      }

      // Actual deletion: use transaction for consistency
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Get IDs and addresses to delete
        const selectResult = await client.query<{
          id: string;
          recipient_address_id: number;
        }>(
          `SELECT id, recipient_address_id
           FROM emails
           WHERE ${whereClause}
           LIMIT $${params.length + 1}
           FOR UPDATE`,
          [...params, batchSize]
        );

        if (selectResult.rows.length === 0) {
          await client.query('COMMIT');
          return {
            deletedCount: 0,
            affectedAddresses: [],
          };
        }

        const emailIds = selectResult.rows.map((row: { id: string; recipient_address_id: number }) => row.id);
        const affectedAddresses: number[] = [
          ...new Set(selectResult.rows.map((row: { id: string; recipient_address_id: number }) => row.recipient_address_id)),
        ];

        // Delete emails
        const deleteResult = await client.query(
          'DELETE FROM emails WHERE id = ANY($1::uuid[])',
          [emailIds]
        );

        await client.query('COMMIT');

        return {
          deletedCount: deleteResult.rowCount || 0,
          affectedAddresses,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        deletedCount: 0,
        affectedAddresses: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get emails that will be deleted on next cleanup
   * Useful for debugging and monitoring
   *
   * @param limit - Maximum number of emails to return
   * @returns Array of email IDs and metadata
   */
  async getExpiredEmailsPreview(limit = 100): Promise<
    Array<{
      id: string;
      recipientAddressId: number;
      recipientEmail: string;
      receivedAt: Date;
      expiresAt: Date;
      daysUntilExpiry: number;
    }>
  > {
    const result = await db.query<{
      id: string;
      recipient_address_id: number;
      recipient_email: string;
      received_at: Date;
      expires_at: Date;
    }>(
      `SELECT
        id,
        recipient_address_id,
        recipient_email,
        received_at,
        expires_at
       FROM emails
       WHERE expires_at IS NOT NULL AND expires_at < NOW()
       ORDER BY expires_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      recipientAddressId: row.recipient_address_id,
      recipientEmail: row.recipient_email,
      receivedAt: new Date(row.received_at),
      expiresAt: new Date(row.expires_at),
      daysUntilExpiry: Math.floor(
        (new Date(row.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    }));
  }

  /**
   * Force cleanup for specific address (admin function)
   * Use with caution - bypasses normal retention rules
   *
   * @param addressId - Blockchain address ID
   * @param olderThanDays - Delete emails older than this many days
   * @param dryRun - If true, return count without deleting
   * @returns Number of emails deleted
   */
  async cleanupAddressEmails(
    addressId: number,
    olderThanDays: number,
    dryRun = false
  ): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    if (dryRun) {
      const result = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM emails
         WHERE recipient_address_id = $1
           AND received_at < $2
           AND expires_at IS NOT NULL`,
        [addressId, cutoffDate]
      );
      return parseInt(result.rows[0]!.count);
    }

    const result = await db.query(
      `DELETE FROM emails
       WHERE recipient_address_id = $1
         AND received_at < $2
         AND expires_at IS NOT NULL`,
      [addressId, cutoffDate]
    );

    return result.rowCount || 0;
  }
}

/**
 * Singleton instance
 */
export const emailCleanupService = new EmailCleanupService();
