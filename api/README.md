# PubKeyMail API

Backend API for the PubKeyMail blockchain-based email service.

## Quick Start

```bash
# From workspace root
npm install
npm run dev:api

# Or from this directory
npm run dev
```

## Scripts

```bash
npm run dev          # Start dev server with in-memory storage
npm run dev:api      # Start dev server (requires env vars)
npm run build        # Build for production
npm run start        # Run production build
npm run test         # Run tests
npm run test:coverage # Run tests with coverage
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npm run migrate      # Run database migrations
npm run openapi:generate # Generate OpenAPI spec
```

## Structure

```
api/
├── src/
│   ├── api/            # HTTP layer (routes, middleware, OpenAPI)
│   ├── config/         # Configuration management
│   ├── database/       # PostgreSQL connection, queries, migrations
│   ├── services/       # Business logic
│   │   ├── auth/       # Wallet authentication, JWT
│   │   ├── blockchain/ # Solana, SNS resolution
│   │   ├── cache/      # Redis client, nonce store
│   │   ├── email/      # Ingestion, storage, cleanup
│   │   └── payment/    # Solana Pay
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Shared utilities
├── tests/              # Test files
└── scripts/            # Build and utility scripts
```

## Environment Variables

See `.env.example` in the repository root for required environment variables.
