# PubKeyMail - Technical Architecture

## System Overview

PubKeyMail is a blockchain-authenticated email service that maps blockchain addresses and name services to email addresses. The system handles email routing, storage, authentication, and forwarding while maintaining strict case sensitivity and blockchain-based access control.

## Architecture Principles

1. **Blockchain-First Authentication**: All access control based on keypair ownership
2. **Extensibility**: Support multiple blockchains and name services
3. **Case Sensitivity**: Preserve blockchain address case sensitivity throughout
4. **Provider Integration**: Leverage existing SMTP providers for email transport
5. **Scalability**: Design for 100k+ emails/day within first year

## System Components

### 1. API Server
**Technology Stack**: Node.js/Express with TypeScript

**Responsibilities**:
- User authentication via wallet signatures
- RESTful API for all operations
- Webhook handling for SMTP providers
- Payment webhook processing
- Rate limiting and security

**Key Endpoints**:
- `POST /auth/challenge` - Get authentication challenge
- `POST /auth/verify` - Verify wallet signature
- `GET /mailbox/:address` - Get emails for address
- `POST /mail/send` - Send email from derived address
- `POST /addresses/link` - Link additional addresses
- `POST /forwarding/rules` - Configure forwarding
- `GET /subscription/status` - Check subscription status

### 1b. Web Application (Frontend)
**Technology Stack**: Next.js/SvelteKit/Remix with TypeScript, Tailwind CSS

**Responsibilities**:
- Wallet connection and authentication UI
- Mailbox browsing and email viewing
- Email composition interface (paid tier)
- Settings and account management
- Payment flow integration
- Multi-address linking UI

**Key Components**:
- **WalletConnect**: Solana wallet adapter integration
- **AuthProvider**: Session management with JWT
- **MailboxView**: Email list with pagination
- **EmailDetail**: Full email content display
- **ComposeEmail**: Rich text editor for sending
- **Settings**: Forwarding rules, linked addresses
- **PaymentFlow**: Stripe checkout / Solana Pay QR

**Pages**:
- `/` - Landing page with wallet connect
- `/mailbox` - Main mailbox view
- `/mailbox/:emailId` - Single email view
- `/compose` - Email composition (paid)
- `/settings` - Account settings
- `/settings/forwarding` - Forwarding rules
- `/settings/addresses` - Linked addresses
- `/upgrade` - Subscription payment

### 2. Email Ingestion Service
**Responsibilities**:
- Receive emails from SMTP provider webhooks
- Extract and validate recipient addresses
- Resolve blockchain addresses from name services
- Route emails to appropriate storage
- Trigger forwarding rules

**Flow**:
```
SMTP Provider → Webhook → Ingestion Service → Address Resolver → Storage
                                            → Forwarding Service
```

**Key Operations**:
- Parse email recipient (case-sensitive)
- Resolve name service to blockchain address
- Create mailbox entry
- Apply retention policy
- Execute forwarding rules

### 3. Address Resolution Service
**Responsibilities**:
- Resolve Solana Name Service (SNS) to blockchain addresses
- Cache resolutions for performance
- Support future name services (ENS, etc.)
- Maintain resolution history

**Resolution Logic**:
```typescript
interface AddressResolution {
  emailAddress: string;           // e.g., "vitalik.eth@domain.tld"
  blockchainAddress: string;      // Resolved address at time of receipt
  nameService?: string;           // "SNS", "ENS", etc.
  resolvedAt: Date;              // Timestamp of resolution
  expiresAt?: Date;              // Cache expiration
}
```

**Providers**:
- Solana Name Service (SNS) resolver
- Future: ENS, Unstoppable Domains, etc.

### 4. Authentication Service
**Responsibilities**:
- Generate authentication challenges
- Verify blockchain signatures
- Manage session tokens
- Validate mailbox access

**Authentication Flow**:
```
1. Client requests challenge
2. Service generates unique nonce
3. Client signs nonce with wallet
4. Service verifies signature against claimed address
5. Issue JWT/session token
```

**Important**: Never store private keys; only verify signatures

### 5. Storage Layer
**Database**: PostgreSQL or similar RDBMS

**Schema Design**:

