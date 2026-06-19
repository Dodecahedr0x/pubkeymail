import bs58 from 'bs58';
import { FindReferenceError } from '@solana/pay';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../src/database/connection.js';
import { PaymentService } from '../../../src/services/payment/payment-service.js';
import { userService } from '../../../src/services/user/index.js';

vi.mock('../../../src/database/connection.js', () => ({
  db: { query: vi.fn() },
}));

vi.mock('../../../src/services/user/index.js', () => ({
  userService: {
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    upgradeSubscription: vi.fn(),
  },
}));

const { MERCHANT, REFERENCE, USDC_MINT, CONFIG } = vi.hoisted(() => ({
  MERCHANT: '11111111111111111111111111111111',
  REFERENCE: 'So11111111111111111111111111111111111111112',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  CONFIG: {
    SOLANA_PAY_MERCHANT_WALLET: '11111111111111111111111111111111' as string | undefined,
    SOLANA_PAY_USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    SOLANA_PAY_REQUEST_EXPIRATION_SECONDS: 900,
    SOLANA_RPC_ENDPOINT: 'https://api.devnet.solana.com',
  },
}));
const SIGNATURE = bs58.encode(new Uint8Array(64).fill(7));
const NOW = new Date('2026-06-19T10:00:00.000Z');

vi.mock('../../../src/config/index.js', () => ({
  config: CONFIG,
}));

const user = {
  id: 1,
  primaryAddressId: 1,
  primaryAddress: 'TestAddress',
  blockchain: 'solana' as const,
  subscriptionStatus: 'inactive' as const,
  subscriptionTier: 'free' as const,
  paymentProvider: null,
  paymentId: null,
  subscriptionExpiresAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  linkedAddresses: [],
};

function paymentRow(
  overrides: Partial<{
    status: 'pending' | 'confirmed' | 'expired' | 'failed';
    signature: string | null;
    expires_at: Date;
    confirmed_at: Date | null;
  }> = {}
) {
  return {
    reference: REFERENCE,
    user_id: 1,
    plan: 'monthly' as const,
    amount: '2.00',
    status: overrides.status ?? 'pending',
    signature: overrides.signature ?? null,
    created_at: NOW,
    expires_at: overrides.expires_at ?? new Date(NOW.getTime() + 15 * 60 * 1000),
    confirmed_at: overrides.confirmed_at ?? null,
  };
}

