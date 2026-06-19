# PubKeyMail - API Specification

## API Design Principles

1. **RESTful Design**: Use standard HTTP methods and status codes
2. **Case Sensitivity**: All blockchain addresses are case-sensitive
3. **Authentication**: JWT tokens issued after wallet signature verification
4. **Versioning**: API version in URL path (e.g., `/api/v1/`)
5. **Rate Limiting**: Per-user and per-IP rate limits
6. **Pagination**: All list endpoints support pagination
7. **Error Handling**: Consistent error response format

## Base URL
```
Development: http://localhost:3000/api/v1
Production: https://api.yourdomain.tld/api/v1
```

## Authentication Flow

### 1. Request Authentication Challenge
```http
POST /auth/challenge
Content-Type: application/json

{
  "address": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
  "blockchain": "solana"
}
```

**Response:**
```json
{
  "challenge": "Sign this message to authenticate: 1234567890abcdef",
  "nonce": "1234567890abcdef",
  "expiresAt": "2024-01-01T12:00:00Z"
}
```

### 2. Verify Signature
```http
POST /auth/verify
Content-Type: application/json

{
  "address": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
  "blockchain": "solana",
  "signature": "base64-encoded-signature",
  "nonce": "1234567890abcdef"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "expiresIn": 86400,
  "user": {
    "address": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
    "subscriptionStatus": "active",
    "subscriptionTier": "paid",
    "linkedAddresses": 3
  }
}
```

## Mailbox Endpoints

### Get Mailbox
```http
GET /mailbox/:address
Authorization: Bearer {token}
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 50, max: 100)
  - folder: string (inbox|sent|all) (default: inbox)
  - sortBy: string (received_at|sender|subject) (default: received_at)
  - sortOrder: string (asc|desc) (default: desc)
```

**Response:**
```json
{
  "address": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
  "emails": [
    {
      "id": "email-uuid",
      "recipientEmail": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
      "senderAddress": "sender@example.com",
      "subject": "Welcome to PubKeyMail",
      "preview": "First 150 characters of email body...",
      "receivedAt": "2024-01-01T10:30:00Z",
      "isEncrypted": false,
      "hasAttachments": true,
      "attachmentCount": 2,
      "expiresAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 123,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Get Single Email
```http
GET /emails/:emailId
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "email-uuid",
  "recipientEmail": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
  "recipientAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
  "senderAddress": "sender@example.com",
  "subject": "Welcome to PubKeyMail",
  "bodyText": "Plain text body...",
  "bodyHtml": "<html>HTML body...</html>",
  "headers": {
    "message-id": "<message-id@example.com>",
    "date": "Mon, 01 Jan 2024 10:30:00 +0000"
  },
  "attachments": [
    {
      "filename": "document.pdf",
      "contentType": "application/pdf",
      "size": 102400,
      "url": "/emails/email-uuid/attachments/attachment-uuid"
    }
  ],
  "receivedAt": "2024-01-01T10:30:00Z",
  "isEncrypted": false,
  "expiresAt": null
}
```

### Get Merged Mailbox (Multiple Addresses)
```http
GET /mailbox/merged
Authorization: Bearer {token}
Query Parameters:
  - addresses: comma-separated list of addresses
  - page: number (default: 1)
  - limit: number (default: 50, max: 100)
