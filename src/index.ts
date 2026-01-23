/**
 * PubKeyMail - Main Application Entry Point
 * Blockchain-based email service with wallet authentication
 *
 * This is the main server that wires together all routes and services.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import { config, isLocalDevMode } from './config/index.js';
import { emailCleanupScheduler } from './services/email/cleanup-scheduler.js';

// Import routes
import authRoutes from './api/routes/auth-routes.js';
import webhookRoutes from './api/routes/webhook-routes.js';
import userRoutes from './api/routes/user-routes.js';
import paymentRoutes from './api/routes/payment-routes.js';
import healthRoutes from './api/routes/health-routes.js';
import emailRoutes from './api/routes/email-routes.js';
import forwardingRoutes from './api/routes/forwarding-routes.js';
import complianceRoutes from './api/routes/compliance-routes.js';
import encryptionRoutes from './api/routes/encryption-routes.js';

/**
 * Create and configure Express application
 */
function createApp(): Application {
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

  // Request logging (development)
  if (config.NODE_ENV === 'development') {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

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
    console.error('Unhandled error:', err);

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

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  const app = createApp();
  const port = config.PORT;

  // Start cleanup scheduler
  if (config.NODE_ENV !== 'test') {
    emailCleanupScheduler.start({
      enabled: true,
      runOnStartup: false,
    });
    console.log('Email cleanup scheduler started');
  }

  // Start HTTP server
  const server = app.listen(port, () => {
    const modeInfo = isLocalDevMode
      ? '🧪 LOCAL DEV (in-memory)'
      : config.NODE_ENV;
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                       PubKeyMail API                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:    Running                                           ║
║  Port:      ${port.toString().padEnd(50)}║
║  Mode:      ${modeInfo.padEnd(50)}║
║  API:       http://localhost:${port}/api/${config.API_VERSION.padEnd(32)}║
║  Health:    http://localhost:${port}/health${''.padEnd(27)}║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Stop cleanup scheduler
    emailCleanupScheduler.stop();
    console.log('Cleanup scheduler stopped');

    // Give ongoing requests time to complete
    setTimeout(() => {
      console.log('Shutdown complete');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server if this is the main module
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export { createApp };
