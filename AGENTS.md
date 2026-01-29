# Agent Build Instructions - PubKeyMail

## Project Overview
PubKeyMail is a blockchain-based email service with wallet authentication. The tech stack will be chosen in Phase 1, but these instructions will be updated accordingly.

## Prerequisites
- Docker and Docker Compose (for PostgreSQL, Redis)
- Node.js 24+ (if using TypeScript/Node.js stack) OR Rust 1.70+ (if using Rust stack)
- Solana CLI tools (for blockchain integration)
- Git for version control

## Initial Setup (To be completed in Phase 1)
```bash
# Clone the repository (if applicable)
git clone <repo-url>
cd pubkeymail

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Start infrastructure (PostgreSQL, Redis)
docker-compose up -d

# Install dependencies
# For Node.js/TypeScript:
npm install
# For Rust:
cargo build

# Run database migrations
# (Migration commands to be added in Phase 1)
```

## Running Tests
```bash
# Run all tests
# For Node.js/TypeScript:
npm test

# For Rust:
cargo test

# Run with coverage (REQUIRED before marking features complete)
# For Node.js/TypeScript:
npm run test:coverage

# For Rust:
cargo tarpaulin --out Html

# Minimum coverage requirement: 85%
```

## Build Commands
```bash
# Development build
# For Node.js/TypeScript:
npm run build:dev

# For Rust:
cargo build

# Production build
# For Node.js/TypeScript:
npm run build

# For Rust:
cargo build --release
```

## Development Server
```bash
# Start development server with hot reload
# For Node.js/TypeScript:
npm run dev

# For Rust:
cargo watch -x run

# Access API at: http://localhost:3000 (or configured port)
```

## Database Management
```bash
# Run migrations
npm run migrate  # or cargo run --bin migrate

# Rollback migration
npm run migrate:rollback

# Reset database (WARNING: deletes all data)
npm run db:reset

# Seed test data
npm run db:seed
```

## Docker Commands
```bash
# Start all services (PostgreSQL, Redis, API)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Reset everything (including volumes)
docker-compose down -v
```

## Code Quality
```bash
# Linting
# For Node.js/TypeScript:
npm run lint
npm run lint:fix

# For Rust:
cargo clippy

# Formatting
# For Node.js/TypeScript:
npm run format

# For Rust:
cargo fmt

# Type checking (TypeScript only)
npm run type-check
```

## Project Structure

This is an npm workspace with two packages:
- `api/` - Backend API (Express, Node.js)
- `web/` - Frontend web app (Next.js)

### API Package (`api/`)
The API is a self-contained npm workspace package:
- `api/src/api/` - HTTP layer (Express app factory, routes, middleware, OpenAPI)
- `api/src/config/` - Configuration management
- `api/src/database/` - PostgreSQL connection, queries, migrations
- `api/src/services/` - Business logic (auth, blockchain, email, payment)
- `api/src/types/` - TypeScript type definitions
- `api/tests/` - Test files

Run API commands from root:
```bash
npm run dev:api    # Start API dev server
npm run test       # Run API tests
npm run migrate    # Run migrations
```

Or from the api directory:
```bash
cd api
npm run dev
npm run test
```

## Key Learnings
### Critical Implementation Notes
- **Case Sensitivity**: PostgreSQL database MUST use case-sensitive collation for address columns
  - Use `COLLATE "C"` or `COLLATE "POSIX"` in table definitions
  - Test case sensitivity thoroughly in all queries
- **Wallet Authentication**: Never store private keys, only verify signatures
  - Use Solana's `nacl.sign.detached.verify()` or equivalent
  - Generate unique nonces for each authentication challenge
- **Email Retention**: Cleanup job must be granular
  - Query pattern: `WHERE received_at < cutoff AND address NOT IN (registered_addresses)`
  - Never delete entire mailboxes if they contain recent emails
- **SNS Resolution**: Cache aggressively but with TTL
  - Default TTL: 1 hour for name resolutions
  - Store both name and resolved address in database

### Performance Optimizations
- Index all foreign keys and frequently queried columns
- Use pagination for all list endpoints (default: 50 items)
- Implement connection pooling (pg-pool or r2d2)
- Cache name service resolutions in Redis

### Common Gotchas
- Solana addresses are base58 encoded, not hex
- Ed25519 signatures are 64 bytes
- SMTP providers have rate limits - implement queuing early
- Test email deliverability thoroughly (SPF/DKIM/DMARC)

## Environment Variables
```bash
# Application
NODE_ENV=development
PORT=3000
DOMAIN=localhost

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/pubkeymail
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379

# Email
EMAIL_RETENTION_DAYS=30
SMTP_PROVIDER=sendgrid
SMTP_API_KEY=your-api-key
SMTP_WEBHOOK_SECRET=your-webhook-secret

# Blockchain
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet

# Authentication
JWT_SECRET=your-secret-key
SESSION_DURATION=86400

# Payments (add when implementing)

SOLANA_PAY_MERCHANT_WALLET=
```

