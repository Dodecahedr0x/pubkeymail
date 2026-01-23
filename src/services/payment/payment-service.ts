/**
 * Payment Service
 * Handles subscription payments via Stripe (fiat) and Solana Pay (crypto)
 *
 * SECURITY NOTES:
 * - Never store full card details
 * - Verify all webhook signatures
 * - Use idempotency keys for payment operations
 * - Log all payment events for audit
 */

import { config } from '../../config/index.js';
import { userService } from '../user/index.js';

/**
 * Payment provider types
 */
export type PaymentProviderType = 'stripe' | 'solana_pay';

/**
 * Subscription plan types
 */
export type SubscriptionPlan = 'monthly' | 'yearly';

/**
 * Payment status
 */
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

/**
 * Payment intent for checkout
 */
export interface PaymentIntent {
  id: string;
  provider: PaymentProviderType;
  userId: number;
  plan: SubscriptionPlan;
  amount: number;
  currency: string;
  status: PaymentStatus;
  clientSecret?: string;
  checkoutUrl?: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Payment result
 */
export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  subscriptionId?: string;
  error?: string;
}

/**
 * Stripe checkout session data
 */
export interface StripeCheckoutData {
  sessionId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

/**
 * Solana Pay transaction request
 */
export interface SolanaPayRequest {
  reference: string;
  recipient: string;
  amount: number;
  splToken?: string;
  label: string;
  message: string;
  memo: string;
}

/**
 * Subscription pricing configuration
 */
const PRICING = {
  monthly: {
    usd: 999, // $9.99 in cents
    usdc: 9.99,
  },
  yearly: {
    usd: 9999, // $99.99 in cents (2 months free)
    usdc: 99.99,
  },
} as const;

/**
 * Payment Service Class
 */
export class PaymentService {
  private stripeEnabled: boolean;
  private solanaPayEnabled: boolean;

  constructor() {
    this.stripeEnabled = !!config.STRIPE_SECRET_KEY;
    this.solanaPayEnabled = !!config.SOLANA_PAY_MERCHANT_WALLET;
  }

  /**
   * Check if a payment provider is available
   */
  isProviderAvailable(provider: PaymentProviderType): boolean {
    switch (provider) {
      case 'stripe':
        return this.stripeEnabled;
      case 'solana_pay':
        return this.solanaPayEnabled;
      default:
        return false;
    }
  }

  /**
   * Get available payment providers
   */
  getAvailableProviders(): PaymentProviderType[] {
    const providers: PaymentProviderType[] = [];
    if (this.stripeEnabled) providers.push('stripe');
    if (this.solanaPayEnabled) providers.push('solana_pay');
    return providers;
  }

  /**
   * Get subscription pricing
   */
  getPricing(plan: SubscriptionPlan): {
    usd: { amount: number; currency: string };
    usdc: { amount: number; currency: string };
  } {
    return {
      usd: { amount: PRICING[plan].usd, currency: 'usd' },
      usdc: { amount: PRICING[plan].usdc, currency: 'usdc' },
    };
  }

  /**
   * Create Stripe checkout session
   *
   * @param userId - User ID
   * @param plan - Subscription plan
   * @param successUrl - Redirect URL on success
   * @param cancelUrl - Redirect URL on cancel
   */
  async createStripeCheckout(
    userId: number,
    plan: SubscriptionPlan,
    _successUrl: string,
    _cancelUrl: string
  ): Promise<{ success: boolean; data?: StripeCheckoutData; error?: string }> {
    if (!this.stripeEnabled) {
      return { success: false, error: 'Stripe is not configured' };
    }

    try {
      // Get user to verify they exist
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      // Check if user already has active subscription
      if (
        userResult.data.subscriptionStatus === 'active' &&
        userResult.data.subscriptionTier === 'paid'
      ) {
        return { success: false, error: 'User already has active subscription' };
      }

      // Get price ID based on plan
      const priceId =
        plan === 'monthly'
          ? config.STRIPE_PRICE_ID_MONTHLY
          : config.STRIPE_PRICE_ID_YEARLY;

      if (!priceId) {
        return { success: false, error: `Price not configured for ${plan} plan` };
      }

      // In real implementation, this would call Stripe API
      // For now, return a mock session for development
      const sessionId = `cs_test_${Date.now()}_${userId}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // TODO: Implement actual Stripe API call
      // const stripe = new Stripe(config.STRIPE_SECRET_KEY);
      // const session = await stripe.checkout.sessions.create({
      //   mode: 'subscription',
      //   payment_method_types: ['card'],
      //   line_items: [{ price: priceId, quantity: 1 }],
      //   success_url: successUrl,
      //   cancel_url: cancelUrl,
      //   client_reference_id: userId.toString(),
      //   metadata: { userId: userId.toString(), plan },
      // });

      return {
        success: true,
        data: {
          sessionId,
          checkoutUrl: `https://checkout.stripe.com/pay/${sessionId}`,
          expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Stripe checkout failed',
      };
    }
  }

