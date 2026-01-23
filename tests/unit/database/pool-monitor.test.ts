/**
 * Pool Monitor Tests
 * Tests for database connection pool monitoring
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PoolMonitor, PoolStats } from '../../../src/database/pool-monitor.js';
import { Pool } from 'pg';

function createMockPool(overrides: Partial<{
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  max: number;
}> = {}): Pool {
  return {
    totalCount: overrides.totalCount ?? 5,
    idleCount: overrides.idleCount ?? 3,
    waitingCount: overrides.waitingCount ?? 0,
    options: {
      max: overrides.max ?? 10,
    },
  } as unknown as Pool;
}

describe('PoolMonitor', () => {
  describe('getStats', () => {
    it('should return correct pool stats', () => {
      const pool = createMockPool({
        totalCount: 5,
        idleCount: 3,
        waitingCount: 2,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      const stats = monitor.getStats();

      expect(stats.totalConnections).toBe(5);
      expect(stats.idleConnections).toBe(3);
      expect(stats.waitingClients).toBe(2);
      expect(stats.maxConnections).toBe(10);
    });

    it('should calculate utilization correctly at 50%', () => {
      const pool = createMockPool({
        totalCount: 5,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      const stats = monitor.getStats();

      expect(stats.utilizationPercent).toBe(50);
    });

    it('should calculate utilization correctly at 100%', () => {
      const pool = createMockPool({
        totalCount: 10,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      const stats = monitor.getStats();

      expect(stats.utilizationPercent).toBe(100);
    });

    it('should handle zero max connections', () => {
      const pool = createMockPool({
        totalCount: 0,
        max: 0,
      });
      const monitor = new PoolMonitor(pool);

      const stats = monitor.getStats();

      expect(stats.utilizationPercent).toBe(0);
    });

    it('should default max to 10 when not specified', () => {
      const pool = {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
        options: {},
      } as unknown as Pool;
      const monitor = new PoolMonitor(pool);

      const stats = monitor.getStats();

      expect(stats.maxConnections).toBe(10);
      expect(stats.utilizationPercent).toBe(50);
    });
  });

  describe('recordQueryTime / getAverageQueryTime', () => {
    it('should return 0 when no query times recorded', () => {
      const pool = createMockPool();
      const monitor = new PoolMonitor(pool);

      expect(monitor.getAverageQueryTime()).toBe(0);
    });

    it('should calculate average of single query time', () => {
      const pool = createMockPool();
      const monitor = new PoolMonitor(pool);

      monitor.recordQueryTime(100);

      expect(monitor.getAverageQueryTime()).toBe(100);
    });

    it('should calculate average of multiple query times', () => {
      const pool = createMockPool();
      const monitor = new PoolMonitor(pool);

      monitor.recordQueryTime(100);
      monitor.recordQueryTime(200);
      monitor.recordQueryTime(300);

      expect(monitor.getAverageQueryTime()).toBe(200);
    });

    it('should only keep last 100 query times', () => {
      const pool = createMockPool();
      const monitor = new PoolMonitor(pool);

      for (let i = 1; i <= 100; i++) {
        monitor.recordQueryTime(10);
      }
      expect(monitor.getAverageQueryTime()).toBe(10);

      monitor.recordQueryTime(110);

      expect(monitor.getAverageQueryTime()).toBe(11);
    });

    it('should handle decimal query times', () => {
      const pool = createMockPool();
      const monitor = new PoolMonitor(pool);

      monitor.recordQueryTime(1.5);
      monitor.recordQueryTime(2.5);

      expect(monitor.getAverageQueryTime()).toBe(2);
    });
  });

  describe('isHealthy', () => {
    it('should return true when pool is healthy', () => {
      const pool = createMockPool({
        totalCount: 5,
        waitingCount: 0,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      expect(monitor.isHealthy()).toBe(true);
    });

    it('should return false when waiting clients >= 5', () => {
      const pool = createMockPool({
        totalCount: 5,
        waitingCount: 5,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      expect(monitor.isHealthy()).toBe(false);
    });

    it('should return false when utilization >= 90%', () => {
      const pool = createMockPool({
        totalCount: 9,
        waitingCount: 0,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      expect(monitor.isHealthy()).toBe(false);
    });

    it('should return false when both conditions fail', () => {
      const pool = createMockPool({
        totalCount: 10,
        waitingCount: 10,
        max: 10,
      });
      const monitor = new PoolMonitor(pool);

      expect(monitor.isHealthy()).toBe(false);
    });

    it('should return true at exactly 89% utilization with 4 waiting clients', () => {
      const pool = createMockPool({
        totalCount: 89,
        waitingCount: 4,
        max: 100,
      });
      const monitor = new PoolMonitor(pool);

      expect(monitor.isHealthy()).toBe(true);
    });
  });
});