```sql
-- Blockchain addresses (normalized)
CREATE TABLE blockchain_addresses (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) UNIQUE NOT NULL,  -- Case-sensitive!
    blockchain VARCHAR(50) NOT NULL,       -- "solana", "ethereum", etc.
    created_at TIMESTAMP DEFAULT NOW()
);

-- User accounts (registered users)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    primary_address_id INTEGER REFERENCES blockchain_addresses(id),
    subscription_status VARCHAR(50),       -- "active", "inactive", "trial"
    subscription_tier VARCHAR(50),         -- "free", "paid"
    payment_provider VARCHAR(50),          -- "stripe", "solana_pay"
    payment_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Address linking (multi-address support)
CREATE TABLE address_links (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    address_id INTEGER REFERENCES blockchain_addresses(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, address_id)
);

-- Email storage
CREATE TABLE emails (
    id SERIAL PRIMARY KEY,
    recipient_address_id INTEGER REFERENCES blockchain_addresses(id),
    recipient_email VARCHAR(255) NOT NULL,  -- Full email (case-sensitive)
    sender_address VARCHAR(255) NOT NULL,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    headers JSONB,
    attachments JSONB,
    received_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,                   -- NULL for registered users
    is_encrypted BOOLEAN DEFAULT FALSE,
    encryption_metadata JSONB
);

CREATE INDEX idx_emails_recipient ON emails(recipient_address_id, received_at DESC);
CREATE INDEX idx_emails_expires ON emails(expires_at) WHERE expires_at IS NOT NULL;

-- Sent emails
CREATE TABLE sent_emails (
    id SERIAL PRIMARY KEY,
    sender_address_id INTEGER REFERENCES blockchain_addresses(id),
    sender_email VARCHAR(255) NOT NULL,
    recipient_address VARCHAR(255) NOT NULL,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    sent_at TIMESTAMP DEFAULT NOW(),
    smtp_message_id VARCHAR(255)
);

-- Forwarding rules
CREATE TABLE forwarding_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    source_address_id INTEGER REFERENCES blockchain_addresses(id),
    destination_email VARCHAR(255) NOT NULL,
    filter_conditions JSONB,               -- Optional filters
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Name service resolutions (cache)
CREATE TABLE name_resolutions (
    id SERIAL PRIMARY KEY,
    name_service VARCHAR(50) NOT NULL,     -- "SNS", "ENS", etc.
    name VARCHAR(255) NOT NULL,            -- e.g., "vitalik.eth"
    blockchain_address VARCHAR(255) NOT NULL,
    resolved_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    UNIQUE(name_service, name)
);
```

### 6. Email Cleanup Service
**Responsibilities**:
- Identify emails older than retention period
- Delete expired emails for unregistered addresses
- Preserve emails for registered users
- Run periodic cleanup jobs

**Cleanup Logic**:
```typescript
async function cleanupExpiredEmails() {
  const retentionDays = config.EMAIL_RETENTION_DAYS; // 30 days
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Find emails that are:
  // 1. Older than retention period
  // 2. Belong to addresses that never logged in (no user account)
  // 3. The address still has at least one email newer than cutoff

  await db.query(`
    DELETE FROM emails
    WHERE received_at < $1
      AND recipient_address_id NOT IN (
        SELECT address_id FROM address_links
        UNION
        SELECT primary_address_id FROM users
      )
      AND expires_at < NOW()
  `, [cutoffDate]);
}
```

**Schedule**: Run daily via cron job or scheduled task

### 7. Payment Integration Service
**Stripe Integration**:
- Subscription creation and management
- Webhook handling for payment events
- Automatic tier upgrades/downgrades

**Solana Pay Integration**:
- Generate payment requests
- Monitor blockchain for payments
- Verify payment amounts
- Update subscription status

**Payment Flow**:
```
1. User selects subscription plan
2. User chooses payment method
3a. Stripe: Redirect to Stripe Checkout
3b. Solana Pay: Display QR code / payment request
4. Verify payment
5. Upgrade user tier
6. Update email retention (remove expiration dates)
```

### 8. SMTP Integration
**Inbound Provider Options**:
- SendGrid Inbound Parse
- Postmark Inbound
- Mailgun Routes
- AWS SES

**Outbound Provider Options**:
- SendGrid API
- Postmark API
- AWS SES
- Mailgun API

**Configuration**:
- DNS setup (MX records, SPF, DKIM, DMARC)
- Webhook endpoints for inbound mail
- API credentials for outbound mail
- Rate limiting and quotas

### 9. Blockchain Integration Layer
**Solana Integration**:
- RPC endpoint configuration
- SNS resolution library
- Transaction signing for Solana Pay
- Account verification

**Future Blockchain Support**:
- Ethereum (ENS)
- Polygon
- Arbitrum
- Other EVM chains

**Abstraction Layer**:
```typescript
interface BlockchainProvider {
  resolveNameService(name: string): Promise<string>;
  verifySignature(message: string, signature: string, address: string): Promise<boolean>;
  getAddress(publicKey: string): string;
}

class SolanaProvider implements BlockchainProvider {
  // Solana-specific implementation
}

class EthereumProvider implements BlockchainProvider {
  // Ethereum-specific implementation
}
```

## Security Considerations

