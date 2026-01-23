/**
 * Nonce Store - Redis-backed nonce storage for authentication
 *
 * Stores authentication challenge nonces with automatic expiration.
 * Prevents replay attacks by ensuring nonces are single-use.
 *
 * Key format: pubkeymail:nonce:{nonce}
 */

import { getRedisClient } from './redis-client.js';
import { config } from '../../config/index.js';

export interface StoredNonce {
  nonce: string;
  address: string;
  blockchain: string;
  challengeMessage: string;
  expiresAt: number;
  used: boolean;
}

/**
 * Store a nonce in Redis with automatic expiration
 */
export async function storeNonce(nonceData: StoredNonce): Promise<void> {
  const redis = await getRedisClient();
  const key = `${config.REDIS_KEY_PREFIX}nonce:${nonceData.nonce}`;
  const ttlSeconds = config.AUTH_NONCE_EXPIRATION;

  // Store as JSON with TTL
  await redis.setEx(key, ttlSeconds, JSON.stringify(nonceData));
}

/**
 * Get a nonce from Redis
 * Returns null if nonce doesn't exist or has expired
 */
export async function getNonce(nonce: string): Promise<StoredNonce | null> {
  const redis = await getRedisClient();
  const key = `${config.REDIS_KEY_PREFIX}nonce:${nonce}`;

  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as StoredNonce;
  } catch (error) {
    console.error('Failed to parse nonce data:', error);
    return null;
  }
}

/**
 * Mark a nonce as used to prevent replay attacks
 * Updates the stored nonce without changing its TTL
 */
export async function markNonceAsUsed(nonce: string): Promise<boolean> {
  const redis = await getRedisClient();
  const key = `${config.REDIS_KEY_PREFIX}nonce:${nonce}`;

  // Get existing nonce data
  const existingData = await getNonce(nonce);

  if (!existingData) {
    return false;
  }

  // Mark as used
  existingData.used = true;

  // Calculate remaining TTL
  const now = Date.now();
  const remainingTTL = Math.max(0, Math.floor((existingData.expiresAt - now) / 1000));

  if (remainingTTL <= 0) {
    // Nonce already expired
    return false;
  }

  // Update with remaining TTL
  await redis.setEx(key, remainingTTL, JSON.stringify(existingData));

  return true;
}

/**
 * Delete a nonce from Redis
 * Used for immediate invalidation or cleanup
 */
export async function deleteNonce(nonce: string): Promise<boolean> {
  const redis = await getRedisClient();
  const key = `${config.REDIS_KEY_PREFIX}nonce:${nonce}`;

  const result = await redis.del(key);
  return result > 0;
}

/**
 * Check if a nonce exists and is not used
 */
export async function isNonceValid(nonce: string): Promise<boolean> {
  const nonceData = await getNonce(nonce);

  if (!nonceData) {
    return false;
  }

  // Check if used
  if (nonceData.used) {
    return false;
  }

  // Check if expired
  const now = Date.now();
  if (now >= nonceData.expiresAt) {
    return false;
  }

  return true;
}

/**
 * Cleanup expired nonces (manual cleanup - Redis auto-expires with TTL)
 * This is a no-op for Redis since TTL handles expiration automatically
 * Kept for API compatibility with in-memory store
 */
export async function cleanupExpiredNonces(): Promise<number> {
  // Redis automatically removes expired keys via TTL
  // No manual cleanup needed
  return 0;
}
