/**
 * Add Encryption Keys Migration
 * Creates user_encryption_keys table for end-to-end encrypted emails
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('user_encryption_keys', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
      unique: true,
    },
    public_key: {
      type: 'varchar(128)',
      notNull: true,
    },
    is_active: {
      type: 'boolean',
      default: true,
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

  pgm.createIndex('user_encryption_keys', 'user_id', {
    name: 'idx_user_encryption_keys_user',
  });
  pgm.createIndex('user_encryption_keys', 'is_active', {
    name: 'idx_user_encryption_keys_active',
    where: 'is_active = TRUE',
  });

  pgm.sql(`
    CREATE TRIGGER update_user_encryption_keys_updated_at 
        BEFORE UPDATE ON user_encryption_keys
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(
    `COMMENT ON TABLE user_encryption_keys IS 'Optional encryption public keys for end-to-end encrypted emails';`
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TRIGGER IF EXISTS update_user_encryption_keys_updated_at ON user_encryption_keys');
  pgm.dropTable('user_encryption_keys', { ifExists: true });
}
