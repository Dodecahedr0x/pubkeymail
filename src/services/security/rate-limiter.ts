/**
 * Redis-based Rate Limiter Service
 * Implements sliding window rate limiting for PubKeyMail
 *
 * Uses Redis sorted sets for accurate sliding window tracking.
 * Gracefully degrades to allow requests if Redis is unavailable.
 */

import { getRedisClient } from '../cache/redis-client.js';
import { rateLimitConfig, redisConfig } from '../../config/index.js';

/**
 * Rate limit categories
 */
export type RateLimitCategory = 'auth' | 'email_send' | 'api' | 'email_receive';

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number; // seconds until next request allowed
}

/**
 * Options for rate limit check
 */
export interface RateLimitOptions {
  key: string; // The address or IP to rate limit
  category: RateLimitCategory;
  customLimit?: number; // Override default limit
  customWindow?: number; // Override default window in ms
}

/**
 * Default rate limit configuration per category
 */
interface CategoryConfig {
  limit: number;
  windowMs: number;
}

/**
 * Get default configuration for a category
 */
function getDefaultConfig(category: RateLimitCategory): CategoryConfig {
  switch (category) {
    case 'auth':
      return {
        limit: rateLimitConfig.authPerMinute,
        windowMs: 60 * 1000, // 1 minute
      };
    case 'email_send':
      return {
        limit: rateLimitConfig.emailSendFreeTier,
        windowMs: 60 * 60 * 1000, // 1 hour
      };
    case 'api':
      return {
        limit: rateLimitConfig.maxRequestsPerHour,
        windowMs: 60 * 60 * 1000, // 1 hour
      };
    case 'email_receive':
      return {
        limit: Number.MAX_SAFE_INTEGER, // Not limited, just tracked
        windowMs: 60 * 60 * 1000, // 1 hour for tracking
      };
    default:
      return {
        limit: 100,
        windowMs: 60 * 60 * 1000,
      };
  }
}

/**
 * Build Redis key for rate limiting
 * Format: pubkeymail:ratelimit:{category}:{key}
 */
function buildRedisKey(category: RateLimitCategory, key: string): string {
  return `${redisConfig.keyPrefix}ratelimit:${category}:${key}`;
}

/**
 * Rate Limiter Class
 * Uses sliding window algorithm with Redis sorted sets
 */
export class RateLimiter {
  /**
   * Check if a request is allowed under rate limits
   * Does NOT increment the counter - call incrementCounter() separately
   */
  async checkLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    const categoryConfig = getDefaultConfig(options.category);
    const limit = options.customLimit ?? categoryConfig.limit;
    const windowMs = options.customWindow ?? categoryConfig.windowMs;

    try {
      const redis = await getRedisClient();
      const redisKey = buildRedisKey(options.category, options.key);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove expired entries and count current window
      await redis.zRemRangeByScore(redisKey, 0, windowStart);
      const count = await redis.zCard(redisKey);

      const remaining = Math.max(0, limit - count);
      const resetAt = new Date(now + windowMs);
      const allowed = count < limit;

      const result: RateLimitResult = {
        allowed,
        remaining,
        limit,
        resetAt,
      };

      if (!allowed) {
        // Calculate retry after based on oldest entry in window
        const oldest = await redis.zRange(redisKey, 0, 0, { BY: 'SCORE' });
        if (oldest.length > 0) {
          const oldestTimestamp = parseFloat(oldest[0]!);
          const retryAfterMs = oldestTimestamp + windowMs - now;
          result.retryAfter = Math.ceil(retryAfterMs / 1000);
        } else {
          result.retryAfter = Math.ceil(windowMs / 1000);
        }
      }

      return result;
    } catch (error) {
      console.error('Rate limiter Redis error, allowing request:', error);
      // Graceful degradation - allow request if Redis fails
      return {
        allowed: true,
        remaining: 1,
        limit,
        resetAt: new Date(Date.now() + windowMs),
      };
    }
  }

  /**
   * Increment the rate limit counter for a request
   * Call this after checkLimit() when processing the request
   */
  async incrementCounter(options: RateLimitOptions): Promise<void> {
    const categoryConfig = getDefaultConfig(options.category);
    const windowMs = options.customWindow ?? categoryConfig.windowMs;

    try {
      const redis = await getRedisClient();
      const redisKey = buildRedisKey(options.category, options.key);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Use timestamp as score and unique identifier
      const uniqueId = `${now}:${Math.random().toString(36).substring(2, 9)}`;

      // Add entry to sorted set
      await redis.zAdd(redisKey, { score: now, value: uniqueId });

      // Clean up old entries
      await redis.zRemRangeByScore(redisKey, 0, windowStart);

      // Set TTL on the key to auto-expire after window
      const ttlSeconds = Math.ceil(windowMs / 1000) + 60; // Add 60s buffer
      await redis.expire(redisKey, ttlSeconds);
    } catch (error) {
      console.error('Rate limiter increment error:', error);
      // Silently fail - don't block request if we can't track
    }
  }

  /**
   * Get remaining requests for a key/category
   */
  async getRemainingRequests(options: RateLimitOptions): Promise<number> {
    const result = await this.checkLimit(options);
    return result.remaining;
  }

  /**
   * Reset rate limit for a key/category
   * Useful for admin overrides or testing
   */
  async resetLimit(options: RateLimitOptions): Promise<void> {
    try {
      const redis = await getRedisClient();
      const redisKey = buildRedisKey(options.category, options.key);
      await redis.del(redisKey);
    } catch (error) {
      console.error('Rate limiter reset error:', error);
    }
  }

  /**
   * Check and increment in one operation
   * Returns the result of the check (before increment)
   */
  async checkAndIncrement(options: RateLimitOptions): Promise<RateLimitResult> {
    const result = await this.checkLimit(options);

    if (result.allowed) {
      await this.incrementCounter(options);
      // Adjust remaining to reflect the increment
      result.remaining = Math.max(0, result.remaining - 1);
    }

    return result;
  }

  /**
   * Get current usage count for a key/category
   */
  async getUsageCount(options: RateLimitOptions): Promise<number> {
    const categoryConfig = getDefaultConfig(options.category);
    const windowMs = options.customWindow ?? categoryConfig.windowMs;

    try {
      const redis = await getRedisClient();
      const redisKey = buildRedisKey(options.category, options.key);
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean up and count
      await redis.zRemRangeByScore(redisKey, 0, windowStart);
      return await redis.zCard(redisKey);
    } catch (error) {
      console.error('Rate limiter usage count error:', error);
      return 0;
    }
  }

  /**
   * Check rate limit for email sending with tier-based limits
   */
  async checkEmailSendLimit(
    key: string,
    isPaidTier: boolean
  ): Promise<RateLimitResult> {
    const limit = isPaidTier
      ? rateLimitConfig.emailSendPaidTier
      : rateLimitConfig.emailSendFreeTier;

    return this.checkLimit({
      key,
      category: 'email_send',
      customLimit: limit,
    });
  }
}

/**
 * Singleton instance
 */
export const rateLimiter = new RateLimiter();
