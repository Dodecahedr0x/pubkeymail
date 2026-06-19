/**
 * Metrics Middleware
 *
 * Records per-request HTTP metrics: a counter of requests by method/status and
 * a latency histogram. Uses a normalized route label (the mounted path) to
 * avoid high-cardinality explosions from path parameters.
 */

import { Request, Response, NextFunction } from 'express';
import { metricsService } from '../../services/metrics/metrics-service.js';

/** Collapse path parameters (uuids, ids) to keep label cardinality bounded. */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-fA-F-]{16,}/g, '/:id') // uuids / long hex
    .replace(/\/\d+/g, '/:id'); // numeric ids
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    const labels = {
      method: req.method,
      status: String(res.statusCode),
      route: normalizePath(req.path),
    };
    metricsService.increment('http_requests_total', 1, labels);
    metricsService.observe('http_request_duration_ms', elapsed, {
      method: req.method,
      route: normalizePath(req.path),
    });
  });

  next();
}
