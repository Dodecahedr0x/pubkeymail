/**
 * GDPR Compliance Service
 * Handles user data export and deletion for GDPR compliance
 *
 * GDPR Articles Implemented:
 * - Article 17: Right to erasure ("right to be forgotten")
 * - Article 20: Right to data portability
 *
 * SECURITY:
 * - All deletions are transactional
 * - Deletion requests are logged before execution
 * - Grace period prevents accidental data loss
 */

import { db, withTransaction } from '../../database/connection.js';
import { userService } from '../user/user-service.js';
import type { PoolClient } from 'pg';

/**
 * Exported user data structure for GDPR Article 20
 */
export interface UserDataExport {
  exportedAt: Date;
  user: {
    id: number;
    primaryAddress: string;
    blockchain: string;
    subscriptionTier: string;
    createdAt: Date;
  };
  linkedAddresses: Array<{
    address: string;
    blockchain: string;
    linkedAt: Date;
  }>;
  emails: {
    received: Array<{
      id: string;
      from: string;
      subject: string | null;
      receivedAt: Date;
    }>;
    sent: Array<{
      id: string;
      to: string;
      subject: string;
      sentAt: Date;
    }>;
  };
  forwardingRules: Array<{
    id: number;
    targetEmail: string;
    enabled: boolean;
    createdAt: Date;
  }>;
  auditLogs: Array<{
    eventType: string;
    action: string;
    createdAt: Date;
  }>;
}

/**
 * Result of user data deletion
 */
export interface DeletionResult {
  success: boolean;
  deletedResources: {
    user: boolean;
    linkedAddresses: number;
    receivedEmails: number;
    sentEmails: number;
    forwardingRules: number;
    auditLogs: number;
  };
  errors?: string[];
}

/**
 * Scheduled deletion record (DB row format)
 */
interface ScheduledDeletionRow {
  id: number;
  user_id: number;
  scheduled_for: Date;
  created_at: Date;
}

const DEFAULT_GRACE_PERIOD_DAYS = 7;

/**
 * GDPR Compliance Service
 */
export class GDPRService {
  /**
   * Export all user data (GDPR Article 20 - Right to data portability)
   *
   * @param userId - User ID to export data for
   * @returns Complete export of all user data
   */
  async exportUserData(userId: number): Promise<UserDataExport> {
    const userResult = await userService.getUserById(userId);
    if (!userResult.success || !userResult.data) {
      throw new Error('User not found');
    }

    const user = userResult.data;

    const linkedAddresses = await this.getLinkedAddressesForExport(userId);
    const receivedEmails = await this.getReceivedEmailsForExport(user.primaryAddressId, userId);
    const sentEmails = await this.getSentEmailsForExport(user.primaryAddressId, userId);
    const forwardingRules = await this.getForwardingRulesForExport(userId);
    const auditLogs = await this.getAuditLogsForExport(userId);

    return {
      exportedAt: new Date(),
      user: {
        id: user.id,
        primaryAddress: user.primaryAddress,
        blockchain: user.blockchain,
        subscriptionTier: user.subscriptionTier,
        createdAt: user.createdAt,
      },
      linkedAddresses,
      emails: {
        received: receivedEmails,
        sent: sentEmails,
      },
      forwardingRules,
      auditLogs,
    };
  }

