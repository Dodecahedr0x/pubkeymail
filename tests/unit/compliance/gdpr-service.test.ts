/**
 * GDPR Service Tests
 * Tests for user data export and deletion
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GDPRService } from '../../../src/services/compliance/gdpr-service.js';
import { db, withTransaction } from '../../../src/database/connection.js';
import { userService } from '../../../src/services/user/user-service.js';

vi.mock('../../../src/database/connection.js', () => ({
  db: {
    query: vi.fn(),
    getClient: vi.fn(),
  },
  withTransaction: vi.fn(),
}));

vi.mock('../../../src/services/user/user-service.js', () => ({
  userService: {
    getUserById: vi.fn(),
    getUserByAddress: vi.fn(),
  },
}));

describe('GDPRService', () => {
  let gdprService: GDPRService;

  const mockUser = {
    id: 1,
    primaryAddressId: 10,
    primaryAddress: 'TestAddress123',
    blockchain: 'solana' as const,
    subscriptionStatus: 'active' as const,
    subscriptionTier: 'paid' as const,
    paymentProvider: null,
    paymentId: null,
    subscriptionExpiresAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    linkedAddresses: [],
  };

  beforeEach(() => {
    gdprService = new GDPRService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportUserData', () => {
    it('should export all user data successfully', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({
          rows: [
            { address: 'LinkedAddress1', blockchain: 'solana', created_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ address_id: 11 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'email-1',
              sender_address: 'sender@test.com',
              subject: 'Test Subject',
              received_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ address_id: 11 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sent-1',
              recipient_address: 'recipient@test.com',
              subject: 'Sent Subject',
              sent_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              destination_email: 'forward@test.com',
              enabled: true,
              created_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.exportUserData(1);

      expect(result.exportedAt).toBeDefined();
      expect(result.user.id).toBe(1);
      expect(result.user.primaryAddress).toBe('TestAddress123');
      expect(result.linkedAddresses).toHaveLength(1);
      expect(result.emails.received).toHaveLength(1);
      expect(result.emails.sent).toHaveLength(1);
      expect(result.forwardingRules).toHaveLength(1);
    });

    it('should throw error for non-existent user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      await expect(gdprService.exportUserData(999)).rejects.toThrow('User not found');
    });

    it('should include empty arrays when user has no data', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.exportUserData(1);

      expect(result.linkedAddresses).toHaveLength(0);
      expect(result.emails.received).toHaveLength(0);
      expect(result.emails.sent).toHaveLength(0);
      expect(result.forwardingRules).toHaveLength(0);
      expect(result.auditLogs).toHaveLength(0);
    });

    it('should handle audit logs query failure gracefully', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Table does not exist'));

      const result = await gdprService.exportUserData(1);

      expect(result.auditLogs).toHaveLength(0);
    });
  });

  describe('deleteUserData', () => {
    it('should delete all user data successfully', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ address_id: 11 }],
      });

      const mockClient = {
        query: vi.fn().mockImplementation((query: string) => {
          if (query.includes('DELETE FROM scheduled_deletions')) {
            return { rowCount: 0 };
          }
          if (query.includes('DELETE FROM forwarding_rules')) {
            return { rowCount: 2 };
          }
          if (query.includes('DELETE FROM emails')) {
            return { rowCount: 5 };
          }
          if (query.includes('DELETE FROM sent_emails')) {
            return { rowCount: 3 };
          }
          if (query.includes('DELETE FROM address_links')) {
            return { rowCount: 1 };
          }
          if (query.includes('DELETE FROM users')) {
            return { rowCount: 1 };
          }
          if (query.includes('COUNT(*)')) {
            return { rows: [{ count: '1' }] };
          }
          return { rowCount: 0 };
        }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementation(async (callback) => {
        return callback(mockClient as any);
      });

      const result = await gdprService.deleteUserData(1);

      expect(result.success).toBe(true);
      expect(result.deletedResources.user).toBe(true);
      expect(result.deletedResources.forwardingRules).toBe(2);
    });

    it('should return error for non-existent user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await gdprService.deleteUserData(999);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('User not found');
    });

    it('should handle transaction errors', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      vi.mocked(withTransaction).mockRejectedValueOnce(new Error('Transaction failed'));

      const result = await gdprService.deleteUserData(1);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Transaction failed');
    });

    it('should delete emails from all linked addresses', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ address_id: 11 }, { address_id: 12 }],
      });

      const deleteQueries: string[] = [];
      const mockClient = {
        query: vi.fn().mockImplementation((query: string) => {
          deleteQueries.push(query);
          if (query.includes('DELETE FROM emails')) {
            return { rowCount: 2 };
          }
          if (query.includes('DELETE FROM sent_emails')) {
            return { rowCount: 1 };
          }
          if (query.includes('count')) {
            return { rows: [{ count: '1' }] };
          }
          return { rowCount: 1 };
        }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementation(async (callback) => {
        return callback(mockClient as any);
      });

      const result = await gdprService.deleteUserData(1);

      expect(result.success).toBe(true);
      const emailDeletes = deleteQueries.filter((q) => q.includes('DELETE FROM emails'));
      expect(emailDeletes.length).toBeGreaterThan(0);
    });
  });

  describe('scheduleDeletion', () => {
    it('should schedule deletion with default grace period', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.scheduleDeletion(1);

      expect(result.scheduledFor).toBeDefined();
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 7);
      expect(result.scheduledFor.getDate()).toBe(expectedDate.getDate());
    });

    it('should schedule deletion with custom grace period', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.scheduleDeletion(1, 14);

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 14);
      expect(result.scheduledFor.getDate()).toBe(expectedDate.getDate());
    });

    it('should throw error if user not found', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      await expect(gdprService.scheduleDeletion(999)).rejects.toThrow('User not found');
    });

    it('should throw error if deletion already scheduled', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 1, scheduled_for: new Date(), created_at: new Date() }],
      });

      await expect(gdprService.scheduleDeletion(1)).rejects.toThrow(
        'Deletion already scheduled'
      );
    });
  });

  describe('cancelScheduledDeletion', () => {
    it('should cancel scheduled deletion successfully', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 });

      const result = await gdprService.cancelScheduledDeletion(1);

      expect(result).toBe(true);
    });

    it('should return false if no deletion was scheduled', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 0 });

      const result = await gdprService.cancelScheduledDeletion(1);

      expect(result).toBe(false);
    });
  });

  describe('getDeletionStatus', () => {
    it('should return scheduled status when deletion is pending', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      const scheduledDate = new Date('2024-01-15');
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 1, scheduled_for: scheduledDate, created_at: new Date() }],
      });

      const result = await gdprService.getDeletionStatus(1);

      expect(result).not.toBeNull();
      expect(result!.scheduled).toBe(true);
      expect(result!.scheduledFor).toEqual(scheduledDate);
    });

    it('should return not scheduled when no deletion is pending', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.getDeletionStatus(1);

      expect(result).not.toBeNull();
      expect(result!.scheduled).toBe(false);
      expect(result!.scheduledFor).toBeUndefined();
    });

    it('should return null for non-existent user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await gdprService.getDeletionStatus(999);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle user with multiple linked addresses during export', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({
          rows: [
            { address: 'Addr1', blockchain: 'solana', created_at: new Date() },
            { address: 'Addr2', blockchain: 'ethereum', created_at: new Date() },
            { address: 'Addr3', blockchain: 'polygon', created_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ address_id: 11 }, { address_id: 12 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ address_id: 11 }, { address_id: 12 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.exportUserData(1);

      expect(result.linkedAddresses).toHaveLength(3);
    });

    it('should handle null subject in sent emails', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: mockUser,
      });

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sent-1',
              recipient_address: 'test@test.com',
              subject: null,
              sent_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await gdprService.exportUserData(1);

      expect(result.emails.sent[0]!.subject).toBe('');
    });
  });
});