## Useful Commands
```bash
# Check Solana CLI installation
solana --version

# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Test Redis connection
redis-cli ping

# Generate test wallet
solana-keygen new --outfile test-wallet.json

# Check email queue status (when implemented)
npm run queue:status

# Run cleanup job manually (when implemented)
npm run cleanup:emails
```

## Feature Development Quality Standards

**CRITICAL**: All new features MUST meet the following mandatory requirements before being considered complete.

### Testing Requirements

- **Minimum Coverage**: 85% code coverage ratio required for all new code
- **Test Pass Rate**: 100% - all tests must pass, no exceptions
- **Test Types Required**:
  - Unit tests for all business logic and services
  - Integration tests for API endpoints or main functionality
  - End-to-end tests for critical user workflows
- **Coverage Validation**: Run coverage reports before marking features complete:
  ```bash
  # Examples by language/framework
  npm run test:coverage
  pytest --cov=src tests/ --cov-report=term-missing
  cargo tarpaulin --out Html
  ```
- **Test Quality**: Tests must validate behavior, not just achieve coverage metrics
- **Test Documentation**: Complex test scenarios must include comments explaining the test strategy

### Git Workflow Requirements

Before moving to the next feature, ALL changes must be:

1. **Committed with Clear Messages**:
   ```bash
   git add .
   git commit -m "feat(module): descriptive message following conventional commits"
   ```
   - Use conventional commit format: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, etc.
   - Include scope when applicable: `feat(api):`, `fix(ui):`, `test(auth):`
   - Write descriptive messages that explain WHAT changed and WHY

2. **Pushed to Remote Repository**:
   ```bash
   git push origin <branch-name>
   ```
   - Never leave completed features uncommitted
   - Push regularly to maintain backup and enable collaboration
   - Ensure CI/CD pipelines pass before considering feature complete

3. **Branch Hygiene**:
   - Work on feature branches, never directly on `main`
   - Branch naming convention: `feature/<feature-name>`, `fix/<issue-name>`, `docs/<doc-update>`
   - Create pull requests for all significant changes

4. **Ralph Integration**:
   - Update .ralph/@fix_plan.md with new tasks before starting work
   - Mark items complete in .ralph/@fix_plan.md upon completion
   - Update .ralph/PROMPT.md if development patterns change
   - Test features work within Ralph's autonomous loop

### Documentation Requirements

**ALL implementation documentation MUST remain synchronized with the codebase**:

1. **Code Documentation**:
   - Language-appropriate documentation (JSDoc, docstrings, etc.)
   - Update inline comments when implementation changes
   - Remove outdated comments immediately

2. **Implementation Documentation**:
   - Update relevant sections in this AGENT.md file
   - Keep build and test commands current
   - Update configuration examples when defaults change
   - Document breaking changes prominently

3. **README Updates**:
   - Keep feature lists current
   - Update setup instructions when dependencies change
   - Maintain accurate command examples
   - Update version compatibility information

4. **AGENT.md Maintenance**:
   - Add new build patterns to relevant sections
   - Update "Key Learnings" with new insights
   - Keep command examples accurate and tested
   - Document new testing patterns or quality gates

### Feature Completion Checklist

Before marking ANY feature as complete, verify:

- [ ] All tests pass with appropriate framework command
- [ ] Code coverage meets 85% minimum threshold
- [ ] Coverage report reviewed for meaningful test quality
- [ ] Code formatted according to project standards
- [ ] Type checking passes (if applicable)
- [ ] All changes committed with conventional commit messages
- [ ] All commits pushed to remote repository
- [ ] .ralph/@fix_plan.md task marked as complete
- [ ] Implementation documentation updated
- [ ] Inline code comments updated or added
- [ ] .ralph/@AGENT.md updated (if new patterns introduced)
- [ ] Breaking changes documented
- [ ] Features tested within Ralph loop (if applicable)
- [ ] CI/CD pipeline passes

### Rationale

These standards ensure:
- **Quality**: High test coverage and pass rates prevent regressions
- **Traceability**: Git commits and .ralph/@fix_plan.md provide clear history of changes
- **Maintainability**: Current documentation reduces onboarding time and prevents knowledge loss
- **Collaboration**: Pushed changes enable team visibility and code review
- **Reliability**: Consistent quality gates maintain production stability
- **Automation**: Ralph integration ensures continuous development practices

**Enforcement**: AI agents should automatically apply these standards to all feature development tasks without requiring explicit instruction for each task.
