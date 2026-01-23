/**
 * User Service
 * Handles user registration, profile management, and subscription tiers
 *
 * SECURITY NOTES:
 * - All user creation requires wallet signature verification
 * - Subscription status affects email retention policies
 * - Address linking requires signature from the address being linked
 */

import { db } from '../../database/connection.js';
import type { BlockchainType } from '../../types/blockchain.js';

/**
 * User subscription status
 */
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'past_due';

/**
 * User subscription tier
 */
export type SubscriptionTier = 'free' | 'paid';

/**
 * Payment provider type
 */
export type PaymentProvider = 'stripe' | 'solana_pay' | null;

/**
 * User profile data
 */
export interface UserProfile {
  id: number;
  primaryAddressId: number;
  primaryAddress: string;
  blockchain: BlockchainType;
  subscriptionStatus: SubscriptionStatus;
  subscriptionTier: SubscriptionTier;
  paymentProvider: PaymentProvider;
  paymentId: string | null;
  subscriptionExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  linkedAddresses: LinkedAddress[];
}

/**
 * Linked address info
 */
export interface LinkedAddress {
  id: number;
  addressId: number;
  address: string;
  blockchain: BlockchainType;
  verifiedAt: Date;
  createdAt: Date;
}

/**
 * User creation input
 */
export interface CreateUserInput {
  address: string;
  blockchain: BlockchainType;
}

/**
 * User update input
 */
export interface UpdateUserInput {
  subscriptionStatus?: SubscriptionStatus;
  subscriptionTier?: SubscriptionTier;
  paymentProvider?: PaymentProvider;
  paymentId?: string | null;
  subscriptionExpiresAt?: Date | null;
}

/**
 * User service result types
 */
export interface UserServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * User Service Class
 */
