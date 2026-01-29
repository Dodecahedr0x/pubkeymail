/**
 * Express Application Factory
 *
 * Creates and configures the Express application with all routes,
 * middleware, and error handling.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { createLogger } from '../services/logger/index.js';

import authRoutes from './routes/auth-routes.js';
import webhookRoutes from './routes/webhook-routes.js';
import userRoutes from './routes/user-routes.js';
import paymentRoutes from './routes/payment-routes.js';
import healthRoutes from './routes/health-routes.js';
import emailRoutes from './routes/email-routes.js';
import forwardingRoutes from './routes/forwarding-routes.js';
import complianceRoutes from './routes/compliance-routes.js';
import encryptionRoutes from './routes/encryption-routes.js';

const log = createLogger('API');

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // Trust proxy for correct client IP detection
  app.set('trust proxy', 1);

  // Request body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS configuration
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const origin = config.CORS_ORIGIN;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (config.HELMET_CSP_ENABLED) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
      );
    }

    next();
  });

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    log.debug('Incoming request', { method: req.method, path: req.path });
    next();
  });

  // API Routes
  const apiPrefix = `/api/${config.API_VERSION}`;

  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/webhooks`, webhookRoutes);
  app.use(`${apiPrefix}/users`, userRoutes);
  app.use(`${apiPrefix}/payments`, paymentRoutes);
  app.use(`${apiPrefix}/emails`, emailRoutes);
  app.use(`${apiPrefix}/forwarding`, forwardingRoutes);
  app.use(`${apiPrefix}/compliance`, complianceRoutes);
  app.use(`${apiPrefix}/encryption`, encryptionRoutes);

  // Health routes at root level (no API prefix for k8s probes)
  app.use('/health', healthRoutes);

  // Root endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'PubKeyMail API',
      version: config.API_VERSION,
      status: 'running',
      docs: `${config.DOMAIN}/docs`,
    });
  });

  // API info endpoint
  app.get(apiPrefix, (_req: Request, res: Response) => {
    res.json({
      version: config.API_VERSION,
      endpoints: {
        auth: `${apiPrefix}/auth`,
        webhooks: `${apiPrefix}/webhooks`,
        users: `${apiPrefix}/users`,
        payments: `${apiPrefix}/payments`,
        emails: `${apiPrefix}/emails`,
        forwarding: `${apiPrefix}/forwarding`,
        compliance: `${apiPrefix}/compliance`,
        encryption: `${apiPrefix}/encryption`,
        health: '/health',
      },
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Unhandled error', { error: err.message, stack: err.stack });

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          config.NODE_ENV === 'development'
            ? err.message
            : 'An unexpected error occurred',
      },
    });
  });

  return app;
}
