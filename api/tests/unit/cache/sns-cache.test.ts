/**
 * SNS Cache Tests
 * Tests for Redis-based Solana Name Service resolution caching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../../src/services/cache/redis-client.js', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('../../../src/config/index.js', () => ({
  solanaConfig: {
    snsCacheTTL: 3600,
  },
  redisConfig: {
    keyPrefix: 'pubkeymail:',
  },
}));

import { SNSCache, CachedResolution } from '../../../src/services/cache/sns-cache.js';
import { getRedisClient } from '../../../src/services/cache/redis-client.js';

describe('SNSCache', () => {
  let snsCache: SNSCache;
  let mockRedisClient: {
    get: Mock;
    setEx: Mock;
    del: Mock;
    hGet: Mock;
    hIncrBy: Mock;
    keys: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedisClient = {
      get: vi.fn(),
      setEx: vi.fn(),
      del: vi.fn(),
      hGet: vi.fn(),
      hIncrBy: vi.fn(),
      keys: vi.fn(),
    };

    (getRedisClient as Mock).mockResolvedValue(mockRedisClient);
    snsCache = new SNSCache();
  });

  describe('get', () => {
    it('should return null for cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.hIncrBy.mockResolvedValue(1);

      const result = await snsCache.get('example.sol');

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith('pubkeymail:sns:example.sol');
      expect(mockRedisClient.hIncrBy).toHaveBeenCalledWith(
        'pubkeymail:sns:_stats',
        'misses',
        1
      );
    });

    it('should return cached resolution for cache hit', async () => {
      const now = Date.now();
      const cached: CachedResolution = {
        address: '11111111111111111111111111111111',
        resolvedAt: now - 1000,
        expiresAt: now + 3600000,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cached));
      mockRedisClient.hIncrBy.mockResolvedValue(1);

      const result = await snsCache.get('example.sol');

      expect(result).toEqual(cached);
      expect(mockRedisClient.hIncrBy).toHaveBeenCalledWith(
        'pubkeymail:sns:_stats',
        'hits',
        1
      );
    });

    it('should normalize name to lowercase', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.hIncrBy.mockResolvedValue(1);

      await snsCache.get('EXAMPLE.SOL');

      expect(mockRedisClient.get).toHaveBeenCalledWith('pubkeymail:sns:example.sol');
    });

    it('should return null and delete expired entry', async () => {
      const now = Date.now();
      const expired: CachedResolution = {
        address: '11111111111111111111111111111111',
        resolvedAt: now - 7200000,
        expiresAt: now - 1000,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(expired));
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.hIncrBy.mockResolvedValue(1);

      const result = await snsCache.get('expired.sol');

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith('pubkeymail:sns:expired.sol');
      expect(mockRedisClient.hIncrBy).toHaveBeenCalledWith(
        'pubkeymail:sns:_stats',
        'misses',
        1
      );
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('not-valid-json');
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.hIncrBy.mockResolvedValue(1);

      const result = await snsCache.get('invalid.sol');

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith('pubkeymail:sns:invalid.sol');
    });
  });

  describe('set', () => {
    it('should store resolution with default TTL', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      const address = '11111111111111111111111111111111';

      await snsCache.set('example.sol', address);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:sns:example.sol',
        3600,
        expect.any(String)
      );

      const storedData = JSON.parse(mockRedisClient.setEx.mock.calls[0][2]);
      expect(storedData.address).toBe(address);
      expect(storedData.resolvedAt).toBeDefined();
      expect(storedData.expiresAt).toBeGreaterThan(storedData.resolvedAt);
    });

    it('should store resolution with custom TTL', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      const address = '11111111111111111111111111111111';
      const customTTL = 1800;

      await snsCache.set('example.sol', address, customTTL);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:sns:example.sol',
        customTTL,
        expect.any(String)
      );
    });

    it('should normalize name to lowercase when setting', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      await snsCache.set('EXAMPLE.SOL', '11111111111111111111111111111111');

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:sns:example.sol',
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('invalidate', () => {
    it('should delete the cached entry', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await snsCache.invalidate('example.sol');

      expect(mockRedisClient.del).toHaveBeenCalledWith('pubkeymail:sns:example.sol');
    });

    it('should normalize name to lowercase when invalidating', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await snsCache.invalidate('EXAMPLE.SOL');

      expect(mockRedisClient.del).toHaveBeenCalledWith('pubkeymail:sns:example.sol');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.hGet.mockImplementation((key: string, field: string) => {
        if (field === 'hits') return Promise.resolve('150');
        if (field === 'misses') return Promise.resolve('50');
        return Promise.resolve(null);
      });
      mockRedisClient.keys.mockResolvedValue([
        'pubkeymail:sns:example.sol',
        'pubkeymail:sns:test.sol',
        'pubkeymail:sns:_stats',
      ]);

      const stats = await snsCache.getStats();

      expect(stats.hits).toBe(150);
      expect(stats.misses).toBe(50);
      expect(stats.size).toBe(2);
    });

    it('should return zeros when no stats exist', async () => {
      mockRedisClient.hGet.mockResolvedValue(null);
      mockRedisClient.keys.mockResolvedValue([]);

      const stats = await snsCache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('clearStats', () => {
    it('should delete the stats key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await snsCache.clearStats();

      expect(mockRedisClient.del).toHaveBeenCalledWith('pubkeymail:sns:_stats');
    });
  });

  describe('constructor', () => {
    it('should use custom TTL when provided', async () => {
      const customCache = new SNSCache(7200);
      mockRedisClient.setEx.mockResolvedValue('OK');

      await customCache.set('example.sol', '11111111111111111111111111111111');

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:sns:example.sol',
        7200,
        expect.any(String)
      );
    });
  });

  describe('case insensitivity', () => {
    it('should treat different cases as the same key', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.hIncrBy.mockResolvedValue(1);

      await snsCache.set('Example.Sol', '11111111111111111111111111111111');
      await snsCache.get('EXAMPLE.SOL');
      await snsCache.get('example.sol');

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'pubkeymail:sns:example.sol',
        expect.any(Number),
        expect.any(String)
      );
      expect(mockRedisClient.get).toHaveBeenCalledWith('pubkeymail:sns:example.sol');
      expect(mockRedisClient.get).toHaveBeenCalledTimes(2);
    });
  });
});
