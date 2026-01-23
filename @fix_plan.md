# Ralph Fix Plan - PubKeyMail

## Phase 1: Foundation & Core Infrastructure (High Priority)

### Project Setup
- [x] Choose and setup tech stack (Node.js/TypeScript)
- [x] Initialize project structure (API, services, database)
- [x] Setup development environment (Docker, env configs)
- [x] Configure PostgreSQL database with case-sensitive collation
- [x] Setup Redis for caching (Redis client + nonce store implemented)
- [x] Initialize test framework (Vitest)

### Database Schema
- [x] Create blockchain_addresses table with case-sensitive indexing
- [x] Create users table with subscription management
- [x] Create address_links table for multi-address support
- [x] Create emails table with retention policy fields
- [x] Create sent_emails table
- [x] Create forwarding_rules table
- [x] Create name_resolutions cache table
- [x] Setup database migrations system (node-pg-migrate)

### Configuration Management
- [x] Define environment variables schema
- [x] Create config validation module
- [x] Setup configurable EMAIL_RETENTION_DAYS parameter
- [x] Configure SMTP provider settings
- [x] Setup blockchain RPC endpoints config

## Phase 2: Blockchain Integration (High Priority)

### Solana Integration
- [x] Setup Solana Web3.js SDK integration
- [x] Implement Solana Name Service (SNS) resolution
- [x] Create blockchain signature verification service
- [x] Implement address validation for Solana addresses
- [x] Add SNS caching layer with TTL (in database)
- [x] Create blockchain provider abstraction interface
- [x] Write tests for SNS resolution

### Authentication Service
- [x] Implement challenge-response authentication
- [x] Create unique nonce generation
- [x] Implement signature verification (Solana Ed25519)
- [x] Build JWT/session token issuance
- [x] Create authentication middleware
- [x] Add session management and expiration
- [x] Write authentication tests (unit)
- [x] Implement Redis-backed nonce storage (COMPLETED THIS LOOP)

## Phase 3: Email Core Functionality (High Priority)

### Email Ingestion
- [x] Choose SMTP provider (Multi-provider support: SendGrid/Postmark/Mailgun)
- [x] Setup inbound email webhook endpoint
- [x] Implement case-sensitive email parsing
- [x] Create address resolution pipeline
- [x] Build email storage service
- [x] Implement retention policy tagging
- [x] Add email validation and sanitization
- [x] Write email ingestion tests

### Email Storage & Retrieval
- [x] Implement mailbox query API
- [x] Create pagination for email lists
- [x] Build email detail retrieval
- [x] Add support for HTML and plain text emails
- [x] Implement attachment handling
- [x] Create efficient database queries with indexes
- [x] Write storage and retrieval tests

