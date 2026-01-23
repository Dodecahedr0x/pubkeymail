/**
 * Payment Requests Migration
 * Creates table for tracking Solana Pay payment requests
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('payment_requests', {
    id: 'id',
    reference: {
      type: 'varchar(64)',
      notNull: true,
      unique: true,
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    plan: {
      type: 'varchar(20)',
      notNull: true,
    },
    amount: {
      type: 'decimal(10,2)',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'pending'",
    },
    signature: {
      type: 'varchar(128)',
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    confirmed_at: {
      type: 'timestamptz',
    },
  });

  pgm.addConstraint('payment_requests', 'payment_requests_plan_check', {
    check: "plan IN ('monthly', 'yearly')",
  });

  pgm.addConstraint('payment_requests', 'payment_requests_status_check', {
    check: "status IN ('pending', 'confirmed', 'expired', 'failed')",
  });

  pgm.createIndex('payment_requests', 'reference', {
    name: 'idx_payment_requests_reference',
    unique: true,
  });
  pgm.createIndex('payment_requests', 'user_id', {
    name: 'idx_payment_requests_user_id',
  });
  pgm.createIndex('payment_requests', 'status', {
    name: 'idx_payment_requests_status',
  });
  pgm.createIndex('payment_requests', 'expires_at', {
    name: 'idx_payment_requests_expires_at',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('payment_requests', { ifExists: true });
}