### 1. Email Address Case Sensitivity
- **Critical**: Maintain case sensitivity throughout entire system
- Database collation: Use case-sensitive collation for address columns
- Email routing: Case-sensitive matching
- Authentication: Case-sensitive address verification

### 2. Wallet Authentication Security
- Use secure challenge-response mechanism
- Nonces must be unique and time-limited
- Verify signatures server-side
- Never trust client-provided addresses without signature verification

### 3. Email Security
- Implement rate limiting per address
- Validate email size and attachment limits
- Scan for spam and malicious content
- SPF/DKIM/DMARC verification

### 4. Data Privacy
- GDPR compliance for EU users
- User data deletion capability
- Privacy policy and terms of service
- Encrypted storage for sensitive data

### 5. Recipient Verification
- Verify recipient addresses before sending
- Check for typos and invalid addresses
- Implement CAPTCHA or similar for sending
- Rate limit outbound emails per user

## Scalability Considerations

### Database Optimization
- Indexed queries on frequently accessed columns
- Partitioning large tables (emails by date)
- Read replicas for mailbox queries
- Connection pooling

### Caching Strategy
- Redis for name service resolutions
- Cache mailbox metadata
- Session token caching
- Rate limiting counters

### Horizontal Scaling
- Stateless API servers (scale horizontally)
- Load balancer for API traffic
- Queue-based email processing (e.g., RabbitMQ, Redis Queue)
- Distributed cleanup jobs

### Email Processing Queue
```
SMTP Webhook → Queue → Worker Pool → Storage
                     → Forwarding
                     → Resolution
```

## Monitoring & Observability

### Metrics to Track
- Email ingestion rate
- Email delivery success rate
- Forwarding success rate
- Authentication success/failure rate
- Storage usage per user
- Cleanup job statistics
- Blockchain resolution times
- Payment conversion rates

### Logging
- Structured logging (JSON format)
- Email routing decisions
- Authentication attempts
- Payment events
- Error tracking

### Alerting
- High error rates
- Failed payments
- SMTP provider failures
- Database connection issues
- Unusual traffic patterns

## Deployment Architecture

### Recommended Stack
```
Load Balancer (Nginx/Cloudflare)
    ↓
API Servers (Auto-scaling group)
    ↓
Database (PostgreSQL with replication)
    ↓
Cache (Redis)
    ↓
Queue (Redis/RabbitMQ)
    ↓
Worker Pool (Email processing)
```

### Infrastructure
- **Cloud Provider**: AWS, GCP, or Digital Ocean
- **Container Orchestration**: Docker + Kubernetes or Docker Swarm
- **CI/CD**: GitHub Actions or GitLab CI
- **Monitoring**: Prometheus + Grafana or Datadog
- **Error Tracking**: Sentry

## Configuration Management

Environment variables and config files:
```env
# Application
NODE_ENV=production
PORT=3000
DOMAIN=yourdomain.tld

# Database
DATABASE_URL=postgresql://user:pass@host:5432/pubkeymail
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://host:6379

# Email Retention
EMAIL_RETENTION_DAYS=30

# SMTP
SMTP_PROVIDER=sendgrid
SMTP_API_KEY=xxx
SMTP_WEBHOOK_SECRET=xxx
SMTP_FROM_DOMAIN=yourdomain.tld

# Blockchain
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
SOLANA_CLUSTER=mainnet-beta

# Payments
STRIPE_SECRET_KEY=xxx
STRIPE_WEBHOOK_SECRET=xxx
SOLANA_PAY_MERCHANT_WALLET=xxx

# Authentication
JWT_SECRET=xxx
SESSION_DURATION=86400

# Rate Limiting
RATE_LIMIT_PER_HOUR=100
```

## Testing Strategy

### Unit Tests
- Address resolution logic
- Signature verification
- Email parsing
- Forwarding rule matching

### Integration Tests
- Email ingestion flow
- Authentication flow
- Payment processing
- Cleanup jobs

### End-to-End Tests
- Complete user registration flow
- Send and receive email flow
- Forwarding configuration flow
- Multi-address linking flow

### Load Testing
- Simulate 100k emails/day
- Concurrent user authentication
- Database query performance
- SMTP provider rate limits

## Compliance & Legal

### Required Documentation
- Privacy Policy
- Terms of Service
- GDPR Data Processing Agreement
- Email retention policy
- Acceptable Use Policy

### Compliance Requirements
- GDPR (EU)
- CAN-SPAM Act (US)
- CASL (Canada)
- Email authentication (SPF/DKIM/DMARC)
- Data breach notification procedures

### Data Retention
- Email retention policy (30 days for unregistered)
- User data deletion on request
- Backup retention policy
- Audit log retention
