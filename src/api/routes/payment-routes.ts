/**
 * Payment Routes
 * API endpoints for subscription payments
 *
 * Endpoints:
 * - GET /payments/pricing - Get subscription pricing
 * - GET /payments/providers - Get available payment providers
 * - POST /payments/stripe/checkout - Create Stripe checkout session
 * - POST /payments/solana-pay/request - Create Solana Pay request
 * - POST /payments/webhooks/stripe - Stripe webhook handler
 * - POST /payments/cancel - Cancel subscription
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { paymentService } from '../../services/payment/index.js';
import type { SubscriptionPlan } from '../../services/payment/payment-service.js';

const router: Router = Router();

/**
 * Checkout request schema
 */
const checkoutSchema = z.object({
  userId: z.number().positive('Valid user ID required'),
  plan: z.enum(['monthly', 'yearly']),
  successUrl: z.string().url('Valid success URL required'),
  cancelUrl: z.string().url('Valid cancel URL required'),
});

/**
 * Solana Pay request schema
 */
const solanaPaySchema = z.object({
  userId: z.number().positive('Valid user ID required'),
  plan: z.enum(['monthly', 'yearly']),
});

/**
 * Cancel subscription schema
 */
const cancelSchema = z.object({
  userId: z.number().positive('Valid user ID required'),
});

/**
 * GET /payments/pricing
 * Get subscription pricing for all plans
 *
 * Response:
 * {
 *   "monthly": {
 *     "usd": { "amount": 999, "currency": "usd", "formatted": "$9.99" },
 *     "usdc": { "amount": 9.99, "currency": "usdc", "formatted": "9.99 USDC" }
 *   },
 *   "yearly": { ... }
 * }
 */
router.get('/pricing', (_req: Request, res: Response) => {
  const monthlyPricing = paymentService.getPricing('monthly');
  const yearlyPricing = paymentService.getPricing('yearly');

  res.status(200).json({
    monthly: {
      usd: {
        ...monthlyPricing.usd,
        formatted: `$${(monthlyPricing.usd.amount / 100).toFixed(2)}`,
      },
      usdc: {
        ...monthlyPricing.usdc,
        formatted: `${monthlyPricing.usdc.amount.toFixed(2)} USDC`,
      },
    },
    yearly: {
      usd: {
        ...yearlyPricing.usd,
        formatted: `$${(yearlyPricing.usd.amount / 100).toFixed(2)}`,
      },
      usdc: {
        ...yearlyPricing.usdc,
        formatted: `${yearlyPricing.usdc.amount.toFixed(2)} USDC`,
      },
    },
    savings: {
      yearly: '2 months free',
      percentage: 17,
    },
  });
});

/**
 * GET /payments/providers
 * Get available payment providers
 *
 * Response:
 * {
 *   "providers": ["stripe", "solana_pay"],
 *   "stripe": { "available": true },
 *   "solana_pay": { "available": true }
 * }
 */
router.get('/providers', (_req: Request, res: Response) => {
  const providers = paymentService.getAvailableProviders();

  res.status(200).json({
    providers,
    stripe: {
      available: paymentService.isProviderAvailable('stripe'),
    },
    solana_pay: {
      available: paymentService.isProviderAvailable('solana_pay'),
    },
  });
});

/**
 * POST /payments/stripe/checkout
 * Create a Stripe checkout session
 *
 * Request body:
 * {
 *   "userId": 1,
 *   "plan": "monthly",
 *   "successUrl": "https://example.com/success",
 *   "cancelUrl": "https://example.com/cancel"
 * }
 *
 * Response:
 * {
 *   "sessionId": "cs_test_...",
 *   "checkoutUrl": "https://checkout.stripe.com/...",
 *   "expiresAt": "2024-01-01T00:30:00.000Z"
 * }
 */
router.post('/stripe/checkout', async (req: Request, res: Response) => {
  try {
    const validation = checkoutSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { userId, plan, successUrl, cancelUrl } = validation.data;

    const result = await paymentService.createStripeCheckout(
      userId,
      plan as SubscriptionPlan,
      successUrl,
      cancelUrl
    );

    if (!result.success) {
      const status = result.error?.includes('not configured') ? 501 : 400;
      res.status(status).json({
        error: {
          code: 'CHECKOUT_FAILED',
          message: result.error,
        },
      });
      return;
    }

    res.status(200).json(result.data);
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /payments/solana-pay/request
 * Create a Solana Pay transaction request
 *
 * Request body:
 * {
 *   "userId": 1,
 *   "plan": "monthly"
 * }
 *
 * Response:
 * {
 *   "reference": "abc123...",
 *   "recipient": "merchant_wallet_address",
 *   "amount": 9.99,
 *   "splToken": "USDC_mint_address",
 *   "label": "PubKeyMail",
 *   "message": "Monthly subscription",
 *   "memo": "user:1:plan:monthly:ref:abc123"
 * }
 */
router.post('/solana-pay/request', async (req: Request, res: Response) => {
  try {
    const validation = solanaPaySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { userId, plan } = validation.data;

    const result = await paymentService.createSolanaPayRequest(
      userId,
      plan as SubscriptionPlan
    );

    if (!result.success) {
      const status = result.error?.includes('not configured') ? 501 : 400;
      res.status(status).json({
        error: {
          code: 'PAYMENT_REQUEST_FAILED',
          message: result.error,
        },
      });
      return;
    }

    res.status(200).json(result.data);
  } catch (error) {
    console.error('Solana Pay request error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /payments/webhooks/stripe
 * Handle Stripe webhook events
 *
 * This endpoint should receive raw body for signature verification
 */
router.post('/webhooks/stripe', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      res.status(400).json({
        error: {
          code: 'MISSING_SIGNATURE',
          message: 'Stripe signature header is required',
        },
      });
      return;
    }

    // Get raw body for signature verification
    // Note: Express needs to be configured with raw body parser for this route
    const payload = JSON.stringify(req.body);

    const result = await paymentService.handleStripeWebhook(payload, signature);

    if (!result.success) {
      console.error('Stripe webhook error:', result.error);
      res.status(400).json({
        error: {
          code: 'WEBHOOK_ERROR',
          message: result.error,
        },
      });
      return;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Webhook processing failed',
      },
    });
  }
});

/**
 * POST /payments/solana-pay/verify
 * Verify a Solana Pay transaction
 *
 * Request body:
 * {
 *   "reference": "abc123...",
 *   "signature": "transaction_signature"
 * }
 */
router.post('/solana-pay/verify', async (req: Request, res: Response) => {
  try {
    const { reference, signature } = req.body as {
      reference?: string;
      signature?: string;
    };

    if (!reference || !signature) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Reference and signature are required',
        },
      });
      return;
    }

    const result = await paymentService.verifySolanaPayTransaction(reference, signature);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VERIFICATION_FAILED',
          message: result.error,
        },
      });
      return;
    }

    res.status(200).json({
      verified: true,
      paymentId: result.paymentId,
    });
  } catch (error) {
    console.error('Solana Pay verification error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /payments/cancel
 * Cancel active subscription
 *
 * Request body:
 * {
 *   "userId": 1
 * }
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const validation = cancelSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { userId } = validation.data;

    const result = await paymentService.cancelSubscription(userId);

    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'CANCELLATION_FAILED',
          message: result.error,
        },
      });
      return;
    }

    res.status(200).json({
      message: 'Subscription cancelled successfully',
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
