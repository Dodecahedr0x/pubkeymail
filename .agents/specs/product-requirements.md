# PubKeyMail - Blockchain-Based Email Service

## Product Overview

PubKeyMail is an email service where addresses are derived from blockchain addresses and name services (e.g., a full address and its .eth name resolve to the same mailbox). The service allows emails to be stored, accessed by keypair owners, and optionally redirected to external email addresses.

## Core Concepts

### Address Resolution
- Email addresses are derived from blockchain addresses and name services
- Example formats:
  - Direct address: `GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld`
  - Name service: `vitalik.eth@yourdomain.tld`
- Multiple derived addresses can resolve to the same underlying blockchain address
- Emails resolve to the actual blockchain address at the time of receipt
- Name service ownership changes don't affect previously received emails

### Case Sensitivity
- **Emails are case-sensitive** because blockchain addresses are case-sensitive
- This is a critical security and routing requirement

### Initial Focus
- **Primary blockchain**: Solana
- **Primary name service**: Solana Name Service (SNS)
- **Architecture**: Extensible to support additional blockchains and name services

## User Tiers

### Unregistered Users (Free Tier)
- Can receive emails at derived addresses
- Emails stored for **30 days maximum** (configurable)
- After 30 days, emails are automatically deleted if user never logged in
- **Important**: Only delete emails older than 30 days; don't clean entire mailboxes if they contain emails less than 30 days old
- Cannot setup email forwarding
- Cannot send emails from derived addresses

### Registered Users (Paid Tier)
- **Subscription payment**: Via Stripe or crypto (Solana Pay)
- Emails kept **indefinitely**
- Can setup email redirections to external addresses
- Can send emails using derived addresses
- Can combine multiple blockchain addresses/name services to point to same inbox
- Can configure forwarding filters

## Core Features

### 1. Email Reception
- Accept emails to any derived address (blockchain address or name service)
- Store emails for unregistered users (30-day retention)
- Store emails indefinitely for registered users
- Resolve name services to blockchain addresses at time of receipt
- Support SMTP inbound through provider integration

### 2. Authentication & Access
- **Wallet-based authentication required** to access emails
- Users must sign with their blockchain keypair to prove ownership
- **Never rely on any keypair other than the blockchain one**
- No traditional password-based authentication

### 3. Email Storage
- Each blockchain address has its own mailbox by default
- Users can merge multiple mailboxes in the UI for easier browsing
- Case-sensitive email routing and storage
- Automatic cleanup of 30+ day old emails for unregistered addresses

### 4. Email Sending
- Registered users can send emails from their derived addresses
- Address selector UI to choose which derived address to send from
- Support SMTP outbound through provider integration
- **Recipient verification required** before sending

### 5. Email Forwarding
- Registered users can setup redirections to external email addresses
- Support forwarding filters (nice-to-have feature)
- Configure which derived addresses forward to which external addresses

### 6. Encryption (Optional)
- **Encryption is optional**, not default
- Users can encrypt emails for recipients using their public key
- Default mode: unencrypted emails
- Encryption should leverage blockchain keypairs

### 7. Multi-Address Management
- Users can link multiple blockchain addresses to single account
- Users can link multiple name service addresses to single account
- All linked addresses deliver to unified inbox
- UI supports merged mailbox view

## Technical Requirements

### Blockchain Integration
- **Primary**: Solana blockchain integration
- Solana Name Service (SNS) resolution
- Extensible architecture for future blockchains (Ethereum, etc.)
- Extensible architecture for future name services (ENS, etc.)

### Email Infrastructure
- **Inbound SMTP**: Rely on third-party provider
- **Outbound SMTP**: Rely on third-party provider
- Address validation and routing
- Case-sensitive email handling

### Storage & Cleanup
- Configurable retention period (default: 30 days)
- Automatic cleanup job for expired unregistered user emails
- Granular cleanup: only delete emails older than retention period
- Never delete entire mailboxes if any email is within retention period

### Payment Processing
- **Stripe integration** for fiat payments
- **Solana Pay integration** for crypto payments
- Subscription management
- Payment verification before tier upgrade

### Compliance & Security
- Recipient verification system
- Email authenticity verification
- SPF/DKIM/DMARC support
- Data privacy compliance (GDPR, etc.)
- Secure wallet authentication
- Rate limiting and abuse prevention

### Scale Requirements
- Expected load: **100,000 emails per day within one year**
- Architecture must support horizontal scaling
- Database optimization for mailbox queries
- Efficient blockchain address resolution

## Configuration Parameters

The following should be configurable:
- `EMAIL_RETENTION_DAYS`: Retention period for unregistered users (default: 30)
- `DOMAIN`: Service domain for email addresses
- `MAX_MAILBOX_SIZE`: Storage limits per user tier
- `SMTP_PROVIDER_CONFIG`: Inbound/outbound SMTP settings
- `BLOCKCHAIN_RPC_ENDPOINTS`: Solana and future blockchain RPCs
- `NAME_SERVICE_RESOLVERS`: SNS and future name service resolvers

## User Workflows

### Workflow 1: Unregistered User Receives Email
1. Email sent to `{address}@yourdomain.tld`
2. System resolves blockchain address (if name service used)
3. Email stored in address-specific mailbox
4. 30-day retention timer starts
5. User can access later via wallet authentication

### Workflow 2: User Registration
1. User connects wallet to authenticate
2. User selects payment method (Stripe or Solana Pay)
3. User completes payment
4. Account upgraded to registered tier
5. All pending emails (within 30 days) preserved indefinitely
6. User can now setup forwarding and sending

### Workflow 3: Sending Email
1. Registered user authenticates with wallet
2. User composes email in UI
3. User selects "From" address from their derived addresses
4. System verifies recipient
5. Email sent via SMTP provider
6. Email stored in "Sent" folder

### Workflow 4: Email Forwarding
1. Registered user configures forwarding rules
2. User specifies external email address
3. User optionally configures filters
4. Incoming emails automatically forwarded based on rules
5. Original stored in mailbox

### Workflow 5: Multi-Address Linking
1. User authenticates with primary wallet
2. User adds secondary blockchain address
3. User signs with secondary wallet to prove ownership
4. System links addresses to same account
5. Both addresses deliver to unified inbox

## Nice-to-Have Features
- Forwarding filters (filter by sender, subject, etc.)
- Email threading and conversation view
- Attachment support with size limits
- Mobile app for wallet authentication
- Browser extension for quick access
- Email templates for common responses
- Spam filtering and blocking

## Future Extensibility
- Support for Ethereum and ENS
- Support for other EVM chains
- Support for other name services (Unstoppable Domains, etc.)
- Advanced encryption schemes (PGP-style with blockchain keys)
- Decentralized storage options (IPFS, Arweave)
- DAO governance for service parameters