```

**Response:** Same as Get Mailbox, but emails from all specified addresses

## Email Sending Endpoints

### Send Email
```http
POST /emails/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "from": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
  "to": "recipient@example.com",
  "subject": "Test Email",
  "bodyText": "Plain text body",
  "bodyHtml": "<html>HTML body</html>",
  "attachments": [
    {
      "filename": "document.pdf",
      "content": "base64-encoded-content",
      "contentType": "application/pdf"
    }
  ],
  "encrypt": false
}
```

**Response:**
```json
{
  "id": "sent-email-uuid",
  "status": "sent",
  "messageId": "<message-id@yourdomain.tld>",
  "sentAt": "2024-01-01T10:30:00Z"
}
```

### Get User's Derived Addresses
```http
GET /addresses/mine
Authorization: Bearer {token}
```

**Response:**
```json
{
  "addresses": [
    {
      "email": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
      "blockchainAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
      "blockchain": "solana",
      "isPrimary": true,
      "verifiedAt": "2024-01-01T10:00:00Z"
    },
    {
      "email": "mydomain.sol@yourdomain.tld",
      "blockchainAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
      "blockchain": "solana",
      "nameService": "SNS",
      "nameServiceName": "mydomain.sol",
      "isPrimary": false,
      "verifiedAt": "2024-01-01T11:00:00Z"
    }
  ]
}
```

## Address Management Endpoints

### Link Additional Address
```http
POST /addresses/link
Authorization: Bearer {token}
Content-Type: application/json

{
  "address": "AnotherSolanaAddress123456789",
  "blockchain": "solana",
  "signature": "base64-encoded-signature",
  "nonce": "verification-nonce"
}
```

**Response:**
```json
{
  "address": "AnotherSolanaAddress123456789",
  "blockchain": "solana",
  "linkedAt": "2024-01-01T10:30:00Z",
  "status": "verified"
}
```

### Unlink Address
```http
DELETE /addresses/:address
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "Address unlinked successfully",
  "address": "AnotherSolanaAddress123456789"
}
```

## Forwarding Endpoints

### Get Forwarding Rules
```http
GET /forwarding/rules
Authorization: Bearer {token}
```

**Response:**
```json
{
  "rules": [
    {
      "id": "rule-uuid",
      "sourceAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
      "destinationEmail": "myemail@gmail.com",
      "enabled": true,
      "filters": {
        "senderDomain": "example.com",
        "subjectContains": "important"
      },
      "createdAt": "2024-01-01T10:00:00Z"
    }
  ]
}
```

### Create Forwarding Rule
```http
POST /forwarding/rules
Authorization: Bearer {token}
Content-Type: application/json

{
  "sourceAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
  "destinationEmail": "myemail@gmail.com",
  "filters": {
    "senderDomain": "example.com",
    "subjectContains": "important"
  },
  "enabled": true
}
```

**Response:**
```json
{
  "id": "rule-uuid",
  "sourceAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
  "destinationEmail": "myemail@gmail.com",
  "verificationRequired": true,
  "verificationEmailSent": true,
  "message": "Please verify the destination email address"
}
```

### Update Forwarding Rule
```http
PUT /forwarding/rules/:ruleId
Authorization: Bearer {token}
Content-Type: application/json

{
  "enabled": false,
  "filters": {
    "senderDomain": "newdomain.com"
  }
}
```

**Response:**
```json
{
  "id": "rule-uuid",
  "updated": true,
  "updatedAt": "2024-01-01T10:30:00Z"
}
```

### Delete Forwarding Rule
```http
DELETE /forwarding/rules/:ruleId
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "Forwarding rule deleted successfully",
  "id": "rule-uuid"
}
```

### Verify Forwarding Destination
```http
POST /forwarding/verify
Content-Type: application/json

{
  "token": "verification-token-from-email"
}
```

**Response:**
```json
{
  "message": "Email verified successfully",
  "destinationEmail": "myemail@gmail.com",
  "ruleId": "rule-uuid",
  "enabled": true
}
```

## Subscription Endpoints

### Get Subscription Status
```http
GET /subscription/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "tier": "paid",
  "status": "active",
  "paymentProvider": "stripe",
  "currentPeriodStart": "2024-01-01T00:00:00Z",
  "currentPeriodEnd": "2024-02-01T00:00:00Z",
  "cancelAtPeriodEnd": false,
  "features": {
    "unlimitedStorage": true,
    "emailForwarding": true,
    "emailSending": true,
    "multipleAddresses": true
  }
}
```

### Create Subscription (Stripe)
```http
POST /subscription/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "provider": "stripe",
  "plan": "monthly",
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

