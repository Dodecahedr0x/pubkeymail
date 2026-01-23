/**
 * Database Connection Pool Monitor
 * Tracks pool utilization, query times, and health metrics
 */

import { Pool } from 'pg';

export interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxConnections: number;
  utilizationPercent: number;
}

export class PoolMonitor {
  private pool: Pool;
  private queryTimes: number[] = [];
  private readonly maxQueryTimesSamples = 100;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  getStats(): PoolStats {
    const totalConnections = this.pool.totalCount;
    const idleConnections = this.pool.idleCount;
    const waitingClients = this.pool.waitingCount;
    const maxConnections = this.pool.options.max ?? 10;

    const utilizationPercent =
      maxConnections > 0 ? (totalConnections / maxConnections) * 100 : 0;

    return {
      totalConnections,
      idleConnections,
      waitingClients,
      maxConnections,
      utilizationPercent,
    };
  }

  recordQueryTime(ms: number): void {
    this.queryTimes.push(ms);
    if (this.queryTimes.length > this.maxQueryTimesSamples) {
      this.queryTimes.shift();
    }
  }

  getAverageQueryTime(): number {
    if (this.queryTimes.length === 0) {
      return 0;
    }
    const sum = this.queryTimes.reduce((acc, val) => acc + val, 0);
    return sum / this.queryTimes.length;
  }

  isHealthy(): boolean {
    const stats = this.getStats();
    return stats.waitingClients < 5 && stats.utilizationPercent < 90;
  }
}
