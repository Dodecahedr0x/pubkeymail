/**
 * Cache Client - Unified cache client manager
 *
 * Provides a centralized cache client for caching, session management, and distributed state.
 * Supports both Redis (production) and in-memory (local dev) backends.
 * Used for:
 * - Authentication nonce storage
 * - Name service resolution caching
 * - Rate limiting counters
 * - Session tokens
 */

import { createClient } from 'redis';
import { config, isLocalDevMode } from '../../config/index.js';
import {
  getMemoryCacheClient,
  initMemoryCacheClient,
  disconnectMemoryCache,
  type MemoryCacheClient,
} from './memory-client.js';

type RedisClient = ReturnType<typeof createClient>;
type CacheClient = RedisClient | MemoryCacheClient;

let redisClient: RedisClient | null = null;
let isConnecting = false;

/**
 * Get cache client instance (singleton pattern)
 * Returns Redis client in production, memory client in local dev mode
 * Connects lazily on first access
 */
export async function getRedisClient(): Promise<CacheClient> {
  // Use in-memory client for local dev mode
  if (isLocalDevMode) {
    return initMemoryCacheClient();
  }

  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return getRedisClient();
  }

  isConnecting = true;

  try {
    const client = createClient({
      url: config.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis connection failed');
          }
          // Exponential backoff: 100ms, 200ms, 400ms, etc.
          return Math.min(retries * 100, 3000);
        },
      },
    });

    // Error handling
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis client connected');
    });

    client.on('ready', () => {
      console.log('Redis client ready');
    });

    client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
    });

    await client.connect();

    redisClient = client;
    isConnecting = false;

    return client;
  } catch (error) {
    isConnecting = false;
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

/**
 * Disconnect cache client (for graceful shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  if (isLocalDevMode) {
    await disconnectMemoryCache();
    return;
  }

  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis client disconnected');
  }
}

/**
 * Check if cache is connected
 */
export function isRedisConnected(): boolean {
  if (isLocalDevMode) {
    const memClient = getMemoryCacheClient();
    return memClient.isOpen;
  }
  return redisClient !== null && redisClient.isOpen;
}

/**
 * Ping cache to check connection health
 */
export async function pingRedis(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Cache ping failed:', error);
    return false;
  }
}

export type { CacheClient };
