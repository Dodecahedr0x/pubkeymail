-- PubKeyMail Database Initialization
-- CRITICAL: This database uses C collation for case-sensitive string comparisons
-- Blockchain addresses MUST be case-sensitive for security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create case-sensitive collation (if not already exists)
-- The database is already initialized with C collation, but this ensures it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'case_sensitive') THEN
        CREATE COLLATION case_sensitive (provider = libc, locale = 'C');
    END IF;
END
$$;

-- Blockchain addresses table
-- CRITICAL: address column MUST use case-sensitive collation
CREATE TABLE IF NOT EXISTS blockchain_addresses (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) COLLATE "C" NOT NULL UNIQUE,
    blockchain VARCHAR(50) NOT NULL DEFAULT 'solana',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT blockchain_addresses_blockchain_check
        CHECK (blockchain IN ('solana', 'ethereum', 'polygon'))
);

CREATE INDEX idx_blockchain_addresses_address ON blockchain_addresses(address COLLATE "C");
CREATE INDEX idx_blockchain_addresses_blockchain ON blockchain_addresses(blockchain);

-- Users table (registered users with subscriptions)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    primary_address_id INTEGER NOT NULL REFERENCES blockchain_addresses(id) ON DELETE CASCADE,
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    payment_provider VARCHAR(50),
    payment_id VARCHAR(255),
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT users_subscription_status_check
        CHECK (subscription_status IN ('active', 'inactive', 'cancelled', 'past_due')),
    CONSTRAINT users_subscription_tier_check
        CHECK (subscription_tier IN ('free', 'paid')),
    CONSTRAINT users_payment_provider_check
        CHECK (payment_provider IS NULL OR payment_provider = 'solana_pay'),
    CONSTRAINT users_primary_address_unique UNIQUE (primary_address_id)
);

CREATE INDEX idx_users_primary_address ON users(primary_address_id);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);

-- Address links (multi-address support)
CREATE TABLE IF NOT EXISTS address_links (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_id INTEGER NOT NULL REFERENCES blockchain_addresses(id) ON DELETE CASCADE,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT address_links_unique UNIQUE (user_id, address_id)
);

CREATE INDEX idx_address_links_user ON address_links(user_id);
CREATE INDEX idx_address_links_address ON address_links(address_id);

-- Emails table
-- CRITICAL: recipient_email MUST be case-sensitive
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_address_id INTEGER NOT NULL REFERENCES blockchain_addresses(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) COLLATE "C" NOT NULL,
    sender_address VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    headers JSONB,
    attachments JSONB,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    encryption_metadata JSONB,
    read BOOLEAN DEFAULT FALSE,

    CONSTRAINT emails_expires_at_check
        CHECK (expires_at IS NULL OR expires_at > received_at)
);

CREATE INDEX idx_emails_recipient_address ON emails(recipient_address_id, received_at DESC);
CREATE INDEX idx_emails_recipient_email ON emails(recipient_email COLLATE "C");
CREATE INDEX idx_emails_expires_at ON emails(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_emails_read ON emails(read) WHERE read = FALSE;

-- Sent emails table
CREATE TABLE IF NOT EXISTS sent_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_address_id INTEGER NOT NULL REFERENCES blockchain_addresses(id) ON DELETE CASCADE,
    sender_email VARCHAR(255) COLLATE "C" NOT NULL,
    recipient_address VARCHAR(255) NOT NULL,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    smtp_message_id VARCHAR(255),
    delivery_status VARCHAR(50) DEFAULT 'sent',

    CONSTRAINT sent_emails_delivery_status_check
        CHECK (delivery_status IN ('sent', 'delivered', 'bounced', 'failed'))
);

CREATE INDEX idx_sent_emails_sender_address ON sent_emails(sender_address_id, sent_at DESC);
CREATE INDEX idx_sent_emails_sender_email ON sent_emails(sender_email COLLATE "C");
CREATE INDEX idx_sent_emails_sent_at ON sent_emails(sent_at DESC);

-- Forwarding rules table
CREATE TABLE IF NOT EXISTS forwarding_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_address_id INTEGER NOT NULL REFERENCES blockchain_addresses(id) ON DELETE CASCADE,
    destination_email VARCHAR(255) NOT NULL,
    filter_conditions JSONB,
    enabled BOOLEAN DEFAULT TRUE,
    verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_forwarding_rules_user ON forwarding_rules(user_id);
