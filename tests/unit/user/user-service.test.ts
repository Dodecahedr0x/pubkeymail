/**
 * User Service Tests
 * Tests for user registration, profile management, and subscription tiers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../../../src/services/user/user-service.js';
import { db } from '../../../src/database/connection.js';

vi.mock('../../../src/database/connection.js', () => ({
  db: {
    query: vi.fn(),
    getClient: vi.fn(),
  },
}));

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      // Mock: no existing user
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] }) // getUserByAddress - primary check
        .mockResolvedValueOnce({ rows: [] }) // getUserByAddress - linked check
        .mockResolvedValueOnce({ rows: [] }) // getOrCreateBlockchainAddress - existing check
        .mockResolvedValueOnce({
          rows: [{ id: 1, address: 'TestAddress123', blockchain: 'solana' }],
        }) // create blockchain address
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              primary_address_id: 1,
              subscription_status: 'inactive',
              subscription_tier: 'free',
              payment_provider: null,
              payment_id: null,
              subscription_expires_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }); // create user

      const result = await userService.registerUser({
        address: 'TestAddress123',
        blockchain: 'solana',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.primaryAddress).toBe('TestAddress123');
      expect(result.data!.blockchain).toBe('solana');
      expect(result.data!.subscriptionStatus).toBe('inactive');
      expect(result.data!.subscriptionTier).toBe('free');
    });

    it('should reject registration for existing user', async () => {
      // Mock: existing user found
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            primary_address_id: 1,
            address: 'TestAddress123',
            blockchain: 'solana',
            subscription_status: 'active',
            subscription_tier: 'paid',
            payment_provider: null,
            payment_id: null,
            subscription_expires_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      // Mock: linked addresses
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      const result = await userService.registerUser({
        address: 'TestAddress123',
        blockchain: 'solana',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });
  });

  describe('getUserByAddress', () => {
    it('should return user profile by address', async () => {
      const mockUser = {
        id: 1,
        primary_address_id: 1,
        address: 'TestAddress123',
        blockchain: 'solana',
        subscription_status: 'active',
        subscription_tier: 'paid',
        payment_provider: 'stripe',
        payment_id: 'sub_123',
        subscription_expires_at: new Date('2025-01-01'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-06-01'),
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [mockUser] }) // primary lookup
        .mockResolvedValueOnce({ rows: [] }); // linked addresses

      const result = await userService.getUserByAddress('TestAddress123');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(1);
      expect(result.data!.primaryAddress).toBe('TestAddress123');
      expect(result.data!.subscriptionTier).toBe('paid');
    });

    it('should return error for non-existent user', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] }) // primary lookup
        .mockResolvedValueOnce({ rows: [] }); // linked lookup

      const result = await userService.getUserByAddress('NonExistent123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should find user by linked address', async () => {
      const mockUser = {
        id: 1,
        primary_address_id: 1,
        address: 'PrimaryAddress123',
        blockchain: 'solana',
        subscription_status: 'active',
        subscription_tier: 'free',
        payment_provider: null,
        payment_id: null,
        subscription_expires_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] }) // primary lookup fails
        .mockResolvedValueOnce({ rows: [{ user_id: 1 }] }) // linked lookup finds user
        .mockResolvedValueOnce({ rows: [mockUser] }) // getUserById lookup
        .mockResolvedValueOnce({ rows: [] }); // linked addresses

      const result = await userService.getUserByAddress('LinkedAddress123');

      expect(result.success).toBe(true);
      expect(result.data?.primaryAddress).toBe('PrimaryAddress123');
    });
  });

  describe('updateUser', () => {
    it('should update subscription status', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rowCount: 1 }) // update
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              primary_address_id: 1,
              address: 'TestAddress',
              blockchain: 'solana',
              subscription_status: 'active',
              subscription_tier: 'paid',
              payment_provider: 'stripe',
              payment_id: 'sub_123',
              subscription_expires_at: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }) // getUserById
        .mockResolvedValueOnce({ rows: [] }); // linked addresses

      const result = await userService.updateUser(1, {
        subscriptionStatus: 'active',
        subscriptionTier: 'paid',
      });

      expect(result.success).toBe(true);
      expect(result.data?.subscriptionStatus).toBe('active');
    });
  });

  describe('upgradeSubscription', () => {
    it('should upgrade to paid tier and remove email expiration', async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      vi.mocked(db.getClient).mockResolvedValue(mockClient as any);

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // UPDATE users
        .mockResolvedValueOnce({ rows: [{ primary_address_id: 1 }] }) // get primary address
        .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE emails
        .mockResolvedValueOnce(undefined); // COMMIT

      // Mock getUserById after upgrade
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              primary_address_id: 1,
              address: 'TestAddress',
              blockchain: 'solana',
              subscription_status: 'active',
              subscription_tier: 'paid',
              payment_provider: 'stripe',
              payment_id: 'sub_123',
              subscription_expires_at: new Date('2025-01-01'),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // linked addresses

      const result = await userService.upgradeSubscription(
        1,
        'stripe',
        'sub_123',
        new Date('2025-01-01')
      );

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('linkAddress', () => {
    it('should link a new address to user', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [] }) // getOrCreateBlockchainAddress - check existing
        .mockResolvedValueOnce({
          rows: [{ id: 2, address: 'NewAddress123', blockchain: 'solana' }],
        }) // create address
        .mockResolvedValueOnce({ rows: [] }) // check existing link
        .mockResolvedValueOnce({ rows: [] }) // check linked to other user
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              address_id: 2,
              verified_at: new Date(),
              created_at: new Date(),
            },
          ],
        }); // create link

      const result = await userService.linkAddress(1, 'NewAddress123', 'solana');

      expect(result.success).toBe(true);
      expect(result.data?.address).toBe('NewAddress123');
    });

    it('should reject already linked address', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({
          rows: [{ id: 2, address: 'ExistingAddress', blockchain: 'solana' }],
        }) // address exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // already linked

      const result = await userService.linkAddress(1, 'ExistingAddress', 'solana');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already linked');
    });
  });

  describe('unlinkAddress', () => {
    it('should unlink an address', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [{ primary_address_id: 1 }] }) // get user
        .mockResolvedValueOnce({ rowCount: 1 }); // delete link

      const result = await userService.unlinkAddress(1, 2);

      expect(result.success).toBe(true);
    });

    it('should reject unlinking primary address', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ primary_address_id: 1 }],
      });

      const result = await userService.unlinkAddress(1, 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('primary');
    });
  });

  describe('isAddressRegistered', () => {
    it('should return true for registered primary address', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await userService.isAddressRegistered('RegisteredAddress');

      expect(result).toBe(true);
    });

    it('should return true for linked address', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // primary check - not found
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // linked check - found

      const result = await userService.isAddressRegistered('LinkedAddress');

      expect(result).toBe(true);
    });

    it('should return false for unregistered address', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // primary check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // linked check

      const result = await userService.isAddressRegistered('UnknownAddress');

      expect(result).toBe(false);
    });
  });
});
