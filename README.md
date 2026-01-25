# PubKeyMail

Blockchain-based email service with wallet authentication. Map blockchain addresses and name services (SNS, ENS) to email addresses, authenticate with your wallet, and manage your inbox without passwords.

## Features

- **Wallet-Based Authentication** - Sign with your Solana (or Ethereum) wallet to access your mailbox
- **Blockchain Address Email** - Receive email at `YourWalletAddress@pubkeymail.com`
- **Name Service Integration** - Use SNS/ENS names like `yourname.sol@pubkeymail.com`
- **Multi-Address Support** - Link multiple wallets to a unified inbox
- **Email Forwarding** - Forward to external email addresses (paid tier)
- **Send Emails** - Compose and send from your blockchain addresses (paid tier)
- **Case-Sensitive** - Blockchain address case sensitivity preserved throughout

## Tech Stack

- **Runtime**: Node.js 24+ with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with case-sensitive collation
- **Cache**: Redis for sessions and nonce storage
- **Blockchain**: Solana Web3.js, Solana Name Service (SNS)
- **Email**: SendGrid/Postmark/Mailgun (multi-provider support)
- **Payments**: Solana Pay (USDC)
- **Testing**: Vitest with 85%+ coverage requirement

## Project Status

### ✅ Completed

**Phase 1: Foundation & Core Infrastructure**
- Project structure (API, services, database layers)
- PostgreSQL with case-sensitive collation
- Redis for caching and nonce storage
- Configuration management with Zod validation
- Vitest test framework

**Phase 2: Blockchain Integration**
- Solana Web3.js SDK integration
- Solana Name Service (SNS) resolution with caching
- Ed25519 signature verification (TweetNaCl)
- Challenge-response authentication
- JWT session tokens
- Blockchain provider abstraction interface

**Phase 3: Email Core Functionality**
- Multi-provider SMTP webhook support (SendGrid/Postmark/Mailgun)
- Case-sensitive email parsing and routing
- Address resolution pipeline
- Email storage with retention policy
- Mailbox query API with pagination
- HTML/plain text and attachment support

### 🚧 In Progress

**Phase 3: Email Cleanup Service**
- Scheduled cleanup job (cron)
- Granular cleanup logic (30-day threshold)
- Safety checks and monitoring

**Phase 4: User Management & Payments**
- User registration flow
- Subscription tier management
- Solana Pay (USDC) integration

### 📋 Planned

- **Phase 5**: Outbound email sending
- **Phase 6**: Email forwarding, multi-address linking
- **Phase 7**: Security hardening, compliance
- **Phase 8**: Optional encryption
- **Phase 9**: Performance optimization
- **Phase 10**: Multi-blockchain support (Ethereum/ENS)
- **Phase 11**: Web Application/UI

## Quick Start

### Prerequisites

- Node.js 24+
- Docker and Docker Compose
- pnpm (recommended) or npm

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/pubkeymail.git
cd pubkeymail

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start infrastructure (PostgreSQL, Redis)
docker-compose up -d

# Run development server
pnpm dev
```

### Local Development Mode (No External Dependencies)

For quick local development without PostgreSQL or Redis:

```bash
# Start with in-memory storage
pnpm dev:local
```

This mode:
- Uses **in-memory storage** instead of PostgreSQL and Redis
- Requires **no Docker** or external services
- Data is **lost on restart** (development only)
- All authentication, caching, and database operations work normally

Perfect for:
- Quick prototyping
- Testing API endpoints
- Frontend development
- CI environments without database access

### Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000
DOMAIN=localhost

# Database
DATABASE_URL=postgresql://pubkeymail:pubkeymail@localhost:5432/pubkeymail

# Redis
REDIS_URL=redis://localhost:6379

# Email
EMAIL_RETENTION_DAYS=30
SMTP_PROVIDER=sendgrid
SMTP_API_KEY=your-api-key

# Blockchain
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet

# Authentication
JWT_SECRET=your-secret-key
SESSION_DURATION=86400
```

## Commands

```bash
# Development
pnpm dev              # Start dev server with hot reload
pnpm dev:local        # Start with in-memory storage (no Docker needed)
pnpm build            # Build for production
pnpm start            # Run production build

# Testing
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage (85% minimum)

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix linting issues
pnpm format           # Format with Prettier
pnpm type-check       # TypeScript type checking

# Database
pnpm migrate          # Run migrations
pnpm migrate:rollback # Rollback migration
pnpm db:reset         # Reset database
pnpm db:seed          # Seed test data
```

## Project Structure

```
pubkeymail/
├── src/
│   ├── api/
│   │   ├── middleware/     # Auth, rate limiting, validation
│   │   └── routes/         # API route handlers
│   ├── config/             # Configuration management
│   ├── database/           # PostgreSQL connection, queries
│   ├── services/
│   │   ├── auth/           # Wallet authentication, JWT
│   │   ├── blockchain/     # Solana, SNS resolution
│   │   ├── cache/          # Redis client, nonce store
│   │   ├── email/          # Ingestion, storage, cleanup
│   │   └── payment/        # Solana Pay
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Shared utilities
├── tests/                  # Test files
├── docs/                   # Documentation
├── specs/                  # Product & technical specifications
└── docker-compose.yml      # Development infrastructure
```

## API Endpoints

### Authentication
- `POST /auth/challenge` - Request authentication challenge
- `POST /auth/verify` - Verify wallet signature

### Mailbox
- `GET /mailbox/:address` - List emails (paginated)
- `GET /mailbox/:address/:emailId` - Get email details
- `DELETE /mailbox/:address/:emailId` - Delete email

### Email (Paid Tier)
- `POST /mail/send` - Send email
- `GET /mail/sent` - List sent emails

### Forwarding (Paid Tier)
- `GET /forwarding/rules` - List forwarding rules
- `POST /forwarding/rules` - Create forwarding rule
- `DELETE /forwarding/rules/:id` - Delete rule

### Subscription
- `GET /subscription/status` - Check subscription
- `POST /subscription/create` - Create subscription

## Documentation

- [Product Requirements](specs/product-requirements.md)
- [Technical Architecture](specs/technical-architecture.md)
- [API Specification](specs/api-specification.md)
- [Cleanup Service](docs/cleanup-service.md)

## User Tiers

### Free Tier (Unregistered)
- Receive emails at blockchain addresses
- 30-day email retention
- No sending or forwarding

### Paid Tier (Registered)
- Unlimited email retention
- Send emails from derived addresses
- Email forwarding to external addresses
- Multi-address linking
- Priority support

## Security

- **Wallet-Only Auth**: No passwords, blockchain signatures only
- **Case Sensitivity**: Blockchain address case preserved
- **Nonce Protection**: Replay attack prevention with Redis
- **JWT Tokens**: Secure session management
- **Rate Limiting**: Per-address rate limits
- **SMTP Security**: SPF/DKIM/DMARC support

## Contributing

1. Follow the coding style (ESLint + Prettier)
2. Maintain 85% test coverage
3. Use conventional commits
4. Update documentation for changes

## License

MIT
