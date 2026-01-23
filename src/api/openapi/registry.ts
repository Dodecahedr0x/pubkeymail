/**
 * OpenAPI Registry
 * Central registry for all Zod schemas used in API routes
 */

import { z } from 'zod';
import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ============================================================================
// Common Schemas
// ============================================================================

export const BlockchainType = registry.register(
  'BlockchainType',
  z.enum(['solana', 'ethereum', 'polygon']).default('solana').openapi({
    description: 'Supported blockchain type',
  })
);

export const SubscriptionPlan = registry.register(
  'SubscriptionPlan',
  z.enum(['monthly', 'yearly']).openapi({
    description: 'Subscription plan type',
  })
);

export const SubscriptionTier = registry.register(
  'SubscriptionTier',
  z.enum(['free', 'paid']).openapi({
    description: 'User subscription tier',
  })
);

export const SubscriptionStatus = registry.register(
  'SubscriptionStatus',
  z.enum(['inactive', 'active', 'cancelled', 'expired']).openapi({
    description: 'Subscription status',
  })
);

export const DeliveryStatus = registry.register(
  'DeliveryStatus',
  z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced']).openapi({
    description: 'Email delivery status',
  })
);

export const ErrorSchema = registry.register(
  'Error',
  z.object({
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string().openapi({ example: 'Invalid request parameters' }),
      details: z.array(z.unknown()).optional(),
    }),
  })
);

// ============================================================================
// Auth Schemas
// ============================================================================

export const ChallengeRequestSchema = registry.register(
  'ChallengeRequest',
  z.object({
    address: z.string().min(1, 'Address is required').openapi({
      example: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A',
      description: 'Blockchain wallet address',
    }),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
  })
);

export const ChallengeResponseSchema = registry.register(
  'ChallengeResponse',
  z.object({
    challenge: z.string().openapi({
      example: 'Sign this message to authenticate with PubKeyMail: abc123...',
      description: 'Message to sign with wallet',
    }),
    nonce: z.string().openapi({
      example: 'abc123def456',
      description: 'Unique nonce for this challenge',
    }),
    expiresAt: z.string().datetime().openapi({
      example: '2024-01-01T12:05:00Z',
    }),
  })
);

export const VerifyRequestSchema = registry.register(
  'VerifyRequest',
  z.object({
    address: z.string().min(1, 'Address is required').openapi({
      example: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A',
    }),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
    signature: z.string().min(1, 'Signature is required').openapi({
      example: '3xJ9fK...',
      description: 'Base58 or Base64 encoded signature',
    }),
    nonce: z.string().min(1, 'Nonce is required').openapi({
      example: 'abc123def456',
    }),
  })
);

export const VerifyResponseSchema = registry.register(
  'VerifyResponse',
  z.object({
    token: z.string().openapi({
      description: 'JWT token for authenticated requests',
    }),
    expiresIn: z.number().openapi({
      example: 86400,
      description: 'Token validity in seconds',
    }),
    user: z.object({
      address: z.string(),
      blockchain: z.enum(['solana', 'ethereum', 'polygon']),
    }),
  })
);

// ============================================================================
// User Schemas
// ============================================================================

export const RegisterRequestSchema = registry.register(
  'RegisterRequest',
  z.object({
    address: z.string().min(1, 'Address is required').openapi({
      example: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A',
    }),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
  })
);

export const LinkedAddressSchema = registry.register(
  'LinkedAddress',
  z.object({
    id: z.number().optional(),
    address: z.string(),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']),
    verifiedAt: z.string().datetime().optional(),
  })
);

export const UserSchema = registry.register(
  'User',
  z.object({
    id: z.number().openapi({ example: 1 }),
    primaryAddress: z.string().openapi({
      example: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A',
    }),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']),
    subscriptionStatus: z.enum(['inactive', 'active', 'cancelled', 'expired']),
    subscriptionTier: z.enum(['free', 'paid']),
    createdAt: z.string().datetime(),
  })
);

export const UserWithAddressesSchema = registry.register(
  'UserWithAddresses',
  UserSchema.extend({
    linkedAddresses: z.array(LinkedAddressSchema),
  })
);

export const LinkAddressRequestSchema = registry.register(
  'LinkAddressRequest',
  z.object({
    address: z.string().min(1, 'Address is required'),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
  })
);

// ============================================================================
// Email Schemas
// ============================================================================

export const SendEmailRequestSchema = registry.register(
  'SendEmailRequest',
  z
    .object({
      userId: z.number().positive('Valid user ID required'),
      fromAddressId: z.number().positive('Valid from address ID required'),
      toAddress: z.string().email('Valid recipient email required').openapi({
        example: 'recipient@example.com',
      }),
      subject: z.string().min(1, 'Subject is required').max(998, 'Subject too long'),
      bodyText: z.string().optional(),
      bodyHtml: z.string().optional(),
      replyTo: z.string().email().optional(),
    })
    .refine((data) => data.bodyText || data.bodyHtml, {
      message: 'Either bodyText or bodyHtml is required',
    })
);