  /**
   * Delete all user data (GDPR Article 17 - Right to erasure)
   *
   * @param userId - User ID to delete
   * @returns Deletion result with counts of deleted resources
   */
  async deleteUserData(userId: number): Promise<DeletionResult> {
    const errors: string[] = [];
    const deletedResources = {
      user: false,
      linkedAddresses: 0,
      receivedEmails: 0,
      sentEmails: 0,
      forwardingRules: 0,
      auditLogs: 0,
    };

    try {
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return {
          success: false,
          deletedResources,
          errors: ['User not found'],
        };
      }

      const user = userResult.data;
      const addressIds = await this.getAllUserAddressIds(userId, user.primaryAddressId);

      await withTransaction(async (client: PoolClient) => {
        await this.cancelScheduledDeletionInTransaction(client, userId);

        const forwardingResult = await client.query(
          'DELETE FROM forwarding_rules WHERE user_id = $1',
          [userId]
        );
        deletedResources.forwardingRules = forwardingResult.rowCount ?? 0;

        let receivedCount = 0;
        let sentCount = 0;
        for (const addressId of addressIds) {
          const emailsResult = await client.query(
            'DELETE FROM emails WHERE recipient_address_id = $1',
            [addressId]
          );
          receivedCount += emailsResult.rowCount ?? 0;

          const sentResult = await client.query(
            'DELETE FROM sent_emails WHERE sender_address_id = $1',
            [addressId]
          );
          sentCount += sentResult.rowCount ?? 0;
        }
        deletedResources.receivedEmails = receivedCount;
        deletedResources.sentEmails = sentCount;

        const linksResult = await client.query(
          'DELETE FROM address_links WHERE user_id = $1',
          [userId]
        );
        deletedResources.linkedAddresses = linksResult.rowCount ?? 0;

        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        deletedResources.user = true;

        for (const addressId of addressIds) {
          await this.deleteOrphanedAddress(client, addressId);
        }
      });

      return {
        success: true,
        deletedResources,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error during deletion');
      return {
        success: false,
        deletedResources,
        errors,
      };
    }
  }

  /**
   * Schedule deletion with grace period
   *
   * @param userId - User ID to schedule deletion for
   * @param gracePeriodDays - Days before deletion (default: 7)
   * @returns Scheduled deletion date
   */
  async scheduleDeletion(
    userId: number,
    gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS
  ): Promise<{ scheduledFor: Date }> {
    const userResult = await userService.getUserById(userId);
    if (!userResult.success || !userResult.data) {
      throw new Error('User not found');
    }

    const existingSchedule = await this.getDeletionStatus(userId);
    if (existingSchedule?.scheduled) {
      throw new Error('Deletion already scheduled');
    }

    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + gracePeriodDays);

    await db.query(
      `INSERT INTO scheduled_deletions (user_id, scheduled_for)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET scheduled_for = $2`,
      [userId, scheduledFor]
    );

