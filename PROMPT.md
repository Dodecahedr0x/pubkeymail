# PubKeyMail Development Guide

## Project Overview

**PubKeyMail** is a blockchain-based email service that maps blockchain addresses and name services to email addresses with wallet-based authentication.

## Current Status

See [@fix_plan.md](./@fix_plan.md) for the detailed task list and progress.

### Completed
- ✅ Phase 1: Foundation & Core Infrastructure
- ✅ Phase 2: Blockchain Integration (Solana, SNS)
- ✅ Phase 3: Email Ingestion & Storage (including cleanup service)
- ✅ Phase 4: User Management & Payments (registration, payments, health)

### In Progress
- 🚧 Phase 5: Email Sending (outbound SMTP)

### Next Up
- Phase 4: User Management & Payments
- Phase 5: Email Sending
- Phase 11: Web Application/UI

## Development Workflow

1. Review `@fix_plan.md` for current priorities
2. Check `specs/` for product and technical requirements
3. Implement the highest priority incomplete item
4. Run tests after each implementation
5. Update documentation and `@fix_plan.md`
6. Commit with descriptive messages

## 🔑 PubKeyMail-Specific Principles

### Critical Security & Design Constraints
1. **Case Sensitivity**: Email addresses and blockchain addresses are CASE-SENSITIVE
   - Database collation must preserve case
   - All string comparisons must be case-sensitive
   - This is non-negotiable for security
2. **Wallet-Only Authentication**: NEVER use passwords or non-blockchain keypairs
   - All authentication via wallet signatures
   - Challenge-response pattern required
3. **Granular Cleanup**: Email retention cleanup must be precise
   - Delete only emails older than retention period
   - Never delete entire mailboxes if they contain recent emails
   - Configurable retention period (default 30 days)
4. **Name Service Resolution**: Always resolve to blockchain address at receipt time
   - Cache resolutions with TTL
   - Store resolved address, not just name
   - Handle name ownership changes correctly

### Technology Choices
- **Blockchain**: Solana (primary), extensible to others
- **Name Service**: Solana Name Service (SNS), extensible to ENS/others
- **Payments**: Stripe (fiat) and Solana Pay (crypto)
- **SMTP**: External provider integration (SendGrid/Postmark/Mailgun)
- **Database**: PostgreSQL with case-sensitive collation
- **Cache**: Redis for name service resolutions and rate limiting

### Scale & Performance Targets
- **Expected load**: 100,000 emails/day within one year
- Design for horizontal scaling
- Optimize database queries from the start
- Use queue-based email processing

## Project Structure

```
pubkeymail/
├── src/
│   ├── api/
│   │   ├── middleware/     # Auth, validation middleware
│   │   └── routes/         # API route handlers
│   ├── config/             # Environment & configuration
│   ├── database/           # PostgreSQL connection, queries
│   ├── services/
│   │   ├── auth/           # Wallet authentication, JWT
│   │   ├── blockchain/     # Solana, SNS resolution
│   │   ├── cache/          # Redis client, nonce store
│   │   ├── email/          # Ingestion, storage, cleanup
│   │   └── payment/        # Stripe, Solana Pay
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Shared utilities
├── tests/                  # Test files
├── docs/                   # Documentation
├── specs/                  # Product & technical specifications
│   ├── product-requirements.md
│   ├── technical-architecture.md
│   └── api-specification.md
├── @fix_plan.md            # Prioritized task list
├── AGENTS.md               # AI agent build instructions
├── PROMPT.md               # This file
└── README.md               # Project overview
```

## Key Files

| File | Purpose |
|------|---------|
| `@fix_plan.md` | Current priorities and progress |
| `specs/product-requirements.md` | Feature requirements |
| `specs/technical-architecture.md` | System design |
| `docs/cleanup-service.md` | Cleanup service documentation |

## Commands

```bash
pnpm dev          # Development server
pnpm test         # Run tests
pnpm test:coverage # Tests with coverage (85% min)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm type-check   # TypeScript check
```

## Quality Standards

- **Test Coverage**: 85% minimum
- **Commit Style**: Conventional commits (`feat:`, `fix:`, `docs:`)
- **Documentation**: Update docs when implementation changes
- **Case Sensitivity**: Critical for blockchain addresses