### Email Cleanup Service
- [x] Create scheduled cleanup job (cron/scheduler)
- [x] Implement granular cleanup logic (30-day threshold)
- [x] Add safety checks (don't delete entire mailboxes)
- [x] Create cleanup monitoring and logging
- [x] Test cleanup logic thoroughly
- [ ] Setup cleanup metrics and alerts (monitoring integration pending)

## Phase 4: User Management & Payments (High Priority)

### User Registration
- [x] Create user registration flow
- [x] Implement wallet-based signup
- [x] Build subscription tier management
- [x] Add user profile storage
- [x] Create user status tracking (free/paid)
- [x] Write user management tests

### Payment Integration
- [x] Setup Stripe integration for fiat payments
- [x] Implement Stripe webhook handling
- [x] Create Solana Pay integration
- [x] Build payment verification service
- [x] Implement automatic tier upgrades on payment
- [x] Add subscription expiration handling
- [ ] Create payment reconciliation system (pending production setup)
- [x] Write payment integration tests

### Tier Management
- [x] Implement tier-based feature gating
- [x] Update retention policy on tier upgrade
- [x] Build subscription status API
- [x] Add grace period handling
- [x] Create tier migration logic
- [x] Write tier management tests

## Phase 5: Email Sending (Medium Priority)

### Outbound Email
- [x] Setup SMTP provider for outbound (SendGrid API/Postmark)
- [x] Implement email composition API
- [x] Create "From" address selector
- [x] Build recipient verification system
- [x] Add email sending rate limiting
- [x] Implement sent email storage
- [x] Add delivery status tracking
- [x] Write email sending tests

### SPF/DKIM/DMARC Setup
- [ ] Configure DNS records for email domain
- [ ] Setup SPF records
- [ ] Configure DKIM signing
- [ ] Implement DMARC policy
- [ ] Test email deliverability
- [ ] Document DNS configuration

## Phase 6: Advanced Features (Medium Priority)

### Email Forwarding
- [x] Create forwarding rules API
- [x] Implement rule storage and retrieval
- [x] Build forwarding execution service
- [x] Add filter conditions support (optional)
- [x] Implement forwarding status tracking
- [x] Add forwarding error handling
- [x] Write forwarding tests

### Multi-Address Linking
- [x] Create address linking API
- [x] Implement secondary address verification
- [x] Build unified mailbox view
- [x] Add address unlinking functionality
- [ ] Create linked address management UI (web app)
- [x] Write address linking tests

### Mailbox Merging
- [x] Implement merged mailbox query logic
- [x] Create mailbox grouping API
- [x] Build address selection for merged view
- [ ] Add filtering by source address
- [x] Write mailbox merging tests

## Phase 7: Security & Compliance (Medium Priority)

### Security Hardening
- [ ] Implement rate limiting per address
- [ ] Add email size and attachment limits
- [ ] Setup spam filtering integration
- [ ] Implement CAPTCHA for sending
- [ ] Add brute force protection
- [ ] Create security audit logging
- [ ] Write security tests

### Compliance
- [ ] Draft Privacy Policy
- [ ] Create Terms of Service
- [ ] Implement GDPR compliance features
- [ ] Build user data deletion API
- [ ] Add data export functionality
- [ ] Create compliance documentation
- [ ] Setup email retention disclosure

## Phase 8: Encryption (Optional Feature)

### Optional Email Encryption
- [ ] Design encryption key management
- [ ] Implement public key encryption using blockchain keys
- [ ] Create encryption toggle in UI
- [ ] Build encrypted email storage
- [ ] Implement decryption on retrieval
- [ ] Add encryption status indicators
- [ ] Write encryption tests

## Phase 9: Performance & Scalability (Low Priority)

### Optimization
- [ ] Implement database query optimization
- [ ] Add database connection pooling
- [ ] Setup read replicas for queries
- [x] Implement caching strategy (Redis - nonce storage complete)
- [ ] Create email processing queue
- [ ] Add horizontal scaling support
- [ ] Run load testing (100k emails/day)
- [ ] Optimize SNS resolution caching

### Monitoring & Observability
- [ ] Setup structured logging
- [ ] Implement metrics collection
- [ ] Create monitoring dashboards
- [ ] Setup error tracking (Sentry)
- [ ] Add alerting for critical failures
- [ ] Create health check endpoints
- [ ] Document monitoring setup

## Phase 10: Future Extensibility (Low Priority)

### Multi-Blockchain Support
- [x] Create blockchain provider interface
- [ ] Implement Ethereum integration
- [ ] Add ENS (Ethereum Name Service) support
- [ ] Build chain-agnostic address handling
- [ ] Test multi-chain scenarios
- [ ] Document blockchain extension guide

### Additional Features
- [ ] Email threading and conversations
- [ ] Advanced forwarding filters
- [ ] Spam blocking and allowlists
- [ ] Mobile app API support
- [ ] Email templates
- [ ] Attachment preview
- [ ] Search functionality

## Phase 11: Web Application & UI (Medium Priority)

### Framework Setup
- [x] Choose frontend framework (Next.js/SvelteKit/Remix recommended)
- [x] Setup project structure with TypeScript
- [x] Configure build tooling and dev server
- [x] Setup CSS framework (vanilla CSS with CSS variables)
- [x] Configure API client for backend communication
- [x] Setup state management (React Context)

### Authentication UI
- [x] Create wallet connection component (Solana wallet adapter)
- [x] Implement wallet selection modal
- [x] Build signature request flow
- [x] Create session management (JWT storage)
- [x] Implement logout functionality
- [x] Add wallet address display component

### Mailbox UI
- [x] Create mailbox layout (sidebar + content)
- [x] Build email list component with pagination
- [x] Implement email detail view
- [x] Add loading states and skeletons
- [x] Create empty state for new mailboxes
- [ ] Implement email deletion with confirmation
- [ ] Add pull-to-refresh / auto-refresh

### Email Composition (Paid Tier)
- [x] Create email compose modal/page
- [x] Implement "From" address selector
- [x] Build recipient input with validation
- [ ] Create rich text editor for email body
- [ ] Add attachment upload support
- [x] Implement send functionality
- [x] Create sent emails view

### Settings & Account
- [x] Create settings page layout
- [x] Build subscription status display
- [x] Implement upgrade/payment flow UI
- [ ] Create forwarding rules management
- [ ] Build multi-address linking UI
- [ ] Add address verification flow

### Responsive Design
- [x] Mobile-first responsive layout
- [ ] Touch-friendly interactions
- [ ] Mobile navigation (hamburger menu)
- [x] Optimize for tablet viewports

### Accessibility & UX
- [ ] Keyboard navigation support
- [ ] Screen reader compatibility (ARIA)
- [ ] Focus management
- [x] Loading and error states
- [ ] Toast notifications
- [x] Dark mode support (built-in dark theme)

## Completed
- [x] Project initialization
- [x] Requirements documentation
- [x] Technical architecture design
- [x] Complete Phase 1 (Foundation & Core Infrastructure) - except migrations
- [x] Complete Phase 2 (Blockchain Integration)
- [x] Complete Phase 3 Email Ingestion & Storage - except cleanup service
- [x] Redis-backed nonce storage for authentication

## Recent Completions
- ✅ Payment Service with Stripe and Solana Pay integration
- ✅ Payment API routes (checkout, webhooks, verify, cancel)
- ✅ Health check endpoints (/health, /health/ready, /health/live)
- ✅ Database, Redis, and scheduler health monitoring
- ✅ Payment service tests (14 tests)
- ✅ Database migrations system with node-pg-migrate
- ✅ User registration service with wallet-based signup
- ✅ Subscription tier management (free/paid)
- ✅ Multi-address linking with verification
- ✅ User API routes (register, profile, link/unlink)
- ✅ Comprehensive user service tests (14 tests)
- ✅ Email Cleanup Service with scheduled cron jobs (node-cron)
- ✅ Granular cleanup logic with batch processing and safety thresholds
- ✅ Cleanup scheduler with health checks and manual trigger support
- ✅ Comprehensive test coverage for cleanup service (95%+)
- ✅ Fixed TypeScript errors across codebase
- ✅ Fixed test environment setup for all tests
- ✅ Redis client with singleton pattern and auto-reconnection
- ✅ Redis nonce store with automatic TTL expiration
- ✅ AuthService integrated with Redis backend
- ✅ Multi-provider SMTP webhook support
- ✅ Email ingestion and storage pipeline
- ✅ Mailbox query API with pagination
- ✅ Main Application Entry Point with all routes wired
- ✅ Email Sender Service with rate limiting
- ✅ Tier Service with feature gating and grace periods
- ✅ Tier middleware for API route protection
- ✅ Tier service tests (33 tests)
- ✅ Email sender service tests (13 tests)
- ✅ Recipient verification service with internal/external handling
- ✅ Next.js 14 web app with Solana wallet authentication
- ✅ API client for all backend endpoints (auth, users, emails, payments)
- ✅ Landing page with wallet connect button
- ✅ Mailbox UI with inbox, sent emails, email detail views
- ✅ Email compose page (paid tier gated)
- ✅ Settings and upgrade pages with Stripe checkout

## Next Priority Tasks

### Immediate (Next Loop)
1. ✅ **Email Sending** - Outbound SMTP functionality (COMPLETED)
   - Setup SMTP provider for outbound (SendGrid/Postmark)
   - Implement email composition API
   - Add delivery status tracking
   - Create "From" address selector

2. ✅ **Tier-based Feature Gating** - Restrict features by subscription (COMPLETED)
   - Gate email sending to paid tier
   - Enforce rate limits by tier
   - Add tier checks to API middleware

3. ✅ **Main Application Entry Point** - Wire everything together (COMPLETED)
   - Create Express app with all routes
   - Add CORS and security middleware
   - Setup graceful shutdown

### Soon
4. **Web App Setup** - Frontend framework, wallet connection UI
5. **SPF/DKIM/DMARC Setup** - Email deliverability
6. **Advanced forwarding filters** - Enhanced filtering options

## Notes
- **Case Sensitivity**: Critical throughout - addresses are case-sensitive
- **30-Day Rule**: Cleanup must be granular, not bulk mailbox deletion
- **Wallet Auth**: Never rely on non-blockchain keypairs
- **Scale Target**: 100k emails/day within one year
- **Testing**: Maintain 85% code coverage minimum
- **Git Workflow**: Commit after each completed feature
- Focus on MVP: Phases 1-4 are critical path
- Security-first: Implement auth and validation early
- Update this file after each milestone

## Implementation Quality Notes
- ✅ All blockchain addresses use case-sensitive collation (C)
- ✅ Signature verification using TweetNaCl (Ed25519)
- ✅ JWT tokens with configurable expiration
- ✅ Redis integration with automatic TTL
- ✅ Multi-provider SMTP webhook support
- ✅ Comprehensive type safety with TypeScript strict mode
- ⚠️ HTML sanitization uses regex (needs DOMPurify for production)
- ⚠️ Webhook signature verification is placeholder (needs HMAC implementation)
- ⚠️ Database migrations not yet implemented (using init.sql directly)