export const SendEmailResponseSchema = registry.register(
  'SendEmailResponse',
  z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    emailId: z.string().uuid(),
    details: z
      .object({
        provider: z.string(),
        deliveryStatus: z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced']),
        sentAt: z.string().datetime(),
      })
      .optional(),
  })
);

export const SentEmailSchema = registry.register(
  'SentEmail',
  z.object({
    id: z.string().uuid(),
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    sentAt: z.string().datetime(),
    deliveryStatus: z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced']),
  })
);

export const SentEmailDetailSchema = registry.register(
  'SentEmailDetail',
  SentEmailSchema.extend({
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
    messageId: z.string().optional(),
  })
);

export const FromAddressSchema = registry.register(
  'FromAddress',
  z.object({
    id: z.number(),
    address: z.string(),
    email: z.string().email(),
    blockchain: z.enum(['solana', 'ethereum', 'polygon']),
  })
);

export const GetSentEmailsQuerySchema = registry.register(
  'GetSentEmailsQuery',
  z.object({
    userId: z.coerce.number().positive('Valid user ID required'),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  })
);

// ============================================================================
// Payment Schemas
// ============================================================================

export const PlanPricingSchema = registry.register(
  'PlanPricing',
  z.object({
    usd: z.object({
      amount: z.number().openapi({ example: 999, description: 'Amount in cents' }),
      currency: z.string().openapi({ example: 'usd' }),
      formatted: z.string().openapi({ example: '$9.99' }),
    }),
    usdc: z.object({
      amount: z.number().openapi({ example: 9.99 }),
      currency: z.string().openapi({ example: 'usdc' }),
      formatted: z.string().openapi({ example: '9.99 USDC' }),
    }),
  })
);

export const PricingResponseSchema = registry.register(
  'PricingResponse',
  z.object({
    monthly: PlanPricingSchema,
    yearly: PlanPricingSchema,
    savings: z.object({
      yearly: z.string().openapi({ example: '2 months free' }),
      percentage: z.number().openapi({ example: 17 }),
    }),
  })
);

export const StripeCheckoutRequestSchema = registry.register(
  'StripeCheckoutRequest',
  z.object({
    userId: z.number().positive('Valid user ID required'),
    plan: z.enum(['monthly', 'yearly']),
    successUrl: z.string().url('Valid success URL required'),
    cancelUrl: z.string().url('Valid cancel URL required'),
  })
);

export const StripeCheckoutResponseSchema = registry.register(
  'StripeCheckoutResponse',
  z.object({
    sessionId: z.string().openapi({ example: 'cs_test_...' }),
    checkoutUrl: z.string().url(),
    expiresAt: z.string().datetime(),
  })
);

export const SolanaPayRequestSchema = registry.register(
  'SolanaPayRequest',
  z.object({
    userId: z.number().positive('Valid user ID required'),
    plan: z.enum(['monthly', 'yearly']),
  })
);

export const SolanaPayResponseSchema = registry.register(
  'SolanaPayResponse',
  z.object({
    reference: z.string(),
    recipient: z.string(),
    amount: z.number(),
    splToken: z.string(),
    label: z.string(),
    message: z.string(),
    memo: z.string(),
  })
);

export const SolanaPayVerifyRequestSchema = registry.register(
  'SolanaPayVerifyRequest',
  z.object({
    reference: z.string(),
    signature: z.string(),
  })
);

export const CancelSubscriptionRequestSchema = registry.register(
  'CancelSubscriptionRequest',
  z.object({
    userId: z.number().positive('Valid user ID required'),
  })
);

// ============================================================================
// Health Schemas
// ============================================================================

export const ComponentHealthSchema = registry.register(
  'ComponentHealth',
  z.object({
    status: z.enum(['healthy', 'unhealthy']),
    latency: z.number().optional().openapi({ description: 'Latency in milliseconds' }),
    message: z.string().optional(),
  })
);

export const HealthStatusSchema = registry.register(
  'HealthStatus',
  z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.string().datetime(),
    uptime: z.number().openapi({ description: 'Uptime in seconds' }),
    version: z.string(),
  })
);

export const ReadinessStatusSchema = registry.register(
  'ReadinessStatus',
  HealthStatusSchema.extend({
    checks: z.object({
      database: ComponentHealthSchema,
      redis: ComponentHealthSchema,
      cleanupScheduler: ComponentHealthSchema,
    }),
  })
);

// ============================================================================
// Security Schemes
// ============================================================================

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT token obtained from /auth/verify endpoint',
});
