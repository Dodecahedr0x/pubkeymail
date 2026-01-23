/**
 * Payment Service Tests
 * Tests for Solana Pay payment processing (USDC only)
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
    it('should return true for solana_pay when configured', () => {
      expect(paymentService.isProviderAvailable('solana_pay')).toBe(true);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return solana_pay when configured', () => {
      const providers = paymentService.getAvailableProviders();
      expect(providers).toContain('solana_pay');
      expect(providers).toHaveLength(1);
    });
  });

  describe('getPricing', () => {
    it('should return monthly pricing of $2 USDC', () => {
      const pricing = paymentService.getPricing('monthly');
      expect(pricing.amount).toBe(2);
      expect(pricing.currency).toBe('usdc');
    });

    it('should return yearly pricing of $15 USDC', () => {
      const pricing = paymentService.getPricing('yearly');
      expect(pricing.amount).toBe(15);
      expect(pricing.currency).toBe('usdc');
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
      expect(result.data?.amount).toBe(2);
      expect(result.data?.splToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(result.data?.reference).toBeDefined();
      expect(result.data?.memo).toContain('user:1:plan:monthly');
    });

    it('should create yearly payment request with $15', async () => {
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
      expect(result.data?.amount).toBe(15);
      expect(result.data?.message).toContain('Yearly');
    });

    it('should reject for non-existent user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await paymentService.createSolanaPayRequest(999, 'monthly');

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });
  });

  describe('verifySolanaPayTransaction', () => {
    it('should verify transaction and upgrade user', async () => {
      vi.mocked(userService.upgradeSubscription).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          primaryAddressId: 1,
          primaryAddress: 'TestAddress',
          blockchain: 'solana',
          subscriptionStatus: 'active',
          subscriptionTier: 'paid',
          paymentProvider: 'solana_pay',
          paymentId: 'tx_signature_123',
          subscriptionExpiresAt: new Date('2025-01-01'),
          createdAt: new Date(),
          updatedAt: new Date(),
          linkedAddresses: [],
        },
      });

      const result = await paymentService.verifySolanaPayTransaction(
        'ref_123',
        'tx_signature_123',
        1,
        'monthly'
      );

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('tx_signature_123');
      expect(userService.upgradeSubscription).toHaveBeenCalledWith(
        1,
        'solana_pay',
        'tx_signature_123',
        expect.any(Date)
      );
    });

    it('should verify transaction without user upgrade when not provided', async () => {
      const result = await paymentService.verifySolanaPayTransaction(
        'ref_123',
        'tx_signature_123'
      );

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('tx_signature_123');
      expect(userService.upgradeSubscription).not.toHaveBeenCalled();
    });
  });

  describe('getSolanaPayStatus', () => {
    it('should return payment status', async () => {
      const result = await paymentService.getSolanaPayStatus('ref_123');

      expect(result.success).toBe(true);
      expect(result.data?.reference).toBe('ref_123');
      expect(result.data?.status).toBe('pending');
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
          paymentProvider: 'solana_pay',
          paymentId: 'tx_123',
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
          paymentProvider: 'solana_pay',
          paymentId: 'tx_123',
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

    it('should reject cancellation for non-existent user', async () => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await paymentService.cancelSubscription(999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });
  });
});
