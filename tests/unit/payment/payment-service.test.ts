/**
 * Payment Service Tests
 * Tests for Stripe and Solana Pay payment processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../../../src/services/payment/payment-service.js';
import { userService } from '../../../src/services/user/index.js';

vi.mock('../../../src/services/user/index.js', () => ({
  userService: {
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    upgradeSubscription: vi.fn(),
  },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_PRICE_ID_MONTHLY: 'price_monthly',
    STRIPE_PRICE_ID_YEARLY: 'price_yearly',
    STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    SOLANA_PAY_MERCHANT_WALLET: 'MockMerchantWallet123',
    SOLANA_PAY_USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
}));

describe('PaymentService', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    paymentService = new PaymentService();
    vi.clearAllMocks();
  });

  describe('isProviderAvailable', () => {
    it('should return true for configured providers', () => {
      expect(paymentService.isProviderAvailable('stripe')).toBe(true);
      expect(paymentService.isProviderAvailable('solana_pay')).toBe(true);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return all configured providers', () => {
      const providers = paymentService.getAvailableProviders();
      expect(providers).toContain('stripe');
      expect(providers).toContain('solana_pay');
    });
  });

  describe('getPricing', () => {
    it('should return monthly pricing', () => {
      const pricing = paymentService.getPricing('monthly');
      expect(pricing.usd.amount).toBe(999);
      expect(pricing.usd.currency).toBe('usd');
      expect(pricing.usdc.amount).toBe(9.99);
    });

    it('should return yearly pricing', () => {
      const pricing = paymentService.getPricing('yearly');
      expect(pricing.usd.amount).toBe(9999);
      expect(pricing.usdc.amount).toBe(99.99);
    });
  });

  describe('createStripeCheckout', () => {
    it('should create checkout session for valid user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'inactive',
          subscriptionTier: 'free',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.createStripeCheckout(
        1,
        'monthly',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(result.success).toBe(true);
      expect(result.data?.sessionId).toBeDefined();
      expect(result.data?.checkoutUrl).toContain('checkout.stripe.com');
    });

    it('should reject for non-existent user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await paymentService.createStripeCheckout(
        999,
        'monthly',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('should reject for user with active subscription', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'stripe',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date('2025-01-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.createStripeCheckout(
        1,
        'monthly',
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has active subscription');
    });
  });

  describe('createSolanaPayRequest', () => {
    it('should create payment request for valid user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'inactive',
          subscriptionTier: 'free',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.createSolanaPayRequest(1, 'monthly');

      expect(result.success).toBe(true);
      expect(result.data?.recipient).toBe('MockMerchantWallet123');
      expect(result.data?.amount).toBe(9.99);
      expect(result.data?.reference).toBeDefined();
      expect(result.data?.memo).toContain('user:1:plan:monthly');
    });

    it('should create yearly payment request', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'inactive',
          subscriptionTier: 'free',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.createSolanaPayRequest(1, 'yearly');

      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(99.99);
      expect(result.data?.message).toContain('Yearly');
    });
  });

  describe('handleStripeWebhook', () => {
    it('should handle checkout.session.completed event', async () => {
      vi.mocked(userService.upgradeSubscription).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'stripe',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date('2025-01-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            client_reference_id: '1',
            subscription: 'sub_123',
            metadata: { userId: '1', plan: 'monthly' },
          },
        },
      };

      const result = await paymentService.handleStripeWebhook(
        JSON.stringify(event),
        'mock_signature'
      );

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe('sub_123');
      expect(userService.upgradeSubscription).toHaveBeenCalled();
    });

    it('should handle customer.subscription.deleted event', async () => {
      vi.mocked(userService.updateUser).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'cancelled',
          subscriptionTier: 'free',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            metadata: { userId: '1' },
          },
        },
      };

      const result = await paymentService.handleStripeWebhook(
        JSON.stringify(event),
        'mock_signature'
      );

      expect(result.success).toBe(true);
      expect(userService.updateUser).toHaveBeenCalledWith(1, {
        subscriptionStatus: 'cancelled',
        subscriptionTier: 'free',
      });
    });

    it('should handle unrecognized event types gracefully', async () => {
      const event = {
        type: 'unknown.event.type',
        data: { object: {} },
      };

      const result = await paymentService.handleStripeWebhook(
        JSON.stringify(event),
        'mock_signature'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel active subscription', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'stripe',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date('2025-01-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      vi.mocked(userService.updateUser).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'cancelled',
          subscriptionTier: 'paid',
          paymentProvider: 'stripe',
          paymentId: 'sub_123',
          subscriptionExpiresAt: new Date('2025-01-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.cancelSubscription(1);

      expect(result.success).toBe(true);
      expect(userService.updateUser).toHaveBeenCalledWith(1, {
        subscriptionStatus: 'cancelled',
      });
    });

    it('should reject cancellation for free tier user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'inactive',
          subscriptionTier: 'free',
          paymentProvider: null,
          paymentId: null,
          subscriptionExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.cancelSubscription(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active subscription');
    });
  });
});