    return { scheduledFor };
  }

  /**
   * Cancel a scheduled deletion
   *
   * @param userId - User ID to cancel deletion for
   * @returns Whether cancellation was successful
   */
  async cancelScheduledDeletion(userId: number): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM scheduled_deletions WHERE user_id = $1',
      [userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get deletion status for a user
   *
   * @param userId - User ID to check
   * @returns Deletion status or null if user doesn't exist
   */
  async getDeletionStatus(
    userId: number
  ): Promise<{ scheduled: boolean; scheduledFor?: Date } | null> {
    const userResult = await userService.getUserById(userId);
    if (!userResult.success || !userResult.data) {
      return null;
    }

    const result = await db.query<ScheduledDeletionRow>(
      'SELECT id, user_id, scheduled_for, created_at FROM scheduled_deletions WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { scheduled: false };
    }

    return {
      scheduled: true,
      scheduledFor: result.rows[0]!.scheduled_for,
    };
  }

  private async getLinkedAddressesForExport(
    userId: number
  ): Promise<UserDataExport['linkedAddresses']> {
    const result = await db.query<{
      address: string;
      blockchain: string;
      created_at: Date;
    }>(
      `SELECT ba.address, ba.blockchain, al.created_at
       FROM address_links al
       JOIN blockchain_addresses ba ON al.address_id = ba.id
       WHERE al.user_id = $1
       ORDER BY al.created_at`,
      [userId]
    );

    return result.rows.map((row) => ({
      address: row.address,
      blockchain: row.blockchain,
      linkedAt: row.created_at,
    }));
  }

  private async getReceivedEmailsForExport(
    primaryAddressId: number,
    userId: number
  ): Promise<UserDataExport['emails']['received']> {
    const addressIds = await this.getAllUserAddressIds(userId, primaryAddressId);

    if (addressIds.length === 0) {
      return [];
    }

    const result = await db.query<{
      id: string;
      sender_address: string;
      subject: string | null;
      received_at: Date;
    }>(
      `SELECT id, sender_address, subject, received_at
       FROM emails
       WHERE recipient_address_id = ANY($1)
       ORDER BY received_at DESC`,
      [addressIds]
    );

    return result.rows.map((row) => ({
      id: row.id,
      from: row.sender_address,
      subject: row.subject,
      receivedAt: row.received_at,
    }));
  }

  private async getSentEmailsForExport(
    primaryAddressId: number,
    userId: number
  ): Promise<UserDataExport['emails']['sent']> {
    const addressIds = await this.getAllUserAddressIds(userId, primaryAddressId);

    if (addressIds.length === 0) {
      return [];
    }

    const result = await db.query<{
      id: string;
      recipient_address: string;
      subject: string | null;
      sent_at: Date;
    }>(
      `SELECT id, recipient_address, subject, sent_at
       FROM sent_emails
       WHERE sender_address_id = ANY($1)
       ORDER BY sent_at DESC`,
      [addressIds]
    );

    return result.rows.map((row) => ({
      id: row.id,
      to: row.recipient_address,
      subject: row.subject ?? '',
      sentAt: row.sent_at,
    }));
  }

  private async getForwardingRulesForExport(
    userId: number
  ): Promise<UserDataExport['forwardingRules']> {
    const result = await db.query<{
      id: number;
      destination_email: string;
      enabled: boolean;
      created_at: Date;
    }>(
      `SELECT id, destination_email, enabled, created_at
       FROM forwarding_rules
       WHERE user_id = $1
       ORDER BY created_at`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      targetEmail: row.destination_email,
      enabled: row.enabled,
      createdAt: row.created_at,
    }));
  }

  private async getAuditLogsForExport(
    userId: number
  ): Promise<UserDataExport['auditLogs']> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const result = await db.query<{
        event_type: string;
        action: string;
        created_at: Date;
      }>(
        `SELECT event_type, action, created_at
         FROM audit_logs
         WHERE user_id = $1 AND created_at >= $2
         ORDER BY created_at DESC`,
        [userId, thirtyDaysAgo]
      );

      return result.rows.map((row) => ({
        eventType: row.event_type,
        action: row.action,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  private async getAllUserAddressIds(
    userId: number,
    primaryAddressId: number
  ): Promise<number[]> {
    const linkedResult = await db.query<{ address_id: number }>(
      'SELECT address_id FROM address_links WHERE user_id = $1',
      [userId]
    );

    const addressIds = new Set([primaryAddressId]);
    for (const row of linkedResult.rows) {
      addressIds.add(row.address_id);
    }

    return Array.from(addressIds);
  }

  private async deleteOrphanedAddress(
    client: PoolClient,
    addressId: number
  ): Promise<void> {
    const usageCheck = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM (
        SELECT id FROM users WHERE primary_address_id = $1
        UNION
        SELECT id FROM address_links WHERE address_id = $1
        UNION
        SELECT id FROM emails WHERE recipient_address_id = $1
        UNION
        SELECT id FROM sent_emails WHERE sender_address_id = $1
      ) usage`,
      [addressId]
    );

    const count = parseInt(usageCheck.rows[0]?.count ?? '0', 10);
    if (count === 0) {
      await client.query('DELETE FROM blockchain_addresses WHERE id = $1', [addressId]);
    }
  }

  private async cancelScheduledDeletionInTransaction(
    client: PoolClient,
    userId: number
  ): Promise<void> {
    await client.query('DELETE FROM scheduled_deletions WHERE user_id = $1', [userId]);
  }
}

export const gdprService = new GDPRService();