**Response:**
```json
{
  "provider": "stripe",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

### Create Subscription (Solana Pay)
```http
POST /subscription/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "provider": "solana_pay",
  "plan": "monthly"
}
```

**Response:**
```json
{
  "provider": "solana_pay",
  "paymentRequest": "solana:...",
  "amount": 10.00,
  "token": "USDC",
  "recipient": "MerchantWalletAddress",
  "reference": "payment-reference-uuid",
  "qrCode": "data:image/png;base64,..."
}
```

### Cancel Subscription
```http
POST /subscription/cancel
Authorization: Bearer {token}
Content-Type: application/json

{
  "cancelAtPeriodEnd": true
}
```

**Response:**
```json
{
  "message": "Subscription will be cancelled at period end",
  "cancelAt": "2024-02-01T00:00:00Z"
}
```

## Webhook Endpoints (SMTP Provider)

### Inbound Email Webhook
```http
POST /webhooks/inbound
Content-Type: application/json
X-Webhook-Signature: provider-signature

{
  "to": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld",
  "from": "sender@example.com",
  "subject": "Test Email",
  "bodyText": "Plain text body",
  "bodyHtml": "<html>HTML body</html>",
  "headers": {...},
  "attachments": [...]
}
```

**Response:**
```json
{
  "received": true,
  "emailId": "email-uuid"
}
```

### Payment Webhook (Stripe)
```http
POST /webhooks/stripe
Content-Type: application/json
Stripe-Signature: signature

{
  "type": "checkout.session.completed",
  "data": {...}
}
```

**Response:**
```json
{
  "received": true
}
```

## Utility Endpoints

### Resolve Name Service
```http
GET /resolve/:name
Query Parameters:
  - blockchain: string (solana|ethereum) (default: solana)
```

**Response:**
```json
{
  "name": "mydomain.sol",
  "blockchain": "solana",
  "nameService": "SNS",
  "resolvedAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
  "resolvedAt": "2024-01-01T10:30:00Z",
  "ttl": 3600
}
```

### Validate Address
```http
POST /validate/address
Content-Type: application/json

{
  "address": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
  "blockchain": "solana"
}
```

**Response:**
```json
{
  "valid": true,
  "blockchain": "solana",
  "type": "address"
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "up",
    "redis": "up",
    "smtp": "up",
    "blockchain": "up"
  },
  "timestamp": "2024-01-01T10:30:00Z"
}
```

## Error Response Format

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### Common Error Codes

- `INVALID_SIGNATURE`: Wallet signature verification failed
- `INVALID_ADDRESS`: Blockchain address format is invalid
- `UNAUTHORIZED`: Authentication required or token invalid
- `FORBIDDEN`: User doesn't have permission
- `NOT_FOUND`: Resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `SUBSCRIPTION_REQUIRED`: Feature requires paid subscription
- `EMAIL_TOO_LARGE`: Email exceeds size limit
- `INVALID_RECIPIENT`: Recipient email address is invalid
- `NAME_RESOLUTION_FAILED`: Could not resolve name service
- `DATABASE_ERROR`: Internal database error
- `SMTP_ERROR`: Email sending failed

## Rate Limits

- **Authentication**: 10 requests per minute per IP
- **Mailbox Access**: 100 requests per minute per user
- **Email Sending**: 50 emails per hour for free tier, 500 per hour for paid tier
- **API General**: 1000 requests per hour per user

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Pagination

All list endpoints support pagination with these query parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)

Response includes pagination metadata:
```json
{
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 123,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Case Sensitivity

**CRITICAL**: All email addresses and blockchain addresses are case-sensitive.

- `GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@yourdomain.tld`
- `gna9e2dwp8e2fg23prjoicvjm5cbzomm94yzoTPCrh7a@yourdomain.tld`

These are treated as **different addresses** and will route to different mailboxes.
