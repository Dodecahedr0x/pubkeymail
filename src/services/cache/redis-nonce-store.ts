/**
 * Redis Nonce Store - Production implementation of nonce storage
 *
 * Implements INonceStore interface using Redis for distributed nonce management.
 * Automatically handles expiration via Redis TTL.
 */

import { BlockchainType } from '../../types/blockchain.js';
import {
  storeNonce,
  getNonce,
  markNonceAsUsed,
  cleanupExpiredNonces,
  StoredNonce,
} from './nonce-store.js';

/**
 * Internal nonce structure (from auth-service)
 */
export interface AuthNonce {
  nonce: string;
  address: string;
  blockchain: BlockchainType;
  challenge: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

/**
 * Nonce storage interface (from auth-service)
 */
export interface INonceStore {
  save(nonce: AuthNonce): Promise<void>;
  get(nonceValue: string): Promise<AuthNonce | null>;
  markUsed(nonceValue: string): Promise<void>;
  cleanup(): Promise<number>;
}

/**
 * Redis implementation of nonce store
 */
export class RedisNonceStore implements INonceStore {
  /**
   * Save a nonce to Redis with automatic expiration
   */
  async save(nonce: AuthNonce): Promise<void> {
    const storedNonce: StoredNonce = {
      nonce: nonce.nonce,
      address: nonce.address,
      blockchain: nonce.blockchain,
      challengeMessage: nonce.challenge,
      expiresAt: nonce.expiresAt.getTime(),
      used: nonce.used,
    };

    await storeNonce(storedNonce);
  }

  /**
   * Get a nonce from Redis
   * Returns null if nonce doesn't exist or has expired
   */
  async get(nonceValue: string): Promise<AuthNonce | null> {
    const storedNonce = await getNonce(nonceValue);

    if (!storedNonce) {
      return null;
    }

    // Convert stored format back to AuthNonce format
    return {
      nonce: storedNonce.nonce,
      address: storedNonce.address,
      blockchain: storedNonce.blockchain as BlockchainType,
      challenge: storedNonce.challengeMessage,
      createdAt: new Date(storedNonce.expiresAt - 300000), // Approximate from expiration
      expiresAt: new Date(storedNonce.expiresAt),
      used: storedNonce.used,
    };
  }

  /**
   * Mark a nonce as used to prevent replay attacks
   */
  async markUsed(nonceValue: string): Promise<void> {
    await markNonceAsUsed(nonceValue);
  }

  /**
   * Cleanup expired nonces
   * No-op for Redis (TTL handles expiration automatically)
   */
  async cleanup(): Promise<number> {
    return await cleanupExpiredNonces();
  }
}
