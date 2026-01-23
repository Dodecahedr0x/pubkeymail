-- Audit Logs Migration
-- Security-relevant event logging for compliance and incident response

CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  actor_type VARCHAR(20) NOT NULL, -- 'user', 'system', 'anonymous'
  actor_id INTEGER, -- user ID if applicable
  actor_address VARCHAR(255), -- blockchain address if applicable
  resource_type VARCHAR(50), -- 'email', 'user', 'subscription', etc.
  resource_id VARCHAR(255), -- ID of affected resource
  action VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'login', etc.
  status VARCHAR(20) NOT NULL, -- 'success', 'failure', 'blocked'
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
