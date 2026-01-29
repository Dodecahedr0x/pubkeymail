/**
 * Initial Database Schema Migration
 * Creates all tables required for PubKeyMail
 *
 * CRITICAL: All address columns use C collation for case-sensitive comparisons
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable UUID extension
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create case-sensitive collation (if not exists)
  pgm.sql(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'case_sensitive') THEN
            CREATE COLLATION case_sensitive (provider = libc, locale = 'C');
        END IF;
    END
    $$;
  `);

  // Blockchain addresses table
  pgm.createTable('blockchain_addresses', {
    id: 'id',
    address: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
      collation: '"C"',
    },
    blockchain: {
      type: 'varchar(50)',
      notNull: true,
      default: "'solana'",
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('blockchain_addresses', 'blockchain_addresses_blockchain_check', {
    check: "blockchain IN ('solana', 'ethereum', 'polygon')",
  });

  pgm.createIndex('blockchain_addresses', 'address', {
    name: 'idx_blockchain_addresses_address',
  });
  pgm.createIndex('blockchain_addresses', 'blockchain', {
    name: 'idx_blockchain_addresses_blockchain',
  });

  // Users table
  pgm.createTable('users', {
    id: 'id',
    primary_address_id: {
      type: 'integer',
      notNull: true,
      references: 'blockchain_addresses',
      onDelete: 'CASCADE',
      unique: true,
    },
    subscription_status: {
      type: 'varchar(50)',
      notNull: true,
      default: "'inactive'",
    },
    subscription_tier: {
      type: 'varchar(50)',
      notNull: true,
      default: "'free'",
    },
    payment_provider: {
      type: 'varchar(50)',
    },
    payment_id: {
      type: 'varchar(255)',
    },
    subscription_expires_at: {
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('users', 'users_subscription_status_check', {
    check: "subscription_status IN ('active', 'inactive', 'cancelled', 'past_due')",
  });
  pgm.addConstraint('users', 'users_subscription_tier_check', {
    check: "subscription_tier IN ('free', 'paid')",
  });
  pgm.addConstraint('users', 'users_payment_provider_check', {
    check: "payment_provider IS NULL OR payment_provider = 'solana_pay'",
  });

  pgm.createIndex('users', 'primary_address_id', { name: 'idx_users_primary_address' });
  pgm.createIndex('users', 'subscription_status', { name: 'idx_users_subscription_status' });
  pgm.createIndex('users', 'subscription_tier', { name: 'idx_users_subscription_tier' });

  // Address links table
  pgm.createTable('address_links', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    address_id: {
      type: 'integer',
      notNull: true,
      references: 'blockchain_addresses',
      onDelete: 'CASCADE',
    },
    verified_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('address_links', 'address_links_unique', {
    unique: ['user_id', 'address_id'],
  });

  pgm.createIndex('address_links', 'user_id', { name: 'idx_address_links_user' });
  pgm.createIndex('address_links', 'address_id', { name: 'idx_address_links_address' });

  // Emails table
  pgm.createTable('emails', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    recipient_address_id: {
      type: 'integer',
      notNull: true,
      references: 'blockchain_addresses',
      onDelete: 'CASCADE',
    },
    recipient_email: {
      type: 'varchar(255)',
      notNull: true,
      collation: '"C"',
    },
    sender_address: {
      type: 'varchar(255)',
      notNull: true,
    },
    subject: { type: 'text' },
    body_text: { type: 'text' },
    body_html: { type: 'text' },
    headers: { type: 'jsonb' },
    attachments: { type: 'jsonb' },
    received_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    expires_at: { type: 'timestamptz' },
    is_encrypted: {
      type: 'boolean',
      default: false,
    },
    encryption_metadata: { type: 'jsonb' },
  });

  pgm.addConstraint('emails', 'emails_expires_at_check', {
    check: 'expires_at IS NULL OR expires_at > received_at',
  });

  pgm.createIndex('emails', ['recipient_address_id', 'received_at'], {
    name: 'idx_emails_recipient_address',
  });
  pgm.createIndex('emails', 'recipient_email', { name: 'idx_emails_recipient_email' });
  pgm.createIndex('emails', 'expires_at', {
    name: 'idx_emails_expires_at',
    where: 'expires_at IS NOT NULL',
  });
  pgm.createIndex('emails', 'received_at', { name: 'idx_emails_received_at' });

  // Sent emails table
  pgm.createTable('sent_emails', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    sender_address_id: {
      type: 'integer',
      notNull: true,
      references: 'blockchain_addresses',
      onDelete: 'CASCADE',
    },
    sender_email: {
      type: 'varchar(255)',
      notNull: true,
      collation: '"C"',
    },
    recipient_address: {
      type: 'varchar(255)',
      notNull: true,
    },
    subject: { type: 'text' },
    body_text: { type: 'text' },
    body_html: { type: 'text' },
    sent_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    smtp_message_id: { type: 'varchar(255)' },
    delivery_status: {
      type: 'varchar(50)',
      default: "'sent'",
    },
  });

  pgm.addConstraint('sent_emails', 'sent_emails_delivery_status_check', {
    check: "delivery_status IN ('sent', 'delivered', 'bounced', 'failed')",
  });

  pgm.createIndex('sent_emails', ['sender_address_id', 'sent_at'], {
    name: 'idx_sent_emails_sender_address',
  });
  pgm.createIndex('sent_emails', 'sender_email', { name: 'idx_sent_emails_sender_email' });
  pgm.createIndex('sent_emails', 'sent_at', { name: 'idx_sent_emails_sent_at' });

  // Forwarding rules table
  pgm.createTable('forwarding_rules', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    source_address_id: {
      type: 'integer',
      notNull: true,
      references: 'blockchain_addresses',
      onDelete: 'CASCADE',
    },
    destination_email: {
      type: 'varchar(255)',
      notNull: true,
    },
    filter_conditions: { type: 'jsonb' },
    enabled: { type: 'boolean', default: true },
    verified: { type: 'boolean', default: false },
    verification_token: { type: 'varchar(255)' },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('forwarding_rules', 'user_id', { name: 'idx_forwarding_rules_user' });
  pgm.createIndex('forwarding_rules', 'source_address_id', {
    name: 'idx_forwarding_rules_source',
  });
  pgm.createIndex('forwarding_rules', 'enabled', {
    name: 'idx_forwarding_rules_enabled',
    where: 'enabled = TRUE',
  });

  // Name resolutions cache table
  pgm.createTable('name_resolutions', {
    id: 'id',
    name_service: {
      type: 'varchar(50)',
      notNull: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
      collation: '"C"',
    },
    blockchain_address: {
      type: 'varchar(255)',
      notNull: true,
      collation: '"C"',
    },
    resolved_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    expires_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('name_resolutions', 'name_resolutions_name_service_check', {
    check: "name_service IN ('SNS', 'ENS', 'unstoppable')",
  });
  pgm.addConstraint('name_resolutions', 'name_resolutions_unique', {
    unique: ['name_service', 'name'],
  });

  pgm.createIndex('name_resolutions', ['name_service', 'name'], {
    name: 'idx_name_resolutions_name',
  });
  pgm.createIndex('name_resolutions', 'blockchain_address', {
    name: 'idx_name_resolutions_address',
  });
  pgm.createIndex('name_resolutions', 'expires_at', { name: 'idx_name_resolutions_expires_at' });

  // Auth nonces table (for challenge-response)
  pgm.createTable('auth_nonces', {
    id: 'id',
    nonce: {
      type: 'varchar(64)',
      notNull: true,
      unique: true,
    },
    address: {
      type: 'varchar(255)',
      notNull: true,
      collation: '"C"',
    },
    challenge: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    used: {
      type: 'boolean',
      default: false,
    },
  });

  pgm.createIndex('auth_nonces', 'nonce', { name: 'idx_auth_nonces_nonce' });
  pgm.createIndex('auth_nonces', 'address', { name: 'idx_auth_nonces_address' });
  pgm.createIndex('auth_nonces', 'expires_at', { name: 'idx_auth_nonces_expires_at' });
  pgm.createIndex('auth_nonces', ['expires_at', 'used'], {
    name: 'idx_auth_nonces_cleanup',
    where: 'used = FALSE',
  });

  // Create update_updated_at function and triggers
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  pgm.sql(`
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(`
    CREATE TRIGGER update_forwarding_rules_updated_at BEFORE UPDATE ON forwarding_rules
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // Add table comments
  pgm.sql(`
    COMMENT ON TABLE blockchain_addresses IS 'Stores blockchain addresses with case-sensitive collation. CRITICAL for security.';
    COMMENT ON COLUMN blockchain_addresses.address IS 'Case-sensitive blockchain address (base58 for Solana, hex for Ethereum)';
    COMMENT ON TABLE emails IS 'Stores received emails. expires_at is NULL for registered users (infinite retention)';
    COMMENT ON COLUMN emails.expires_at IS 'Expiration date for unregistered users. NULL = keep indefinitely (paid users)';
    COMMENT ON TABLE name_resolutions IS 'Caches name service resolutions (SNS, ENS) with TTL';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop triggers first
  pgm.sql('DROP TRIGGER IF EXISTS update_forwarding_rules_updated_at ON forwarding_rules');
  pgm.sql('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column()');

  // Drop tables in reverse order of creation (respecting foreign keys)
  pgm.dropTable('auth_nonces', { ifExists: true });
  pgm.dropTable('name_resolutions', { ifExists: true });
  pgm.dropTable('forwarding_rules', { ifExists: true });
  pgm.dropTable('sent_emails', { ifExists: true });
  pgm.dropTable('emails', { ifExists: true });
  pgm.dropTable('address_links', { ifExists: true });
  pgm.dropTable('users', { ifExists: true });
  pgm.dropTable('blockchain_addresses', { ifExists: true });

  // Drop collation
  pgm.sql('DROP COLLATION IF EXISTS case_sensitive');
}
