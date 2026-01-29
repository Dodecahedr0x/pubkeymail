/**
 * Rate Limiter Service Tests
 * Tests for Redis-based sliding window rate limiting
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Redis client - must be defined before vi.mock calls
const mockRedisClient = {
  zRemRangeByScore: vi.fn(),
  zCard: vi.fn(),
  zAdd: vi.fn(),
  zRange: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
};

// Mock the getRedisClient function
vi.mock('../../../src/services/cache/redis-client.js', () => ({
  getRedisClient: vi.fn(() => Promise.resolve(mockRedisClient)),
}));

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    RATE_LIMIT_AUTH_PER_MINUTE: 10,
    RATE_LIMIT_MAX_REQUESTS_PER_HOUR: 1000,
    RATE_LIMIT_EMAIL_SEND_FREE_TIER: 50,
    RATE_LIMIT_EMAIL_SEND_PAID_TIER: 500,
  },
  rateLimitConfig: {
    authPerMinute: 10,
    maxRequestsPerHour: 1000,
    emailSendFreeTier: 50,
    emailSendPaidTier: 500,
  },
  redisConfig: {
    keyPrefix: 'pubkeymail:',
  },
}));

import {
  RateLimiter,
  type RateLimitOptions,
  type RateLimitCategory,
} from '../../../src/services/security/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter = new RateLimiter();
    mockRedisClient.zRemRangeByScore.mockResolvedValue(0);
    mockRedisClient.zCard.mockResolvedValue(0);
    mockRedisClient.zAdd.mockResolvedValue(1);
    mockRedisClient.zRange.mockResolvedValue([]);
    mockRedisClient.expire.mockResolvedValue(true);
    mockRedisClient.del.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkLimit', () => {
    it('should allow request when under limit', async () => {
      mockRedisClient.zCard.mockResolvedValue(5);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // 10 - 5
      expect(result.limit).toBe(10);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should deny request when at limit', async () => {
      mockRedisClient.zCard.mockResolvedValue(10);
      mockRedisClient.zRange.mockResolvedValue([String(Date.now() - 30000)]);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should deny request when over limit', async () => {
      mockRedisClient.zCard.mockResolvedValue(15);
      mockRedisClient.zRange.mockResolvedValue([String(Date.now() - 30000)]);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use custom limit when provided', async () => {
      mockRedisClient.zCard.mockResolvedValue(3);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
        customLimit: 5,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 5 - 3
      expect(result.limit).toBe(5);
    });

    it('should use custom window when provided', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      const customWindowMs = 30000; // 30 seconds
      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
        customWindow: customWindowMs,
      });

      expect(result.allowed).toBe(true);
      // Verify cleanup was called with correct window
      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalled();
      const call = mockRedisClient.zRemRangeByScore.mock.calls[0];
      const windowStart = call?.[2];
      expect(windowStart).toBeGreaterThan(Date.now() - customWindowMs - 1000);
    });

    it('should clean up expired entries', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'api',
      });

      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalled();
    });

    it('should calculate retryAfter based on oldest entry', async () => {
      const now = Date.now();
      const oldestTimestamp = now - 30000; // 30 seconds ago

      mockRedisClient.zCard.mockResolvedValue(10);
      mockRedisClient.zRange.mockResolvedValue([String(oldestTimestamp)]);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      // Should be approximately 30 seconds (60s window - 30s since oldest)
      expect(result.retryAfter).toBeGreaterThan(25);
      expect(result.retryAfter).toBeLessThanOrEqual(35);
    });
  });

  describe('category-specific limits', () => {
    it('should use auth limit (10/minute)', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.limit).toBe(10);
    });

    it('should use email_send limit (50/hour for free tier)', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'email_send',
      });

      expect(result.limit).toBe(50);
    });

    it('should use api limit (1000/hour)', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'api',
      });

      expect(result.limit).toBe(1000);
    });

    it('should allow unlimited email_receive (tracking only)', async () => {
      mockRedisClient.zCard.mockResolvedValue(999999);

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'email_receive',
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('incrementCounter', () => {
    it('should add entry to Redis sorted set', async () => {
      await rateLimiter.incrementCounter({
        key: 'test-address',
        category: 'auth',
      });

      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'pubkeymail:ratelimit:auth:test-address',
        expect.objectContaining({
          score: expect.any(Number),
          value: expect.any(String),
        })
      );
    });

    it('should clean up old entries after increment', async () => {
      await rateLimiter.incrementCounter({
        key: 'test-address',
        category: 'auth',
      });

      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalled();
    });

    it('should set TTL on the key', async () => {
      await rateLimiter.incrementCounter({
        key: 'test-address',
        category: 'auth',
      });

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'pubkeymail:ratelimit:auth:test-address',
        expect.any(Number)
      );
    });

    it('should use custom window for TTL calculation', async () => {
      const customWindowMs = 120000; // 2 minutes
      await rateLimiter.incrementCounter({
        key: 'test-address',
        category: 'auth',
        customWindow: customWindowMs,
      });

      const ttlCall = mockRedisClient.expire.mock.calls[0];
      const ttlSeconds = ttlCall?.[1];
      // TTL should be window + 60 seconds buffer
      expect(ttlSeconds).toBe(180);
    });
  });

  describe('getRemainingRequests', () => {
    it('should return remaining requests', async () => {
      mockRedisClient.zCard.mockResolvedValue(7);

      const remaining = await rateLimiter.getRemainingRequests({
        key: 'test-address',
        category: 'auth',
      });

      expect(remaining).toBe(3); // 10 - 7
    });

    it('should return 0 when at or over limit', async () => {
      mockRedisClient.zCard.mockResolvedValue(15);

      const remaining = await rateLimiter.getRemainingRequests({
        key: 'test-address',
        category: 'auth',
      });

      expect(remaining).toBe(0);
    });
  });

  describe('resetLimit', () => {
    it('should delete the Redis key', async () => {
      await rateLimiter.resetLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'pubkeymail:ratelimit:auth:test-address'
      );
    });
  });

  describe('checkAndIncrement', () => {
    it('should check and increment when allowed', async () => {
      mockRedisClient.zCard.mockResolvedValue(5);

      const result = await rateLimiter.checkAndIncrement({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 10 - 5 - 1 (after increment)
      expect(mockRedisClient.zAdd).toHaveBeenCalled();
    });

    it('should not increment when denied', async () => {
      mockRedisClient.zCard.mockResolvedValue(10);
      mockRedisClient.zRange.mockResolvedValue([String(Date.now() - 30000)]);

      const result = await rateLimiter.checkAndIncrement({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(false);
      expect(mockRedisClient.zAdd).not.toHaveBeenCalled();
    });
  });

  describe('getUsageCount', () => {
    it('should return current usage count', async () => {
      mockRedisClient.zCard.mockResolvedValue(7);

      const count = await rateLimiter.getUsageCount({
        key: 'test-address',
        category: 'auth',
      });

      expect(count).toBe(7);
    });

    it('should clean up expired entries before counting', async () => {
      mockRedisClient.zCard.mockResolvedValue(5);

      await rateLimiter.getUsageCount({
        key: 'test-address',
        category: 'auth',
      });

      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalled();
    });
  });

  describe('checkEmailSendLimit', () => {
    it('should use free tier limit for non-paid users', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      const result = await rateLimiter.checkEmailSendLimit(
        'test-address',
        false
      );

      expect(result.limit).toBe(50);
    });

    it('should use paid tier limit for paid users', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      const result = await rateLimiter.checkEmailSendLimit('test-address', true);

      expect(result.limit).toBe(500);
    });
  });

  describe('graceful degradation', () => {
    it('should allow request when Redis fails on checkLimit', async () => {
      const { getRedisClient } = await import(
        '../../../src/services/cache/redis-client.js'
      );
      vi.mocked(getRedisClient).mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      const result = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should silently fail on incrementCounter error', async () => {
      mockRedisClient.zAdd.mockRejectedValueOnce(
        new Error('Redis write failed')
      );

      // Should not throw
      await expect(
        rateLimiter.incrementCounter({
          key: 'test-address',
          category: 'auth',
        })
      ).resolves.not.toThrow();
    });

    it('should return 0 on getUsageCount error', async () => {
      const { getRedisClient } = await import(
        '../../../src/services/cache/redis-client.js'
      );
      vi.mocked(getRedisClient).mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      const count = await rateLimiter.getUsageCount({
        key: 'test-address',
        category: 'auth',
      });

      expect(count).toBe(0);
    });

    it('should silently fail on resetLimit error', async () => {
      const { getRedisClient } = await import(
        '../../../src/services/cache/redis-client.js'
      );
      vi.mocked(getRedisClient).mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      // Should not throw
      await expect(
        rateLimiter.resetLimit({
          key: 'test-address',
          category: 'auth',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Redis key format', () => {
    it('should use correct key format for auth category', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      await rateLimiter.checkLimit({
        key: 'test-wallet-address',
        category: 'auth',
      });

      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalledWith(
        'pubkeymail:ratelimit:auth:test-wallet-address',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should use correct key format for email_send category', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      await rateLimiter.checkLimit({
        key: '192.168.1.1',
        category: 'email_send',
      });

      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalledWith(
        'pubkeymail:ratelimit:email_send:192.168.1.1',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should use correct key format for api category', async () => {
      mockRedisClient.zCard.mockResolvedValue(0);

      await rateLimiter.checkLimit({
        key: 'api-key-123',
        category: 'api',
      });

      expect(mockRedisClient.zRemRangeByScore).toHaveBeenCalledWith(
        'pubkeymail:ratelimit:api:api-key-123',
        expect.any(Number),
        expect.any(Number)
      );
    });
  });

  describe('sliding window behavior', () => {
    it('should handle sliding window correctly', async () => {
      // Simulate 5 requests already made
      mockRedisClient.zCard.mockResolvedValue(5);

      const result1 = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(5);

      // Simulate more requests bringing us to limit
      mockRedisClient.zCard.mockResolvedValue(10);

      const result2 = await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      expect(result2.allowed).toBe(false);
      expect(result2.remaining).toBe(0);
    });

    it('should expire old entries correctly', async () => {
      const now = Date.now();

      await rateLimiter.checkLimit({
        key: 'test-address',
        category: 'auth',
      });

      // Verify zRemRangeByScore was called with correct parameters
      const call = mockRedisClient.zRemRangeByScore.mock.calls[0];
      expect(call?.[1]).toBe(0); // Min score
      // Max score should be approximately now - 60000 (1 minute window)
      const maxScore = call?.[2];
      expect(maxScore).toBeGreaterThan(now - 62000);
      expect(maxScore).toBeLessThan(now - 58000);
    });
  });
});
