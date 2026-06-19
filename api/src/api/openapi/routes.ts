/**
 * OpenAPI Route Definitions
 * Registers all API routes with their schemas for OpenAPI generation
 */

import {
  registry,
  ChallengeRequestSchema,
  ChallengeResponseSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
  RegisterRequestSchema,
  UserSchema,
  UserWithAddressesSchema,
  LinkAddressRequestSchema,
  LinkedAddressSchema,
  SendEmailRequestSchema,
  SendEmailResponseSchema,
  SentEmailSchema,
  SentEmailDetailSchema,
  FromAddressSchema,
  GetSentEmailsQuerySchema,
  PricingResponseSchema,
  SolanaPayRequestSchema,
  SolanaPayResponseSchema,
  SolanaPayVerifyRequestSchema,
  SolanaPayStatusSchema,
  CancelSubscriptionRequestSchema,
  HealthStatusSchema,
  ReadinessStatusSchema,
  ErrorSchema,
} from './registry.js';
import { z } from 'zod';

// ============================================================================
// Auth Routes
// ============================================================================

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/challenge',
  tags: ['Auth'],
  summary: 'Request authentication challenge',
  description: 'Request a challenge message to sign with your wallet',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChallengeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Challenge generated successfully',
      content: {
        'application/json': {
          schema: ChallengeResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error or unsupported blockchain',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/verify',
  tags: ['Auth'],
  summary: 'Verify wallet signature',
  description: 'Verify a signed challenge and receive a JWT token',
  request: {
    body: {
      content: {
        'application/json': {
          schema: VerifyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Authentication successful',
      content: {
        'application/json': {
          schema: VerifyResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    401: {
      description: 'Authentication failed',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

// ============================================================================
// User Routes
// ============================================================================

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/register',
  tags: ['Users'],
  summary: 'Register new user',
  description: 'Register a new user with a wallet address',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RegisterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User registered successfully',
      content: {
        'application/json': {
          schema: z.object({ user: UserSchema }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    409: {
      description: 'User already exists',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/check/{address}',
  tags: ['Users'],
  summary: 'Check if address is registered',
  request: {
    params: z.object({
      address: z.string().openapi({ description: 'Blockchain wallet address' }),
    }),
  },
  responses: {
    200: {
      description: 'Registration status',
      content: {
        'application/json': {
          schema: z.object({ registered: z.boolean() }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/profile/{address}',
  tags: ['Users'],
  summary: 'Get user profile by address',
  request: {
    params: z.object({
      address: z.string().openapi({ description: 'Blockchain wallet address' }),
    }),
  },
  responses: {
    200: {
      description: 'User profile',
      content: {
        'application/json': {
          schema: z.object({ user: UserWithAddressesSchema }),
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/{userId}/link-address',
  tags: ['Users'],
  summary: 'Link additional address to user',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      userId: z.coerce.number().openapi({ description: 'User ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: LinkAddressRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Address linked successfully',
      content: {
        'application/json': {
          schema: z.object({ linkedAddress: LinkedAddressSchema }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    409: {
      description: 'Address already linked',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/users/{userId}/addresses/{addressId}',
  tags: ['Users'],
  summary: 'Unlink address from user',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      userId: z.coerce.number().openapi({ description: 'User ID' }),
      addressId: z.coerce.number().openapi({ description: 'Address ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Address unlinked successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().openapi({ example: 'Address unlinked successfully' }),
          }),
        },
      },
    },
    400: {
      description: 'Cannot unlink primary address',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: 'Address not found',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

// ============================================================================
// Email Routes
// ============================================================================

registry.registerPath({
  method: 'post',
  path: '/api/v1/emails/send',
  tags: ['Emails'],
  summary: 'Send an email',
  description: 'Send an email (requires paid subscription)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SendEmailRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Email sent successfully',
      content: {
        'application/json': {
          schema: SendEmailResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    403: {
      description: 'Subscription required or no permission',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: 'User or address not found',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    429: {
      description: 'Rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/emails/sent',
  tags: ['Emails'],
  summary: 'Get sent emails',
  security: [{ bearerAuth: [] }],
  request: {
    query: GetSentEmailsQuerySchema,
  },
  responses: {
    200: {
      description: 'List of sent emails',
      content: {
        'application/json': {
          schema: z.object({
            emails: z.array(SentEmailSchema),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/emails/from-addresses',
  tags: ['Emails'],
  summary: 'Get available from addresses',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      userId: z.coerce.number().positive(),
    }),
  },
  responses: {
    200: {
      description: 'List of from addresses',
      content: {
        'application/json': {
          schema: z.object({
            addresses: z.array(FromAddressSchema),
          }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/emails/{emailId}',
  tags: ['Emails'],
  summary: 'Get sent email by ID',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      emailId: z.string().uuid(),
    }),
    query: z.object({
      userId: z.coerce.number().positive(),
    }),
  },
  responses: {
    200: {
      description: 'Email details',
      content: {
        'application/json': {
          schema: z.object({ email: SentEmailDetailSchema }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    404: {
      description: 'Email not found',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

// ============================================================================
// Payment Routes
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/api/v1/payments/pricing',
  tags: ['Payments'],
  summary: 'Get subscription pricing',
  responses: {
    200: {
      description: 'Pricing information',
      content: {
        'application/json': {
          schema: PricingResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/payments/providers',
  tags: ['Payments'],
  summary: 'Get available payment providers',
  responses: {
    200: {
      description: 'Available payment providers',
      content: {
        'application/json': {
          schema: z.object({
            providers: z.array(z.string()).openapi({ example: ['solana_pay'] }),
            solana_pay: z.object({ available: z.boolean() }),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/payments/solana-pay/request',
  tags: ['Payments'],
  summary: 'Create Solana Pay request',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SolanaPayRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Payment request created',
      content: {
        'application/json': {
          schema: SolanaPayResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    501: {
      description: 'Solana Pay not configured',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/payments/solana-pay/verify',
  tags: ['Payments'],
  summary: 'Verify Solana Pay transaction',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SolanaPayVerifyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Payment verified',
      content: {
        'application/json': {
          schema: z.object({
            verified: z.boolean(),
            paymentId: z.string().optional(),
          }),
        },
      },
    },
    400: {
      description: 'Verification failed',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/payments/solana-pay/status/{reference}',
  tags: ['Payments'],
  summary: 'Get or discover Solana Pay transaction status',
  request: {
    params: z.object({ reference: z.string() }),
  },
  responses: {
    200: {
      description: 'Payment request status',
      content: {
        'application/json': {
          schema: SolanaPayStatusSchema,
        },
      },
    },
    404: {
      description: 'Payment request not found',
      content: {
        'application/json': { schema: ErrorSchema },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': { schema: ErrorSchema },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/payments/cancel',
  tags: ['Payments'],
  summary: 'Cancel subscription',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CancelSubscriptionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Subscription cancelled',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().openapi({ example: 'Subscription cancelled successfully' }),
          }),
        },
      },
    },
    400: {
      description: 'Cancellation failed',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

// ============================================================================
// Webhook Routes
// ============================================================================

registry.registerPath({
  method: 'post',
  path: '/api/v1/webhooks/inbound',
  tags: ['Webhooks'],
  summary: 'Receive inbound email',
  description: 'Webhook endpoint for SMTP providers to deliver inbound emails',
  request: {
    headers: z.object({
      'x-webhook-signature': z.string().optional(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({}).passthrough().openapi({ description: 'Provider-specific payload' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Email received',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            emailId: z.string().uuid(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid email data',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    401: {
      description: 'Invalid webhook signature',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/webhooks/test',
  tags: ['Webhooks'],
  summary: 'Test webhook endpoint',
  description: 'Verify webhook endpoint is accessible (development only)',
  responses: {
    200: {
      description: 'Webhook accessible',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            provider: z.string(),
            webhookPath: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Not available in production',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

// ============================================================================
// Health Routes
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Basic health check',
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: HealthStatusSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  summary: 'Readiness check',
  description: 'Check if all dependencies are available',
  responses: {
    200: {
      description: 'Service is ready',
      content: {
        'application/json': {
          schema: ReadinessStatusSchema,
        },
      },
    },
    503: {
      description: 'Service is not ready',
      content: {
        'application/json': {
          schema: ReadinessStatusSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Kubernetes-style liveness probe',
  responses: {
    200: {
      description: 'Service is alive',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string().openapi({ example: 'ok' }),
          }),
        },
      },
    },
  },
});
