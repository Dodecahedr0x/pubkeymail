/**
 * Database Migration Runner
 * Executes pending migrations using node-pg-migrate
 *
 * Usage:
 *   pnpm migrate          - Run all pending migrations
 *   pnpm migrate:rollback - Rollback last migration
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runner } from 'node-pg-migrate';
import { config } from 'dotenv';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigrations(): Promise<void> {
  const direction = process.argv.includes('--down') ? 'down' : 'up';
  const count = process.argv.includes('--all') ? undefined : 1;

  console.log(`Running migrations: ${direction}`);
  console.log(`Migration directory: ${resolve(__dirname, 'migrations')}`);

  try {
    await runner({
      databaseUrl: DATABASE_URL!,
      dir: resolve(__dirname, 'migrations'),
      direction,
      count: direction === 'down' ? count : undefined,
      migrationsTable: 'pgmigrations',
      verbose: true,
      log: console.log,
    });

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