describe('PaymentService', () => {
  const gateway = {
    encodeURL: vi.fn(() => new URL('solana:test-payment')),
    findReference: vi.fn(),
    validateTransfer: vi.fn(),
  };
  let service: PaymentService;

  beforeEach(() => {
    CONFIG.SOLANA_PAY_MERCHANT_WALLET = MERCHANT;
    service = new PaymentService({
      gateway,
      now: () => new Date(NOW),
      referenceFactory: () => REFERENCE,
    });
    vi.mocked(db.query).mockReset();
    gateway.encodeURL.mockClear();
    gateway.findReference.mockReset();
    gateway.validateTransfer.mockReset();
    vi.mocked(userService.getUserById).mockReset();
    vi.mocked(userService.updateUser).mockReset();
    vi.mocked(userService.upgradeSubscription).mockReset();
  });

  it('advertises Solana Pay only when valid configuration is present', () => {
    expect(service.isProviderAvailable('solana_pay')).toBe(true);
    expect(service.getAvailableProviders()).toEqual(['solana_pay']);
  });

  it('disables Solana Pay when merchant configuration is missing or invalid', () => {
    CONFIG.SOLANA_PAY_MERCHANT_WALLET = undefined;
    expect(new PaymentService({ gateway }).getAvailableProviders()).toEqual([]);

    CONFIG.SOLANA_PAY_MERCHANT_WALLET = 'invalid';
    expect(new PaymentService({ gateway }).isProviderAvailable('solana_pay')).toBe(false);
  });

  it('rejects payment operations when Solana Pay is disabled', async () => {
    CONFIG.SOLANA_PAY_MERCHANT_WALLET = undefined;
    const disabled = new PaymentService({ gateway });

    await expect(disabled.createSolanaPayRequest(1, 'monthly')).resolves.toEqual({
      success: false,
      error: 'Solana Pay is not configured',
    });
    await expect(disabled.verifySolanaPayTransaction(REFERENCE, SIGNATURE)).resolves.toEqual({
      success: false,
      error: 'Solana Pay is not configured',
    });
    await expect(disabled.getSolanaPayStatus(REFERENCE)).resolves.toEqual({
      success: false,
      error: 'Solana Pay is not configured',
    });
  });

  it('returns USDC subscription pricing', () => {
    expect(service.getPricing('monthly')).toEqual({ amount: 2, currency: 'usdc' });
    expect(service.getPricing('yearly')).toEqual({ amount: 15, currency: 'usdc' });
  });

  it('persists and encodes a standard Solana Pay transfer request', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({ success: true, data: user });
    vi.mocked(db.query).mockResolvedValue({
      rows: [paymentRow()],
      rowCount: 1,
    } as never);

    const result = await service.createSolanaPayRequest(1, 'monthly');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      reference: REFERENCE,
      recipient: MERCHANT,
      amount: 2,
      splToken: USDC_MINT,
      url: 'solana:test-payment',
      expiresAt: new Date('2026-06-19T10:15:00.000Z'),
    });
    expect(result.data?.memo).toBe(`user:1:plan:monthly:ref:${REFERENCE}`);
    expect(gateway.encodeURL).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: MERCHANT,
        reference: REFERENCE,
        splToken: USDC_MINT,
        amount: 2,
      })
    );
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO payment_requests'), [
      REFERENCE,
      1,
      'monthly',
      2,
      'pending',
      expect.any(Date),
    ]);
  });

  it('rejects request creation for an unknown user', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      success: false,
      error: 'User not found',
    });

    await expect(service.createSolanaPayRequest(999, 'monthly')).resolves.toEqual({
      success: false,
      error: 'User not found',
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('reports persistence failure when the request row is not returned', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({ success: true, data: user });
    vi.mocked(db.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(service.createSolanaPayRequest(1, 'yearly')).resolves.toEqual({
      success: false,
      error: 'Failed to persist payment request',
    });
  });

  it('validates the exact transfer before activating the subscription', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [paymentRow()], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [
          paymentRow({
            status: 'confirmed',
            signature: SIGNATURE,
            confirmed_at: NOW,
          }),
        ],
        rowCount: 1,
      } as never);
    gateway.validateTransfer.mockResolvedValue({} as never);
    vi.mocked(userService.upgradeSubscription).mockResolvedValue({
      success: true,
      data: { ...user, subscriptionStatus: 'active', subscriptionTier: 'paid' },
    });

    const result = await service.verifySolanaPayTransaction(REFERENCE, SIGNATURE);

    expect(result).toEqual({ success: true, paymentId: SIGNATURE });
    expect(gateway.validateTransfer).toHaveBeenCalledWith(
      SIGNATURE,
      {
        recipient: MERCHANT,
        amount: 2,
        splToken: USDC_MINT,
        reference: REFERENCE,
        memo: `user:1:plan:monthly:ref:${REFERENCE}`,
      },
      { commitment: 'confirmed' }
    );
    expect(userService.upgradeSubscription).toHaveBeenCalledWith(
      1,
      'solana_pay',
      SIGNATURE,
      new Date('2026-07-19T10:00:00.000Z')
    );
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('WHERE reference = $1 AND status = $5'),
      [REFERENCE, 'confirmed', SIGNATURE, NOW, 'pending']
    );
  });

  it('activates yearly subscriptions for one year', async () => {
    const yearly = { ...paymentRow(), plan: 'yearly' as const, amount: '15.00' };
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [yearly], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            ...yearly,
            status: 'confirmed',
            signature: SIGNATURE,
            confirmed_at: NOW,
          },
        ],
        rowCount: 1,
      } as never);
    gateway.validateTransfer.mockResolvedValue({} as never);
    vi.mocked(userService.upgradeSubscription).mockResolvedValue({
      success: true,
      data: { ...user, subscriptionStatus: 'active', subscriptionTier: 'paid' },
    });

    await service.verifySolanaPayTransaction(REFERENCE, SIGNATURE);

    expect(userService.upgradeSubscription).toHaveBeenCalledWith(
      1,
      'solana_pay',
      SIGNATURE,
      new Date('2027-06-19T10:00:00.000Z')
    );
  });

  it('rejects malformed signatures before querying payment state', async () => {
    await expect(service.verifySolanaPayTransaction(REFERENCE, 'not-a-signature')).resolves.toEqual(
      {
        success: false,
        error: 'Invalid Solana transaction signature',
      }
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(gateway.validateTransfer).not.toHaveBeenCalled();
  });

  it('rejects unknown and already-completed payment requests', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(service.verifySolanaPayTransaction(REFERENCE, SIGNATURE)).resolves.toEqual({
      success: false,
      error: 'Payment request not found',
    });

    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [paymentRow({ status: 'confirmed', signature: 'different' })],
      rowCount: 1,
    } as never);
    await expect(service.verifySolanaPayTransaction(REFERENCE, SIGNATURE)).resolves.toEqual({
      success: false,
      error: 'Payment request is already completed',
    });
  });

  it('does not activate a subscription when SDK validation fails', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [paymentRow()],
      rowCount: 1,
    } as never);
    gateway.validateTransfer.mockRejectedValue(new Error('amount not transferred'));

    await expect(service.verifySolanaPayTransaction(REFERENCE, SIGNATURE)).resolves.toEqual({
      success: false,
      error: 'amount not transferred',
    });
    expect(userService.upgradeSubscription).not.toHaveBeenCalled();
  });

  it('does not confirm the request when subscription activation fails', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [paymentRow()],
      rowCount: 1,
    } as never);
    gateway.validateTransfer.mockResolvedValue({} as never);
    vi.mocked(userService.upgradeSubscription).mockResolvedValue({
      success: false,
      error: 'upgrade failed',
    });

    await expect(service.verifySolanaPayTransaction(REFERENCE, SIGNATURE)).resolves.toEqual({
      success: false,
      error: 'upgrade failed',
    });
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('expires stale requests without validating a transfer', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({
        rows: [paymentRow({ expires_at: new Date(NOW.getTime() - 1) })],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await service.verifySolanaPayTransaction(REFERENCE, SIGNATURE);

    expect(result).toEqual({ success: false, error: 'Payment request is expired' });
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('UPDATE payment_requests'), [
      REFERENCE,
      'expired',
      'pending',
    ]);
    expect(gateway.validateTransfer).not.toHaveBeenCalled();
  });

  it('returns an idempotent success for the same confirmed signature', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [paymentRow({ status: 'confirmed', signature: SIGNATURE })],
      rowCount: 1,
    } as never);

    await expect(service.verifySolanaPayTransaction(REFERENCE, SIGNATURE)).resolves.toEqual({
      success: true,
      paymentId: SIGNATURE,
    });
    expect(gateway.validateTransfer).not.toHaveBeenCalled();
    expect(userService.upgradeSubscription).not.toHaveBeenCalled();
  });

  it('reports confirmed request status from persisted state', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [
        paymentRow({
          status: 'confirmed',
          signature: SIGNATURE,
          confirmed_at: NOW,
        }),
      ],
      rowCount: 1,
    } as never);

    const result = await service.getSolanaPayStatus(REFERENCE);

    expect(result).toEqual({
      success: true,
      data: {
        reference: REFERENCE,
        status: 'completed',
        createdAt: NOW,
        completedAt: NOW,
      },
    });
  });

  it('marks an expired pending request during status polling', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({
        rows: [paymentRow({ expires_at: new Date(NOW.getTime() - 1) })],
        rowCount: 1,
      } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await service.getSolanaPayStatus(REFERENCE);

    expect(result.data?.status).toBe('expired');
    expect(gateway.findReference).not.toHaveBeenCalled();
  });

  it('returns not found and failed status errors from persisted state', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(service.getSolanaPayStatus(REFERENCE)).resolves.toEqual({
      success: false,
      error: 'Payment request not found',
    });

    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [paymentRow({ status: 'failed' })],
      rowCount: 1,
    } as never);
    await expect(service.getSolanaPayStatus(REFERENCE)).resolves.toEqual({
      success: false,
      error: 'Payment request failed',
    });
  });

  it('keeps status pending when no referenced transaction exists', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [paymentRow()],
      rowCount: 1,
    } as never);
    gateway.findReference.mockRejectedValue(new FindReferenceError('not found'));

    const result = await service.getSolanaPayStatus(REFERENCE);

    expect(result.data?.status).toBe('pending');
    expect(gateway.findReference).toHaveBeenCalledWith(REFERENCE, {
      commitment: 'confirmed',
    });
  });

  it('discovers, validates, and completes a referenced transaction while polling', async () => {
    const confirmed = paymentRow({
      status: 'confirmed',
      signature: SIGNATURE,
      confirmed_at: NOW,
    });
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [paymentRow()], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [paymentRow()], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [confirmed], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [confirmed], rowCount: 1 } as never);
    gateway.findReference.mockResolvedValue({ signature: SIGNATURE } as never);
    gateway.validateTransfer.mockResolvedValue({} as never);
    vi.mocked(userService.upgradeSubscription).mockResolvedValue({
      success: true,
      data: { ...user, subscriptionStatus: 'active', subscriptionTier: 'paid' },
    });

    const result = await service.getSolanaPayStatus(REFERENCE);

    expect(result.data).toMatchObject({
      reference: REFERENCE,
      status: 'completed',
      completedAt: NOW,
    });
    expect(gateway.validateTransfer).toHaveBeenCalledOnce();
    expect(userService.upgradeSubscription).toHaveBeenCalledOnce();
  });

  it('cancels an active subscription', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      success: true,
      data: { ...user, subscriptionStatus: 'active', subscriptionTier: 'paid' },
    });
    vi.mocked(userService.updateUser).mockResolvedValue({
      success: true,
      data: { ...user, subscriptionStatus: 'cancelled', subscriptionTier: 'paid' },
    });

    await expect(service.cancelSubscription(1)).resolves.toEqual({ success: true });
    expect(userService.updateUser).toHaveBeenCalledWith(1, {
      subscriptionStatus: 'cancelled',
    });
  });

  it('rejects cancellation without an active paid subscription', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({ success: true, data: user });

    await expect(service.cancelSubscription(1)).resolves.toEqual({
      success: false,
      error: 'No active subscription to cancel',
    });
    expect(userService.updateUser).not.toHaveBeenCalled();
  });

  it('returns the subscription update error when cancellation fails', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({
      success: true,
      data: { ...user, subscriptionStatus: 'active', subscriptionTier: 'paid' },
    });
    vi.mocked(userService.updateUser).mockResolvedValue({
      success: false,
      error: 'update failed',
    });

    await expect(service.cancelSubscription(1)).resolves.toEqual({
      success: false,
      error: 'update failed',
    });
  });
});