CREATE INDEX idx_forwarding_rules_source ON forwarding_rules(source_address_id);
CREATE INDEX idx_forwarding_rules_enabled ON forwarding_rules(enabled) WHERE enabled = TRUE;

-- Name service resolutions cache
-- CRITICAL: name column must be case-sensitive
CREATE TABLE IF NOT EXISTS name_resolutions (
    id SERIAL PRIMARY KEY,
    name_service VARCHAR(50) NOT NULL,
    name VARCHAR(255) COLLATE "C" NOT NULL,
    blockchain_address VARCHAR(255) COLLATE "C" NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT name_resolutions_name_service_check
        CHECK (name_service IN ('SNS', 'ENS', 'unstoppable')),
    CONSTRAINT name_resolutions_unique UNIQUE (name_service, name COLLATE "C")
);

CREATE INDEX idx_name_resolutions_name ON name_resolutions(name_service, name COLLATE "C");
CREATE INDEX idx_name_resolutions_address ON name_resolutions(blockchain_address COLLATE "C");
CREATE INDEX idx_name_resolutions_expires_at ON name_resolutions(expires_at);

-- Authentication nonces table (for challenge-response)
CREATE TABLE IF NOT EXISTS auth_nonces (
    id SERIAL PRIMARY KEY,
    nonce VARCHAR(64) NOT NULL UNIQUE,
    address VARCHAR(255) COLLATE "C" NOT NULL,
    challenge TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_auth_nonces_nonce ON auth_nonces(nonce);
CREATE INDEX idx_auth_nonces_address ON auth_nonces(address COLLATE "C");
CREATE INDEX idx_auth_nonces_expires_at ON auth_nonces(expires_at);

-- Cleanup expired nonces periodically
CREATE INDEX idx_auth_nonces_cleanup ON auth_nonces(expires_at, used) WHERE used = FALSE;

-- Scheduled deletions table (for GDPR compliance with grace period)
CREATE TABLE IF NOT EXISTS scheduled_deletions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT scheduled_deletions_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_scheduled_deletions_user ON scheduled_deletions(user_id);
CREATE INDEX idx_scheduled_deletions_scheduled_for ON scheduled_deletions(scheduled_for);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for forwarding_rules table
CREATE TRIGGER update_forwarding_rules_updated_at BEFORE UPDATE ON forwarding_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User encryption keys table (for end-to-end encryption)
-- NOTE: Only PUBLIC keys are stored here. Private keys are NEVER stored server-side.
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

-- Trigger for user_encryption_keys table
CREATE TRIGGER update_user_encryption_keys_updated_at 
    BEFORE UPDATE ON user_encryption_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
-- Audit logs table (for security and compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    actor_id INTEGER,
    actor_address VARCHAR(255) COLLATE "C",
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT audit_logs_actor_type_check
        CHECK (actor_type IN ('user', 'system', 'anonymous')),
    CONSTRAINT audit_logs_status_check
        CHECK (status IN ('success', 'failure', 'pending'))
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_logs_actor_address ON audit_logs(actor_address COLLATE "C") WHERE actor_address IS NOT NULL;
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id) WHERE resource_type IS NOT NULL;

COMMENT ON TABLE blockchain_addresses IS 'Stores blockchain addresses with case-sensitive collation. CRITICAL for security.';
COMMENT ON COLUMN blockchain_addresses.address IS 'Case-sensitive blockchain address (base58 for Solana, hex for Ethereum)';
COMMENT ON TABLE emails IS 'Stores received emails. expires_at is NULL for registered users (infinite retention)';
COMMENT ON COLUMN emails.expires_at IS 'Expiration date for unregistered users. NULL = keep indefinitely (paid users)';
COMMENT ON TABLE name_resolutions IS 'Caches name service resolutions (SNS, ENS) with TTL';
COMMENT ON TABLE user_encryption_keys IS 'Optional encryption public keys for end-to-end encrypted emails';
COMMENT ON TABLE audit_logs IS 'Security audit trail for all sensitive operations';
