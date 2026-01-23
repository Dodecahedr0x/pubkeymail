/**
 * Database Reset Script
 * Drops all tables and re-runs migrations
 *
 * WARNING: This will delete ALL data
 * Only use in development/test environments
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runner } from 'node-pg-migrate';
import { config } from 'dotenv';
import { Pool } from 'pg';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function resetDatabase(): Promise<void> {
  // Safety check: prevent running in production
  if (process.env['NODE_ENV'] === 'production') {
    console.error('Cannot reset database in production environment');
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will delete ALL data in the database');
  console.log('Environment:', process.env['NODE_ENV'] || 'development');

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Dropping all tables...');

    // Drop all tables in the correct order
    await pool.query(`
      DROP TABLE IF EXISTS auth_nonces CASCADE;
      DROP TABLE IF EXISTS name_resolutions CASCADE;
      DROP TABLE IF EXISTS forwarding_rules CASCADE;
      DROP TABLE IF EXISTS sent_emails CASCADE;
      DROP TABLE IF EXISTS emails CASCADE;
      DROP TABLE IF EXISTS address_links CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS blockchain_addresses CASCADE;
      DROP TABLE IF EXISTS pgmigrations CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
      DROP COLLATION IF EXISTS case_sensitive CASCADE;
    `);

    console.log('All tables dropped');
    await pool.end();

    // Run migrations
    console.log('Running migrations...');
    await runner({
      databaseUrl: DATABASE_URL!,
      dir: resolve(__dirname, 'migrations'),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      verbose: true,
      log: console.log,
    });

    console.log('✅ Database reset complete');
  } catch (error) {
    console.error('Database reset failed:', error);
    await pool.end();
    process.exit(1);
  }
}

resetDatabase();
