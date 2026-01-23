/**
 * SNS Cache - Redis-based caching for Solana Name Service resolutions
 *
 * Caches SNS domain -> address resolutions to reduce RPC calls and improve performance.
 * Uses case-insensitive key lookup (all names normalized to lowercase).
 */

import { getRedisClient } from './redis-client.js';
import { solanaConfig, redisConfig } from '../../config/index.js';

export interface CachedResolution {
  address: string;
  resolvedAt: number; // timestamp ms
  expiresAt: number; // timestamp ms
}

const SNS_KEY_PREFIX = 'sns:';
const STATS_KEY = 'sns:_stats';

export class SNSCache {
  private defaultTTL: number;

  constructor(ttl?: number) {
    this.defaultTTL = ttl ?? solanaConfig.snsCacheTTL;
  }

  private getKey(name: string): string {
    return `${redisConfig.keyPrefix}${SNS_KEY_PREFIX}${name.toLowerCase()}`;
  }

  private getStatsKey(): string {
    return `${redisConfig.keyPrefix}${STATS_KEY}`;
  }

  async get(name: string): Promise<CachedResolution | null> {
    const client = await getRedisClient();
    const key = this.getKey(name);

    const data = await client.get(key);

    if (!data) {
      await this.incrementMisses();
      return null;
    }

    try {
      const resolution = JSON.parse(data) as CachedResolution;

      if (Date.now() > resolution.expiresAt) {
        await client.del(key);
        await this.incrementMisses();
        return null;
      }

      await this.incrementHits();
      return resolution;
    } catch {
      await client.del(key);
      await this.incrementMisses();
      return null;
    }
  }

  async set(name: string, address: string, ttl?: number): Promise<void> {
    const client = await getRedisClient();
    const key = this.getKey(name);
    const effectiveTTL = ttl ?? this.defaultTTL;

    const now = Date.now();
    const resolution: CachedResolution = {
      address,
      resolvedAt: now,
      expiresAt: now + effectiveTTL * 1000,
    };

    await client.setEx(key, effectiveTTL, JSON.stringify(resolution));
  }

  async invalidate(name: string): Promise<void> {
    const client = await getRedisClient();
    const key = this.getKey(name);
    await client.del(key);
  }

  async getStats(): Promise<{ hits: number; misses: number; size: number }> {
    const client = await getRedisClient();
    const statsKey = this.getStatsKey();

    const [hitsStr, missesStr] = await Promise.all([
      client.hGet(statsKey, 'hits'),
      client.hGet(statsKey, 'misses'),
    ]);

    const hits = parseInt(hitsStr ?? '0', 10);
    const misses = parseInt(missesStr ?? '0', 10);

    const pattern = `${redisConfig.keyPrefix}${SNS_KEY_PREFIX}*`;
    const keys = await client.keys(pattern);
    const size = keys.filter((k) => !k.endsWith('_stats')).length;

    return { hits, misses, size };
  }

  private async incrementHits(): Promise<void> {
    const client = await getRedisClient();
    await client.hIncrBy(this.getStatsKey(), 'hits', 1);
  }

  private async incrementMisses(): Promise<void> {
    const client = await getRedisClient();
    await client.hIncrBy(this.getStatsKey(), 'misses', 1);
  }

  async clearStats(): Promise<void> {
    const client = await getRedisClient();
    await client.del(this.getStatsKey());
  }
}

export const snsCache = new SNSCache();
