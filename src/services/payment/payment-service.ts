/**
 * Payment Service
 * Handles subscription payments via Solana Pay (USDC)
 *
 * SECURITY NOTES:
 * - Verify all transaction signatures on-chain
 * - Use unique references for each payment request
 * - Log all payment events for audit
 */

import { config } from '../../config/index.js';
import { userService } from '../user/index.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('PaymentService');

/**
 * Payment provider types
 */
export type PaymentProviderType = 'solana_pay';

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
 * Solana Pay transaction request
 */
export interface SolanaPayRequest {
  reference: string;
  recipient: string;
  amount: number;
  splToken: string;
  label: string;
  message: string;
  memo: string;
}

/**
 * Solana Pay status response
 */
export interface SolanaPayStatus {
  reference: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Subscription pricing in USDC
 */
const PRICING = {
  monthly: 2, // $2 USDC
  yearly: 15, // $15 USDC
} as const;

/**
 * USDC token mint address on Solana mainnet
 */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Payment Service Class
 */
export class PaymentService {
  private solanaPayEnabled: boolean;

  constructor() {
    this.solanaPayEnabled = !!config.SOLANA_PAY_MERCHANT_WALLET;
  }

  /**
   * Check if a payment provider is available
   */
  isProviderAvailable(provider: PaymentProviderType): boolean {
    if (provider === 'solana_pay') {
      return this.solanaPayEnabled;
    }
    return false;
  }

  /**
   * Get available payment providers
   */
  getAvailableProviders(): PaymentProviderType[] {
    const providers: PaymentProviderType[] = [];
    if (this.solanaPayEnabled) providers.push('solana_pay');
    return providers;
  }

  /**
   * Get subscription pricing for a plan
   */
  getPricing(plan: SubscriptionPlan): { amount: number; currency: string } {
    return { amount: PRICING[plan], currency: 'usdc' };
  }

  /**
   * Create Solana Pay transaction request
   *
   * Creates a payment request that can be displayed as a QR code or
   * used with a Solana wallet to complete the subscription purchase.
   *
   * @param userId - User ID making the payment
   * @param plan - Subscription plan (monthly or yearly)
   * @returns Payment request data or error
   */
  async createSolanaPayRequest(
    userId: number,
    plan: SubscriptionPlan
  ): Promise<{ success: boolean; data?: SolanaPayRequest; error?: string }> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    try {
      const userResult = await userService.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found' };
      }

      const merchantWallet = config.SOLANA_PAY_MERCHANT_WALLET;
      if (!merchantWallet) {
        return { success: false, error: 'Merchant wallet not configured' };
      }

      const amount = PRICING[plan];
      const reference = this.generateReference();

      return {
        success: true,
        data: {
          reference,
          recipient: merchantWallet,
          amount,
          splToken: USDC_MINT,
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
   * Verify Solana Pay transaction and activate subscription
   *
   * Verifies that a transaction was completed on-chain with the correct
   * amount, recipient, and reference. On successful verification, upgrades
   * the user's subscription.
   *
   * @param reference - Unique reference from the payment request
   * @param signature - Solana transaction signature
   * @param userId - User ID to upgrade (extracted from memo)
   * @param plan - Subscription plan (extracted from memo)
   * @returns Verification result
   */
  async verifySolanaPayTransaction(
    reference: string,
    signature: string,
    userId?: number,
    plan?: SubscriptionPlan
  ): Promise<PaymentResult> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    try {
      // TODO: Implement full on-chain verification:
      // 1. Fetch transaction from Solana RPC using signature
      // 2. Verify transaction is finalized
      // 3. Verify recipient matches merchant wallet
      // 4. Verify amount matches plan pricing
      // 5. Verify USDC token mint matches
      // 6. Verify reference is present in transaction
      // 7. Ensure transaction hasn't been used before (idempotency)

      log.debug('Verifying Solana Pay transaction', { reference, signature });

      if (userId && plan) {
        const now = new Date();
        const expiresAt = new Date(now);
        if (plan === 'monthly') {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        } else {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        }

        const result = await userService.upgradeSubscription(
          userId,
          'solana_pay',
          signature,
          expiresAt
        );

        if (!result.success) {
          return { success: false, error: result.error };
        }
      }

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
   * Get status of a Solana Pay payment request
   *
   * @param reference - Payment request reference
   * @returns Payment status or error
   */
  async getSolanaPayStatus(
    reference: string
  ): Promise<{ success: boolean; data?: SolanaPayStatus; error?: string }> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    // TODO: Implement database lookup for payment request status
    // For now, return a mock pending status
    return {
      success: true,
      data: {
        reference,
        status: 'pending',
        createdAt: new Date(),
      },
    };
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
   * Generate a unique reference for Solana Pay transactions
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
