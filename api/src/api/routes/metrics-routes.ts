/**
 * Metrics Routes
 * Exposes collected application metrics for scraping / inspection.
 *
 * Endpoints:
 * - GET /metrics            - Prometheus text exposition format
 * - GET /metrics?format=json - Structured JSON snapshot
 */

import { Router, Request, Response } from 'express';
import { metricsService } from '../../services/metrics/metrics-service.js';

const router: Router = Router();

router.get('/', (req: Request, res: Response) => {
  if (req.query['format'] === 'json') {
    res.status(200).json(metricsService.snapshot());
    return;
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.status(200).send(metricsService.toPrometheus());
});

export default router;