export class UserService {
  /**
   * Register a new user with wallet address
   * Creates blockchain_address record if not exists, then creates user
   *
   * @param input - User creation input
   * @returns Created user profile
   */
  async registerUser(input: CreateUserInput): Promise<UserServiceResult<UserProfile>> {
    const { address, blockchain } = input;

    try {
      // Check if user already exists for this address
      const existingUser = await this.getUserByAddress(address);
      if (existingUser.success && existingUser.data) {
        return {
          success: false,
          error: 'User already registered with this address',
        };
      }

      // Get or create blockchain address
      const addressResult = await this.getOrCreateBlockchainAddress(address, blockchain);
      if (!addressResult.success || !addressResult.data) {
        return {
          success: false,
          error: addressResult.error || 'Failed to create blockchain address',
        };
      }

      // Create user
      const userResult = await db.query<{
        id: number;
        primary_address_id: number;
        subscription_status: string;
        subscription_tier: string;
        payment_provider: string | null;
        payment_id: string | null;
        subscription_expires_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO users (primary_address_id, subscription_status, subscription_tier)
         VALUES ($1, 'inactive', 'free')
         RETURNING id, primary_address_id, subscription_status, subscription_tier,
                   payment_provider, payment_id, subscription_expires_at,
                   created_at, updated_at`,
        [addressResult.data.id]
      );

      if (userResult.rows.length === 0) {
        return {
          success: false,
          error: 'Failed to create user',
        };
      }

      const user = userResult.rows[0]!;

      return {
        success: true,
        data: {
          id: user.id,
          primaryAddressId: user.primary_address_id,
          primaryAddress: address,
          blockchain,
          subscriptionStatus: user.subscription_status as SubscriptionStatus,
          subscriptionTier: user.subscription_tier as SubscriptionTier,
          paymentProvider: user.payment_provider as PaymentProvider,
          paymentId: user.payment_id,
          subscriptionExpiresAt: user.subscription_expires_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          linkedAddresses: [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during registration',
      };
    }
  }

  /**
   * Get user by blockchain address
   *
   * @param address - Blockchain address (case-sensitive)
   * @returns User profile if found
   */
  async getUserByAddress(address: string): Promise<UserServiceResult<UserProfile>> {
    try {
      const result = await db.query<{
        id: number;
        primary_address_id: number;
        address: string;
        blockchain: string;
        subscription_status: string;
        subscription_tier: string;
        payment_provider: string | null;
        payment_id: string | null;
        subscription_expires_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT u.id, u.primary_address_id, ba.address, ba.blockchain,
                u.subscription_status, u.subscription_tier,
                u.payment_provider, u.payment_id, u.subscription_expires_at,
                u.created_at, u.updated_at
         FROM users u
         JOIN blockchain_addresses ba ON u.primary_address_id = ba.id
         WHERE ba.address = $1 COLLATE "C"`,
        [address]
      );

      if (result.rows.length === 0) {
        // Also check linked addresses
        const linkedResult = await db.query<{
          user_id: number;
        }>(
          `SELECT al.user_id
           FROM address_links al
           JOIN blockchain_addresses ba ON al.address_id = ba.id
           WHERE ba.address = $1 COLLATE "C"`,
          [address]
        );

        if (linkedResult.rows.length === 0) {
          return {
            success: false,
            error: 'User not found',
          };
        }

        // Get the user by ID
        return this.getUserById(linkedResult.rows[0]!.user_id);
      }

      const user = result.rows[0]!;

      // Get linked addresses
      const linkedAddresses = await this.getLinkedAddresses(user.id);

      return {
        success: true,
        data: {
          id: user.id,
          primaryAddressId: user.primary_address_id,
          primaryAddress: user.address,
          blockchain: user.blockchain as BlockchainType,
          subscriptionStatus: user.subscription_status as SubscriptionStatus,
          subscriptionTier: user.subscription_tier as SubscriptionTier,
          paymentProvider: user.payment_provider as PaymentProvider,
          paymentId: user.payment_id,
          subscriptionExpiresAt: user.subscription_expires_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          linkedAddresses,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user by ID
   *
   * @param userId - User ID
   * @returns User profile
   */
  async getUserById(userId: number): Promise<UserServiceResult<UserProfile>> {
    try {
      const result = await db.query<{
        id: number;
        primary_address_id: number;
        address: string;
        blockchain: string;
        subscription_status: string;
        subscription_tier: string;
        payment_provider: string | null;
        payment_id: string | null;
        subscription_expires_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT u.id, u.primary_address_id, ba.address, ba.blockchain,
                u.subscription_status, u.subscription_tier,
                u.payment_provider, u.payment_id, u.subscription_expires_at,
                u.created_at, u.updated_at
         FROM users u
         JOIN blockchain_addresses ba ON u.primary_address_id = ba.id
         WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      const user = result.rows[0]!;
      const linkedAddresses = await this.getLinkedAddresses(user.id);

      return {
        success: true,
        data: {
          id: user.id,
          primaryAddressId: user.primary_address_id,
          primaryAddress: user.address,
          blockchain: user.blockchain as BlockchainType,
          subscriptionStatus: user.subscription_status as SubscriptionStatus,
          subscriptionTier: user.subscription_tier as SubscriptionTier,
          paymentProvider: user.payment_provider as PaymentProvider,
          paymentId: user.payment_id,
          subscriptionExpiresAt: user.subscription_expires_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          linkedAddresses,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update user subscription
   *
   * @param userId - User ID
   * @param input - Update data
   * @returns Updated user profile
   */
  async updateUser(
    userId: number,
    input: UpdateUserInput
  ): Promise<UserServiceResult<UserProfile>> {
    try {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (input.subscriptionStatus !== undefined) {
        updates.push(`subscription_status = $${paramIndex++}`);
        values.push(input.subscriptionStatus);
      }

      if (input.subscriptionTier !== undefined) {
        updates.push(`subscription_tier = $${paramIndex++}`);
        values.push(input.subscriptionTier);
      }

      if (input.paymentProvider !== undefined) {
        updates.push(`payment_provider = $${paramIndex++}`);
        values.push(input.paymentProvider);
      }

      if (input.paymentId !== undefined) {
        updates.push(`payment_id = $${paramIndex++}`);
        values.push(input.paymentId);
      }

      if (input.subscriptionExpiresAt !== undefined) {
        updates.push(`subscription_expires_at = $${paramIndex++}`);
        values.push(input.subscriptionExpiresAt);
      }

      if (updates.length === 0) {
        return this.getUserById(userId);
      }

      values.push(userId);

      await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      return this.getUserById(userId);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Upgrade user to paid tier
   * Updates subscription and removes email expiration for existing emails
   *
   * @param userId - User ID
   * @param paymentProvider - Payment provider used
   * @param paymentId - Payment reference ID
   * @param expiresAt - Subscription expiration date
   */
  async upgradeSubscription(
    userId: number,
    paymentProvider: 'stripe' | 'solana_pay',
    paymentId: string,
    expiresAt: Date
  ): Promise<UserServiceResult<UserProfile>> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Update user subscription
      await client.query(
        `UPDATE users
         SET subscription_status = 'active',
             subscription_tier = 'paid',
             payment_provider = $1,
             payment_id = $2,
             subscription_expires_at = $3
         WHERE id = $4`,
        [paymentProvider, paymentId, expiresAt, userId]
      );

      // Get user's primary address ID
      const userResult = await client.query<{ primary_address_id: number }>(
        'SELECT primary_address_id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length > 0) {
        const primaryAddressId = userResult.rows[0]!.primary_address_id;

        // Remove expiration from existing emails (they now have unlimited retention)
        await client.query(
          `UPDATE emails
           SET expires_at = NULL
           WHERE recipient_address_id = $1 AND expires_at IS NOT NULL`,
          [primaryAddressId]
        );
      }

      await client.query('COMMIT');

      return this.getUserById(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Link additional address to user account
   *
   * @param userId - User ID
   * @param address - Address to link
   * @param blockchain - Blockchain type
   * @returns Updated linked addresses
   */
  async linkAddress(
    userId: number,
    address: string,
    blockchain: BlockchainType
  ): Promise<UserServiceResult<LinkedAddress>> {
    try {
      // Get or create blockchain address
      const addressResult = await this.getOrCreateBlockchainAddress(address, blockchain);
      if (!addressResult.success || !addressResult.data) {
        return {
          success: false,
          error: addressResult.error || 'Failed to create blockchain address',
        };
      }

      // Check if already linked
      const existingLink = await db.query<{ id: number }>(
        `SELECT id FROM address_links
         WHERE user_id = $1 AND address_id = $2`,
        [userId, addressResult.data.id]
      );

      if (existingLink.rows.length > 0) {
        return {
          success: false,
          error: 'Address already linked to this account',
        };
      }

      // Check if linked to another user
      const otherUserLink = await db.query<{ user_id: number }>(
        `SELECT user_id FROM address_links WHERE address_id = $1`,
        [addressResult.data.id]
      );

      if (otherUserLink.rows.length > 0) {
        return {
          success: false,
          error: 'Address is already linked to another account',
        };
      }

      // Create link
      const linkResult = await db.query<{
        id: number;
        address_id: number;
        verified_at: Date;
        created_at: Date;
      }>(
        `INSERT INTO address_links (user_id, address_id)
         VALUES ($1, $2)
         RETURNING id, address_id, verified_at, created_at`,
        [userId, addressResult.data.id]
      );

      if (linkResult.rows.length === 0) {
        return {
          success: false,
          error: 'Failed to link address',
        };
      }

      const link = linkResult.rows[0]!;

      return {
        success: true,
        data: {
          id: link.id,
          addressId: link.address_id,
          address,
          blockchain,
          verifiedAt: link.verified_at,
          createdAt: link.created_at,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Unlink address from user account
   *
   * @param userId - User ID
   * @param addressId - Address ID to unlink
   */
  async unlinkAddress(userId: number, addressId: number): Promise<UserServiceResult<void>> {
    try {
      // Can't unlink primary address
      const userResult = await db.query<{ primary_address_id: number }>(
        'SELECT primary_address_id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length > 0 && userResult.rows[0]!.primary_address_id === addressId) {
        return {
          success: false,
          error: 'Cannot unlink primary address',
        };
      }

      const result = await db.query(
        'DELETE FROM address_links WHERE user_id = $1 AND address_id = $2',
        [userId, addressId]
      );

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Address link not found',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if address is registered (has a user account)
   *
   * @param address - Blockchain address
   * @returns Whether address is registered
   */
  async isAddressRegistered(address: string): Promise<boolean> {
    try {
      // Check primary addresses
      const primaryResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM users u
         JOIN blockchain_addresses ba ON u.primary_address_id = ba.id
         WHERE ba.address = $1 COLLATE "C"`,
        [address]
      );

      if (parseInt(primaryResult.rows[0]?.count || '0') > 0) {
        return true;
      }

      // Check linked addresses
      const linkedResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM address_links al
         JOIN blockchain_addresses ba ON al.address_id = ba.id
         WHERE ba.address = $1 COLLATE "C"`,
        [address]
      );

      return parseInt(linkedResult.rows[0]?.count || '0') > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get linked addresses for a user
   */
  private async getLinkedAddresses(userId: number): Promise<LinkedAddress[]> {
    const result = await db.query<{
      id: number;
      address_id: number;
      address: string;
      blockchain: string;
      verified_at: Date;
      created_at: Date;
    }>(
      `SELECT al.id, al.address_id, ba.address, ba.blockchain,
              al.verified_at, al.created_at
       FROM address_links al
       JOIN blockchain_addresses ba ON al.address_id = ba.id
       WHERE al.user_id = $1
       ORDER BY al.created_at`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      addressId: row.address_id,
      address: row.address,
      blockchain: row.blockchain as BlockchainType,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get or create blockchain address record
   */
  private async getOrCreateBlockchainAddress(
    address: string,
    blockchain: BlockchainType
  ): Promise<UserServiceResult<{ id: number; address: string; blockchain: BlockchainType }>> {
    try {
      // Try to get existing
      const existing = await db.query<{
        id: number;
        address: string;
        blockchain: string;
      }>(
        `SELECT id, address, blockchain
         FROM blockchain_addresses
         WHERE address = $1 COLLATE "C"`,
        [address]
      );

      if (existing.rows.length > 0) {
        return {
          success: true,
          data: {
            id: existing.rows[0]!.id,
            address: existing.rows[0]!.address,
            blockchain: existing.rows[0]!.blockchain as BlockchainType,
          },
        };
      }

      // Create new
      const created = await db.query<{
        id: number;
        address: string;
        blockchain: string;
      }>(
        `INSERT INTO blockchain_addresses (address, blockchain)
         VALUES ($1, $2)
         RETURNING id, address, blockchain`,
        [address, blockchain]
      );

      if (created.rows.length === 0) {
        return {
          success: false,
          error: 'Failed to create blockchain address',
        };
      }

      return {
        success: true,
        data: {
          id: created.rows[0]!.id,
          address: created.rows[0]!.address,
          blockchain: created.rows[0]!.blockchain as BlockchainType,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Singleton instance
 */
export const userService = new UserService();
