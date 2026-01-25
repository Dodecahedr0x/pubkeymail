/**
 * Add Missing Columns Migration
 * Adds sender_email and read columns to emails table
 * Creates audit_logs table for security tracking
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add sender_email column to emails table
  pgm.addColumn('emails', {
    sender_email: {
      type: 'varchar(255)',
      notNull: true,
      default: "''",
    },
  });

  // Copy sender_address to sender_email for existing rows
  pgm.sql(`UPDATE emails SET sender_email = sender_address WHERE sender_email = ''`);

  // Add read column to emails table
  pgm.addColumn('emails', {
    read: {
      type: 'boolean',
      default: false,
    },
  });

  // Create index for unread emails
  pgm.createIndex('emails', 'read', {
    name: 'idx_emails_read',
    where: 'read = FALSE',
  });

  // Create audit_logs table
  pgm.createTable('audit_logs', {
    id: 'id',
    event_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    actor_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    actor_id: {
      type: 'integer',
    },
    actor_address: {
      type: 'varchar(255)',
      collation: '"C"',
    },
    resource_type: {
      type: 'varchar(100)',
    },
    resource_id: {
      type: 'varchar(255)',
    },
    action: {
      type: 'varchar(100)',
      notNull: true,
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
    },
    ip_address: {
      type: 'varchar(45)',
    },
    user_agent: {
      type: 'text',
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'",
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
  });

  // Add check constraints
  pgm.addConstraint('audit_logs', 'audit_logs_actor_type_check', {
    check: "actor_type IN ('user', 'system', 'anonymous')",
  });

  pgm.addConstraint('audit_logs', 'audit_logs_status_check', {
    check: "status IN ('success', 'failure', 'pending')",
  });

  // Create indexes for audit_logs
  pgm.createIndex('audit_logs', 'actor_id', {
    name: 'idx_audit_logs_actor_id',
    where: 'actor_id IS NOT NULL',
  });

  pgm.createIndex('audit_logs', 'actor_address', {
    name: 'idx_audit_logs_actor_address',
    where: 'actor_address IS NOT NULL',
  });

  pgm.createIndex('audit_logs', 'event_type', {
    name: 'idx_audit_logs_event_type',
  });

  pgm.createIndex('audit_logs', 'created_at', {
    name: 'idx_audit_logs_created_at',
  });

  pgm.createIndex('audit_logs', ['resource_type', 'resource_id'], {
    name: 'idx_audit_logs_resource',
    where: 'resource_type IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop audit_logs table
  pgm.dropTable('audit_logs');

  // Drop indexes and columns from emails
  pgm.dropIndex('emails', 'read', { name: 'idx_emails_read' });
  pgm.dropColumn('emails', 'read');
  pgm.dropColumn('emails', 'sender_email');
}