  /**
   * Create Solana Pay transaction request
   *
   * @param userId - User ID
   * @param plan - Subscription plan
   */
  async createSolanaPayRequest(
    userId: number,
    plan: SubscriptionPlan
  ): Promise<{ success: boolean; data?: SolanaPayRequest; error?: string }> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    try {
      // Get user to verify they exist
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      const merchantWallet = config.SOLANA_PAY_MERCHANT_WALLET;
      if (!merchantWallet) {
        return { success: false, error: 'Merchant wallet not configured' };
      }

      const amount = PRICING[plan].usdc;
      const reference = this.generateReference();

      // Store reference for verification later
      // TODO: Store in database for webhook verification

      return {
        success: true,
        data: {
          reference,
          recipient: merchantWallet,
          amount,
          splToken: config.SOLANA_PAY_USDC_MINT,
          label: 'PubKeyMail',
          message: `${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription`,
          memo: `user:${userId}:plan:${plan}:ref:${reference}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Solana Pay request failed',
      };
    }
  }

  /**
   * Handle Stripe webhook event
   *
   * @param payload - Raw webhook payload
   * @param signature - Stripe signature header
   */
  async handleStripeWebhook(
    payload: string,
    _signature: string
  ): Promise<PaymentResult> {
    if (!this.stripeEnabled) {
      return { success: false, error: 'Stripe is not configured' };
    }

    try {
      // Verify webhook signature
      const webhookSecret = config.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return { success: false, error: 'Webhook secret not configured' };
      }

      // TODO: Implement actual Stripe webhook verification
      // const stripe = new Stripe(config.STRIPE_SECRET_KEY);
      // const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

      // Mock event parsing for development
      const event = JSON.parse(payload) as {
        type: string;
        data: {
          object: {
            id: string;
            client_reference_id?: string;
            subscription?: string;
            metadata?: { userId?: string; plan?: string };
          };
        };
      };

      switch (event.type) {
        case 'checkout.session.completed':
          return this.handleCheckoutCompleted(event.data.object);

        case 'customer.subscription.updated':
          return this.handleSubscriptionUpdated(event.data.object);

        case 'customer.subscription.deleted':
          return this.handleSubscriptionDeleted(event.data.object);

        case 'invoice.payment_failed':
          return this.handlePaymentFailed(event.data.object);

        default:
          // Ignore unhandled events
          return { success: true };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      };
    }
  }

  /**
   * Handle checkout.session.completed event
   */
  private async handleCheckoutCompleted(session: {
    id: string;
    client_reference_id?: string;
    subscription?: string;
    metadata?: { userId?: string; plan?: string };
  }): Promise<PaymentResult> {
    const userId = parseInt(session.client_reference_id || session.metadata?.userId || '0');
    const plan = session.metadata?.plan as SubscriptionPlan | undefined;

    if (!userId || !plan) {
      return { success: false, error: 'Missing user or plan information' };
    }

    // Calculate subscription end date
    const now = new Date();
    const expiresAt = new Date(now);
    if (plan === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Upgrade user subscription
    const result = await userService.upgradeSubscription(
      userId,
      'stripe',
      session.subscription || session.id,
      expiresAt
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      paymentId: session.id,
      subscriptionId: session.subscription,
    };
  }

  /**
   * Handle customer.subscription.updated event
   */
  private async handleSubscriptionUpdated(subscription: {
    id: string;
    metadata?: { userId?: string };
  }): Promise<PaymentResult> {
    // TODO: Handle subscription updates (plan changes, renewals)
    console.log('Subscription updated:', subscription.id);
    return { success: true, subscriptionId: subscription.id };
  }

  /**
   * Handle customer.subscription.deleted event
   */
  private async handleSubscriptionDeleted(subscription: {
    id: string;
    metadata?: { userId?: string };
  }): Promise<PaymentResult> {
    const userId = parseInt(subscription.metadata?.userId || '0');
    if (!userId) {
      return { success: false, error: 'Missing user information' };
    }

    // Downgrade user to free tier
    const result = await userService.updateUser(userId, {
      subscriptionStatus: 'cancelled',
      subscriptionTier: 'free',
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, subscriptionId: subscription.id };
  }

  /**
   * Handle invoice.payment_failed event
   */
  private async handlePaymentFailed(invoice: {
    id: string;
    subscription?: string;
    metadata?: { userId?: string };
  }): Promise<PaymentResult> {
    const userId = parseInt(invoice.metadata?.userId || '0');
    if (!userId) {
      return { success: false, error: 'Missing user information' };
    }

    // Mark subscription as past_due
    const result = await userService.updateUser(userId, {
      subscriptionStatus: 'past_due',
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, paymentId: invoice.id };
  }

  /**
   * Verify Solana Pay transaction
   *
   * @param reference - Transaction reference
   * @param signature - Transaction signature
   */
  async verifySolanaPayTransaction(
    reference: string,
    signature: string
  ): Promise<PaymentResult> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    try {
      // TODO: Implement actual Solana transaction verification
      // 1. Fetch transaction from Solana RPC
      // 2. Verify the reference matches
      // 3. Verify the amount and recipient
      // 4. Extract user and plan from memo
      // 5. Upgrade user subscription

      // Mock verification for development
      console.log('Verifying Solana Pay transaction:', { reference, signature });

      // Parse memo to get user and plan
      // Expected memo format: user:{userId}:plan:{plan}:ref:{reference}

      return {
        success: true,
        paymentId: signature,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction verification failed',
      };
    }
  }

  /**
   * Cancel subscription
   *
   * @param userId - User ID
   */
  async cancelSubscription(userId: number): Promise<PaymentResult> {
    try {
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      if (userResult.data.subscriptionTier !== 'paid') {
        return { success: false, error: 'No active subscription to cancel' };
      }

      // TODO: Cancel subscription with payment provider
      // For Stripe: stripe.subscriptions.cancel(subscriptionId)

      // Update user status
      const result = await userService.updateUser(userId, {
        subscriptionStatus: 'cancelled',
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cancellation failed',
      };
    }
  }

  /**
   * Generate a unique reference for Solana Pay
   */
  private generateReference(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

/**
 * Singleton instance
 */
export const paymentService = new PaymentService();
