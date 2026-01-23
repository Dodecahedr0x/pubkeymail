/**
 * Address Linking Service
 * Manages linked blockchain addresses with unified mailbox support
 *
 * SECURITY NOTES:
 * - All address linking requires wallet signature verification
 * - Addresses can only be linked to one account
 * - Tier limits are enforced for address linking
 */

import { db, withTransaction } from '../../database/connection.js';
import { tierService } from '../tier/tier-service.js';
import { getBlockchainProvider } from '../blockchain/provider-factory.js';
import type { PoolClient } from 'pg';
import type { BlockchainType } from '../../types/blockchain.js';

/**
 * Input for linking an address
 */
export interface LinkAddressInput {
  userId: number;
  address: string;
  blockchain: BlockchainType;
  signature: string;
  message: string;
}

/**
 * Linked address information
 */
export interface LinkedAddress {
  id: number;
  addressId: number;
  address: string;
  blockchain: BlockchainType;
  verifiedAt: Date;
}

/**
 * Unified email from all linked addresses
 */
export interface UnifiedEmail {
  id: string;
  from: string;
  subject: string | null;
  receivedAt: Date;
  sourceAddress: string;
  read: boolean;
}

/**
 * Result type for unified mailbox
 */
export interface UnifiedMailboxResult {
  emails: UnifiedEmail[];
  total: number;
}

/**
 * Service result type
 */
export interface AddressLinkingResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Address Linking Service Class
 */
export class AddressLinkingService {
  /**
   * Link a secondary address to a user account
   *
   * @param input - Link address input with signature verification
   * @returns Linked address info on success
   */
  async linkAddress(
    input: LinkAddressInput
  ): Promise<AddressLinkingResult<LinkedAddress>> {
    const { userId, address, blockchain, signature, message } = input;

    try {
      // Check tier limit (outside transaction - read-only check)
      const canLink = await tierService.canLinkAddress(userId);
      if (!canLink) {
        return {
          success: false,
          error: 'Address linking limit reached for your tier',
        };
      }

      // Verify signature using blockchain provider (outside transaction - external call)
      const provider = getBlockchainProvider(blockchain);
      const verificationResult = await provider.verifySignature(
        message,
        signature,
        address
      );

      if (!verificationResult.valid) {
        return {
          success: false,
          error: verificationResult.error || 'Invalid signature',
        };
      }

      // Perform database operations within a transaction
      return await withTransaction(async (client: PoolClient) => {
        // Check if address already linked to any account as primary
        const existingPrimary = await client.query<{ id: number }>(
          `SELECT u.id FROM users u
           JOIN blockchain_addresses ba ON u.primary_address_id = ba.id
           WHERE ba.address = $1 COLLATE "C"`,
          [address]
        );

        if (existingPrimary.rows.length > 0) {
          return {
            success: false,
            error: 'Address is already registered as a primary address',
          };
        }

        // Check if address already linked to another account
        const existingLink = await client.query<{ user_id: number }>(
          `SELECT al.user_id FROM address_links al
           JOIN blockchain_addresses ba ON al.address_id = ba.id
           WHERE ba.address = $1 COLLATE "C"`,
          [address]
        );

        if (existingLink.rows.length > 0) {
          return {
            success: false,
            error: 'Address is already linked to another account',
          };
        }

        // Create or get blockchain_address record using ON CONFLICT
        const addressResult = await client.query<{ id: number }>(
          `INSERT INTO blockchain_addresses (address, blockchain)
           VALUES ($1, $2)
           ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address
           RETURNING id`,
          [address, blockchain]
        );

        if (addressResult.rows.length === 0) {
          return {
            success: false,
            error: 'Failed to create blockchain address record',
          };
        }

        const addressId = addressResult.rows[0]!.id;

        // Create address_link record with ON CONFLICT to handle race conditions
        const linkResult = await client.query<{
          id: number;
          verified_at: Date;
        }>(
          `INSERT INTO address_links (user_id, address_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, address_id) DO NOTHING
           RETURNING id, verified_at`,
          [userId, addressId]
        );

        if (linkResult.rows.length === 0) {
          // ON CONFLICT triggered - link already exists
          return {
            success: false,
            error: 'Address is already linked to this account',
          };
        }

        const link = linkResult.rows[0]!;

        return {
          success: true,
          data: {
            id: link.id,
            addressId,
            address,
            blockchain,
            verifiedAt: link.verified_at,
          },
        };
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Unlink an address from user account
   *
   * @param userId - User ID
   * @param addressId - Address ID to unlink
   * @returns Success/failure
   */
  async unlinkAddress(
    userId: number,
    addressId: number
  ): Promise<AddressLinkingResult<void>> {
    try {
      const result = await db.query(
        `DELETE FROM address_links WHERE user_id = $1 AND address_id = $2`,
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
   * Get all linked addresses for a user
   *
   * @param userId - User ID
   * @returns Array of linked addresses
   */
  async getLinkedAddresses(
    userId: number
  ): Promise<AddressLinkingResult<LinkedAddress[]>> {
    try {
      const result = await db.query<{
        id: number;
        address_id: number;
        address: string;
        blockchain: string;
        verified_at: Date;
      }>(
        `SELECT al.id, al.address_id, ba.address, ba.blockchain, al.verified_at
         FROM address_links al
         JOIN blockchain_addresses ba ON al.address_id = ba.id
         WHERE al.user_id = $1
         ORDER BY al.verified_at DESC`,
        [userId]
      );

      return {
        success: true,
        data: result.rows.map((row) => ({
          id: row.id,
          addressId: row.address_id,
          address: row.address,
          blockchain: row.blockchain as BlockchainType,
          verifiedAt: row.verified_at,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get unified mailbox emails from all user addresses (primary + linked)
   *
   * @param userId - User ID
   * @param limit - Maximum emails to return
   * @param offset - Pagination offset
   * @returns Emails from all addresses with total count
   */
  async getUnifiedMailbox(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<AddressLinkingResult<UnifiedMailboxResult>> {
    try {
      // Get all user's address IDs (primary + linked)
      const addressResult = await db.query<{ address_id: number }>(
        `SELECT primary_address_id as address_id FROM users WHERE id = $1
         UNION
         SELECT address_id FROM address_links WHERE user_id = $1`,
        [userId]
      );

      if (addressResult.rows.length === 0) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      const addressIds = addressResult.rows.map((r) => r.address_id);

      // Get total count
      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM emails WHERE recipient_address_id = ANY($1)`,
        [addressIds]
      );

      const total = parseInt(countResult.rows[0]?.count || '0');

      // Get emails from all addresses
      const emailsResult = await db.query<{
        id: string;
        sender_email: string;
        subject: string | null;
        received_at: Date;
        address: string;
        read: boolean;
      }>(
        `SELECT e.id, e.sender_email, e.subject, e.received_at, ba.address, e.read
         FROM emails e
         JOIN blockchain_addresses ba ON e.recipient_address_id = ba.id
         WHERE e.recipient_address_id = ANY($1)
         ORDER BY e.received_at DESC
         LIMIT $2 OFFSET $3`,
        [addressIds, limit, offset]
      );

      return {
        success: true,
        data: {
          emails: emailsResult.rows.map((row) => ({
            id: row.id,
            from: row.sender_email,
            subject: row.subject,
            receivedAt: row.received_at,
            sourceAddress: row.address,
            read: row.read,
          })),
          total,
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
export const addressLinkingService = new AddressLinkingService();
