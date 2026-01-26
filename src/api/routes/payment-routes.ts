/**
 * Payment Routes
 * API endpoints for Solana Pay subscription payments
 *
 * Endpoints:
 * - GET /payments/pricing - Get subscription pricing (USDC only)
 * - GET /payments/providers - Get available payment providers (Solana Pay)
 * - POST /payments/solana-pay/request - Create Solana Pay request
 * - POST /payments/solana-pay/verify - Verify Solana Pay transaction
 * - GET /payments/solana-pay/status/:reference - Get payment request status
 * - POST /payments/cancel - Cancel subscription
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { paymentService } from '../../services/payment/index.js';
import type { SubscriptionPlan } from '../../services/payment/payment-service.js';
import { createLogger } from '../../services/logger/index.js';

const log = createLogger('PaymentRoutes');
const router: Router = Router();

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
 *   "monthly": { "amount": 2, "currency": "usdc", "formatted": "2 USDC" },
 *   "yearly": { "amount": 15, "currency": "usdc", "formatted": "15 USDC" },
 *   "savings": { "yearly": "$9 savings", "percentage": 38 }
 * }
 */
router.get('/pricing', (_req: Request, res: Response) => {
  res.status(200).json({
    monthly: { amount: 2, currency: 'usdc', formatted: '2 USDC' },
    yearly: { amount: 15, currency: 'usdc', formatted: '15 USDC' },
    savings: { yearly: '$9 savings', percentage: 38 },
  });
});

/**
 * GET /payments/providers
 * Get available payment providers
 *
 * Response:
 * {
 *   "providers": ["solana_pay"],
 *   "solana_pay": { "available": true }
 * }
 */
router.get('/providers', (_req: Request, res: Response) => {
  res.status(200).json({
    providers: ['solana_pay'],
    solana_pay: {
      available: paymentService.isProviderAvailable('solana_pay'),
    },
  });
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
 *   "amount": 2,
 *   "splToken": "USDC_mint_address",
 *   "label": "PubKeyMail",
 *   "message": "Monthly subscription",
 *   "memo": "user:1:plan:monthly:ref:abc123"
 * }
 */
router.post('/solana-pay/request', async (req: Request, res: Response) => {
  try {
    log.debug('Creating Solana Pay request', { body: req.body });
    const validation = solanaPaySchema.safeParse(req.body);

    if (!validation.success) {
      log.warn('Solana Pay request validation failed', { issues: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.issues,
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
      log.warn('Solana Pay request failed', { userId, plan, error: result.error });
      res.status(status).json({
        error: {
          code: 'PAYMENT_REQUEST_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Solana Pay request created', { userId, plan, reference: result.data?.reference });
    res.status(200).json(result.data);
  } catch (error) {
    log.error('Solana Pay request error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
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
    log.debug('Verifying Solana Pay transaction', { body: req.body });
    const { reference, signature } = req.body as {
      reference?: string;
      signature?: string;
    };

    if (!reference || !signature) {
      log.warn('Solana Pay verification missing required fields', { reference: !!reference, signature: !!signature });
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
      log.warn('Solana Pay verification failed', { reference, error: result.error });
      res.status(400).json({
        error: {
          code: 'VERIFICATION_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Solana Pay transaction verified', { reference, paymentId: result.paymentId });
    res.status(200).json({
      verified: true,
      paymentId: result.paymentId,
    });
  } catch (error) {
    log.error('Solana Pay verification error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /payments/solana-pay/status/:reference
 * Get the status of a Solana Pay payment request
 *
 * Response:
 * {
 *   "reference": "abc123...",
 *   "status": "pending" | "completed" | "expired",
 *   "createdAt": "2024-01-01T00:00:00.000Z",
 *   "completedAt": "2024-01-01T00:05:00.000Z" (optional)
 * }
 */
router.get('/solana-pay/status/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    log.debug('Getting Solana Pay status', { reference });

    if (!reference) {
      log.warn('Solana Pay status request missing reference');
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Reference is required',
        },
      });
      return;
    }

    const result = await paymentService.getSolanaPayStatus(reference);

    if (!result.success) {
      log.warn('Solana Pay status not found', { reference, error: result.error });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: result.error,
        },
      });
      return;
    }

    log.info('Solana Pay status retrieved', { reference, status: result.data?.status });
    res.status(200).json(result.data);
  } catch (error) {
    log.error('Solana Pay status error', { error });
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
    log.debug('Cancelling subscription', { body: req.body });
    const validation = cancelSchema.safeParse(req.body);

    if (!validation.success) {
      log.warn('Subscription cancellation validation failed', { issues: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId } = validation.data;

    const result = await paymentService.cancelSubscription(userId);

    if (!result.success) {
      log.warn('Subscription cancellation failed', { userId, error: result.error });
      res.status(400).json({
        error: {
          code: 'CANCELLATION_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Subscription cancelled', { userId });
    res.status(200).json({
      message: 'Subscription cancelled successfully',
    });
  } catch (error) {
    log.error('Subscription cancellation error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
