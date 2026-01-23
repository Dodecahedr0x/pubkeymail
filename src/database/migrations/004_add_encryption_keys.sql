-- Migration: 004_add_encryption_keys
-- Description: Add user_encryption_keys table for end-to-end encrypted emails
-- Date: 2026-01-23

CREATE TABLE IF NOT EXISTS user_encryption_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key VARCHAR(128) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT user_encryption_keys_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_user_encryption_keys_user ON user_encryption_keys(user_id);
CREATE INDEX idx_user_encryption_keys_active ON user_encryption_keys(is_active) WHERE is_active = TRUE;

CREATE TRIGGER update_user_encryption_keys_updated_at 
    BEFORE UPDATE ON user_encryption_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_encryption_keys IS 'Optional encryption public keys for end-to-end encrypted emails';
