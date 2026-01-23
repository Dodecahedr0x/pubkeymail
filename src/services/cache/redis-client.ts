/**
 * Redis Client - Singleton Redis connection manager
 *
 * Provides a centralized Redis client for caching, session management, and distributed state.
 * Used for:
 * - Authentication nonce storage
 * - Name service resolution caching
 * - Rate limiting counters
 * - Session tokens
 */

import { createClient } from 'redis';
import { config } from '../../config/index.js';

type RedisClient = ReturnType<typeof createClient>;
let redisClient: RedisClient | null = null;
let isConnecting = false;

/**
 * Get Redis client instance (singleton pattern)
 * Connects lazily on first access
 */
export async function getRedisClient(): Promise<RedisClient> {
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
 * Disconnect Redis client (for graceful shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis client disconnected');
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isOpen;
}

/**
 * Ping Redis to check connection health
 */
export async function pingRedis(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis ping failed:', error);
    return false;
  }
}
