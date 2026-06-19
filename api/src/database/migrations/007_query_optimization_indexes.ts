/**
 * Query Optimization Indexes Migration
 *
 * Adds indexes to support query patterns introduced by mailbox search,
 * threading, and source-address filtering:
 *
 * - pg_trgm GIN indexes on emails.subject / body_text / sender_email so that
 *   `ILIKE '%term%'` searches (used by /emails/search) are index-assisted
 *   instead of sequential scans.
 * - A composite index on (recipient_address_id, sender_address) to speed up
 *   sender-filtered mailbox queries.
 * - An index on sent_emails.delivery_status for delivery dashboards.
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable trigram extension for substring/ILIKE acceleration.
  pgm.createExtension('pg_trgm', { ifNotExists: true });

  // Trigram GIN indexes for ILIKE search over text columns.
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_emails_subject_trgm
       ON emails USING gin (subject gin_trgm_ops)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_emails_body_text_trgm
       ON emails USING gin (body_text gin_trgm_ops)`
  );
  pgm.sql(
    `CREATE INDEX IF NOT EXISTS idx_emails_sender_email_trgm
       ON emails USING gin (sender_email gin_trgm_ops)`
  );

  // Composite index for sender-filtered mailbox queries.
  pgm.createIndex('emails', ['recipient_address_id', 'sender_address'], {
    name: 'idx_emails_recipient_sender',
    ifNotExists: true,
  });

  // Delivery status reporting.
  pgm.createIndex('sent_emails', 'delivery_status', {
    name: 'idx_sent_emails_delivery_status',
    ifNotExists: true,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('sent_emails', 'delivery_status', {
    name: 'idx_sent_emails_delivery_status',
    ifExists: true,
  });
  pgm.dropIndex('emails', ['recipient_address_id', 'sender_address'], {
    name: 'idx_emails_recipient_sender',
    ifExists: true,
  });
  pgm.sql('DROP INDEX IF EXISTS idx_emails_sender_email_trgm');
  pgm.sql('DROP INDEX IF EXISTS idx_emails_body_text_trgm');
  pgm.sql('DROP INDEX IF EXISTS idx_emails_subject_trgm');
  // Leave the pg_trgm extension in place; other features may rely on it.
}
