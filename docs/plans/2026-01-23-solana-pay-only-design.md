# Solana Pay Only - Payment System Design

## Overview

Replace Stripe with Solana Pay using USDC for subscription payments. Users pay directly from their connected wallet.

## Pricing

- **Monthly**: $2 USDC
- **Yearly**: $15 USDC

## Payment Flow

1. User clicks "Subscribe" → selects Monthly ($2) or Yearly ($15)
2. Backend creates payment request with unique reference (stored in DB)
3. Frontend builds Solana transaction: USDC transfer to merchant wallet with memo
4. User approves in connected wallet → transaction submitted
5. Backend polls/verifies transaction confirmation using the reference
6. On confirmation: verify amount, upgrade user to paid tier

## Implementation

### Backend Changes

**1. Update Pricing**
- File: `src/services/payment/payment-service.ts`
- Change `PRICING` to `{ monthly: 2, yearly: 15 }` (USDC only)

**2. Remove Stripe**
- Remove all Stripe-related code from `payment-service.ts`
- Remove Stripe routes from `payment-routes.ts`
- Remove Stripe config from `src/config/index.ts`

**3. Database Schema**
```sql
CREATE TABLE payment_requests (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(64) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan VARCHAR(20) NOT NULL, -- 'monthly' | 'yearly'
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | confirmed | expired | failed
  signature VARCHAR(128), -- transaction signature once confirmed
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP
);
```

**4. New Endpoints**
- `POST /api/v1/payments/solana-pay/create` - Create payment request
- `POST /api/v1/payments/solana-pay/verify` - Verify transaction
- `GET /api/v1/payments/solana-pay/status/:reference` - Check payment status

**5. Transaction Verification**
- Use `@solana/web3.js` to fetch transaction by signature
- Verify: recipient matches merchant wallet, amount matches, memo contains reference
- Update user subscription on successful verification

### Frontend Changes

**1. Remove Stripe**
- Remove `createStripeCheckout` from `web/lib/api/payments.ts`
- Remove any Stripe UI components

**2. Payment UI**
- Plan selection (Monthly $2 / Yearly $15)
- "Pay with USDC" button
- Transaction status indicator (pending → confirming → success)

**3. Transaction Building**
- Use `@solana/pay` or manual SPL token transfer
- USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet)
- Include memo with payment reference

### Config Changes

**Keep:**
- `SOLANA_PAY_MERCHANT_WALLET` - USDC receiving address
- `SOLANA_RPC_ENDPOINT` - for transaction verification

**Remove:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_MONTHLY`
- `STRIPE_PRICE_ID_YEARLY`

## Security Considerations

- Generate cryptographically random references (32 bytes)
- Verify transaction on-chain before upgrading user
- Set payment request expiry (30 minutes)
- Validate amount matches expected price exactly
- Store transaction signature for audit trail

## Testing

- Unit tests for payment service
- Integration tests for payment flow
- Test with devnet USDC before mainnet
