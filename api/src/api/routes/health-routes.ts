/**
 * Health Check Routes
 * API endpoints for monitoring and deployment readiness
 *
 * Endpoints:
 * - GET /health - Basic liveness check
 * - GET /health/ready - Readiness check with dependencies
 * - GET /health/details - Detailed health status (authenticated)
 */

import { Router, Request, Response } from 'express';
import { db } from '../../database/connection.js';
import { getRedisClient } from '../../services/cache/redis-client.js';
import { emailCleanupScheduler } from '../../services/email/cleanup-scheduler.js';

const router: Router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

interface ReadinessStatus extends HealthStatus {
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    cleanupScheduler: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latency?: number;
  message?: string;
}

const startTime = Date.now();
const VERSION = process.env['npm_package_version'] || '0.1.0';

/**
 * GET /health
 * Basic liveness check - returns 200 if the server is running
 *
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "uptime": 12345,
 *   "version": "0.1.0"
 * }
 */
router.get('/', (_req: Request, res: Response) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: VERSION,
  };

  res.status(200).json(health);
});

/**
 * GET /health/ready
 * Readiness check - verifies all dependencies are available
 *
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "...",
 *   "uptime": 12345,
 *   "version": "0.1.0",
 *   "checks": {
 *     "database": { "status": "healthy", "latency": 5 },
 *     "redis": { "status": "healthy", "latency": 2 },
 *     "cleanupScheduler": { "status": "healthy" }
 *   }
 * }
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: ReadinessStatus['checks'] = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    cleanupScheduler: checkCleanupScheduler(),
  };

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');
  const anyUnhealthy = Object.values(checks).some((c) => c.status === 'unhealthy');

  let status: HealthStatus['status'];
  if (allHealthy) {
    status = 'healthy';
  } else if (anyUnhealthy) {
    status = 'unhealthy';
  } else {
    status = 'degraded';
  }

  const readiness: ReadinessStatus = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: VERSION,
    checks,
  };

  const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
  res.status(httpStatus).json(readiness);
});

/**
 * GET /health/live
 * Kubernetes-style liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const result = await db.query('SELECT 1 as health_check');
    const latency = Date.now() - start;

    if (result.rows.length > 0) {
      return { status: 'healthy', latency };
    }
    return { status: 'unhealthy', latency, message: 'No response from database' };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const client = await getRedisClient();
    await client.ping();
    const latency = Date.now() - start;
    return { status: 'healthy', latency };
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

/**
 * Check cleanup scheduler status
 */
function checkCleanupScheduler(): ComponentHealth {
  const schedulerState = emailCleanupScheduler.getState();
  const isHealthy = emailCleanupScheduler.isHealthy();

  if (isHealthy) {
    return {
      status: 'healthy',
      message: schedulerState.lastRun
        ? `Last run: ${schedulerState.lastRun.toISOString()}`
        : 'Not yet run',
    };
  }

  return {
    status: 'unhealthy',
    message: schedulerState.lastResult?.details.errors[0]?.message || 'Scheduler unhealthy',
  };
}

export default router;
