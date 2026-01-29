/**
 * Brute Force Protection Service
 * Protects authentication endpoints from credential stuffing and brute force attacks
 *
 * SECURITY:
 * - Tracks failed authentication attempts per address/IP
 * - Implements temporary lockouts after max attempts exceeded
 * - Uses Redis for distributed state tracking
 */

import { getRedisClient } from '../cache/redis-client.js';

export interface BruteForceConfig {
  maxAttempts: number;
  lockoutDuration: number;
  attemptWindow: number;
}

export interface LockoutStatus {
  isLocked: boolean;
  remainingAttempts: number;
  lockedUntil?: Date;
  unlockIn?: number;
}

const DEFAULT_CONFIG: BruteForceConfig = {
  maxAttempts: 5,
  lockoutDuration: 900,
  attemptWindow: 300,
};

type IdentifierType = 'address' | 'ip';

export class BruteForceProtection {
  private config: BruteForceConfig;

  constructor(config?: Partial<BruteForceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getAttemptKey(identifier: string, type: IdentifierType): string {
    return `pubkeymail:bruteforce:${type}:${identifier}`;
  }

  private getLockoutKey(identifier: string, type: IdentifierType): string {
    return `pubkeymail:lockout:${type}:${identifier}`;
  }

  async recordFailedAttempt(
    identifier: string,
    type: IdentifierType
  ): Promise<LockoutStatus> {
    const redis = await getRedisClient();
    const attemptKey = this.getAttemptKey(identifier, type);
    const lockoutKey = this.getLockoutKey(identifier, type);

    const lockoutTTL = await redis.ttl(lockoutKey);
    if (lockoutTTL > 0) {
      const lockedUntil = new Date(Date.now() + lockoutTTL * 1000);
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockedUntil,
        unlockIn: lockoutTTL,
      };
    }

    const attempts = await redis.incr(attemptKey);

    if (attempts === 1) {
      await redis.expire(attemptKey, this.config.attemptWindow);
    }

    if (attempts >= this.config.maxAttempts) {
      await redis.setEx(lockoutKey, this.config.lockoutDuration, '1');
      await redis.del(attemptKey);

      const lockedUntil = new Date(
        Date.now() + this.config.lockoutDuration * 1000
      );
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockedUntil,
        unlockIn: this.config.lockoutDuration,
      };
    }

    return {
      isLocked: false,
      remainingAttempts: this.config.maxAttempts - attempts,
    };
  }

  async checkLockout(
    identifier: string,
    type: IdentifierType
  ): Promise<LockoutStatus> {
    const redis = await getRedisClient();
    const attemptKey = this.getAttemptKey(identifier, type);
    const lockoutKey = this.getLockoutKey(identifier, type);

    const lockoutTTL = await redis.ttl(lockoutKey);
    if (lockoutTTL > 0) {
      const lockedUntil = new Date(Date.now() + lockoutTTL * 1000);
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockedUntil,
        unlockIn: lockoutTTL,
      };
    }

    const attemptsStr = await redis.get(attemptKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    return {
      isLocked: false,
      remainingAttempts: this.config.maxAttempts - attempts,
    };
  }

  async resetAttempts(identifier: string, type: IdentifierType): Promise<void> {
    const redis = await getRedisClient();
    const attemptKey = this.getAttemptKey(identifier, type);
    await redis.del(attemptKey);
  }

  async unlock(identifier: string, type: IdentifierType): Promise<void> {
    const redis = await getRedisClient();
    const attemptKey = this.getAttemptKey(identifier, type);
    const lockoutKey = this.getLockoutKey(identifier, type);
    await redis.del(attemptKey);
    await redis.del(lockoutKey);
  }
}

export const bruteForceProtection = new BruteForceProtection();
