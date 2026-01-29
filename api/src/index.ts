/**
 * PubKeyMail - Main Application Entry Point
 * Blockchain-based email service with wallet authentication
 *
 * This is the main server that starts the API and background services.
 */

import { config, isLocalDevMode } from './config/index.js';
import { emailCleanupScheduler } from './services/email/cleanup-scheduler.js';
import { createLogger } from './services/logger/index.js';
import { createApp } from './api/index.js';

const log = createLogger('Server');

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
    log.info('Email cleanup scheduler started');
  }

  // Start HTTP server
  const server = app.listen(port, () => {
    const modeInfo = isLocalDevMode
      ? '🧪 LOCAL DEV (in-memory)'
      : config.NODE_ENV;
    log.info('Server started', {
      port,
      mode: modeInfo,
      api: `http://localhost:${port}/api/${config.API_VERSION}`,
      health: `http://localhost:${port}/health`,
      logLevel: config.LOG_LEVEL,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info('Shutdown initiated', { signal });

    // Stop accepting new connections
    server.close(() => {
      log.info('HTTP server closed');
    });

    // Stop cleanup scheduler
    emailCleanupScheduler.stop();
    log.info('Cleanup scheduler stopped');

    // Give ongoing requests time to complete
    setTimeout(() => {
      log.info('Shutdown complete');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server if this is the main module
startServer().catch((error) => {
  log.fatal('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Re-export createApp for testing
export { createApp } from './api/index.js';
