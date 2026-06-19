/**
 * Solana Pay subscription payments backed by persistent payment requests.
 */

import bs58 from 'bs58';
import {
  createMerchantClient,
  FindReferenceError,
  type MerchantClient,
  type TransferFields,
  type TransferRequestURLFields,
} from '@solana/pay';
import { address, type Signature } from '@solana/kit';
import { Keypair } from '@solana/web3.js';
import { config } from '../../config/index.js';
import { db } from '../../database/connection.js';
import { userService } from '../user/index.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('PaymentService');

export type PaymentProviderType = 'solana_pay';
export type SubscriptionPlan = 'monthly' | 'yearly';
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

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

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  subscriptionId?: string;
  error?: string;
}

export interface SolanaPayRequest {
  reference: string;
  recipient: string;
  amount: number;
  splToken: string;
  label: string;
  message: string;
  memo: string;
  url: string;
  expiresAt: Date;
}

export interface SolanaPayStatus {
  reference: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: Date;
  completedAt?: Date;
}

interface PaymentRequestRow {
  reference: string;
  user_id: number;
  plan: SubscriptionPlan;
  amount: string | number;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  signature: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  confirmed_at: Date | string | null;
}

type SolanaPayGateway = Pick<
  MerchantClient['pay'],
  'encodeURL' | 'findReference' | 'validateTransfer'
>;

export interface PaymentServiceOptions {
  gateway?: SolanaPayGateway;
  now?: () => Date;
  referenceFactory?: () => string;
}

const PRICING = {
  monthly: 2,
  yearly: 15,
} as const;

export class PaymentService {
  private readonly solanaPayEnabled: boolean;
  private readonly now: () => Date;
  private readonly referenceFactory: () => string;
  private gateway?: SolanaPayGateway;

  constructor(options: PaymentServiceOptions = {}) {
    this.gateway = options.gateway;
    this.now = options.now ?? (() => new Date());
    this.referenceFactory =
      options.referenceFactory ?? (() => Keypair.generate().publicKey.toBase58());
    this.solanaPayEnabled = this.hasValidConfiguration();
  }

  isProviderAvailable(provider: PaymentProviderType): boolean {
    return provider === 'solana_pay' && this.solanaPayEnabled;
  }

  getAvailableProviders(): PaymentProviderType[] {
    return this.solanaPayEnabled ? ['solana_pay'] : [];
  }

  getPricing(plan: SubscriptionPlan): { amount: number; currency: string } {
    return { amount: PRICING[plan], currency: 'usdc' };
  }

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

      const recipient = address(config.SOLANA_PAY_MERCHANT_WALLET!);
      const splToken = address(config.SOLANA_PAY_USDC_MINT);
      const reference = address(this.referenceFactory());
      const amount = PRICING[plan];
      const memo = this.createMemo(userId, plan, reference);
      const expiresAt = new Date(
        this.now().getTime() + config.SOLANA_PAY_REQUEST_EXPIRATION_SECONDS * 1000
      );
      const fields: TransferRequestURLFields = {
        recipient,
        amount,
        splToken,
        reference,
        label: 'PubKeyMail',
        message: `${this.capitalize(plan)} subscription`,
        memo,
      };

      const inserted = await db.query<PaymentRequestRow>(
        `INSERT INTO payment_requests
           (reference, user_id, plan, amount, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING reference, user_id, plan, amount, status, signature,
                   created_at, expires_at, confirmed_at`,
        [reference, userId, plan, amount, 'pending', expiresAt]
      );

      if (!inserted.rows[0]) {
        return { success: false, error: 'Failed to persist payment request' };
      }

      return {
        success: true,
        data: {
          reference,
          recipient,
          amount,
          splToken,
          label: fields.label!,
          message: fields.message!,
          memo,
          url: this.getGateway().encodeURL(fields).toString(),
          expiresAt,
        },
      };
    } catch (error) {
      log.error('Failed to create Solana Pay request', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Solana Pay request failed',
      };
    }
  }

  async verifySolanaPayTransaction(reference: string, signature: string): Promise<PaymentResult> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    try {
      if (!this.isValidSignature(signature)) {
        return { success: false, error: 'Invalid Solana transaction signature' };
      }

      const request = await this.getPaymentRequest(reference);
      if (!request) {
        return { success: false, error: 'Payment request not found' };
      }

      if (request.status === 'confirmed') {
        return request.signature === signature
          ? { success: true, paymentId: signature }
          : { success: false, error: 'Payment request is already completed' };
      }

      if (request.status !== 'pending') {
        return { success: false, error: `Payment request is ${request.status}` };
      }

      if (this.isExpired(request)) {
        await this.markExpired(reference);
        return { success: false, error: 'Payment request is expired' };
      }

      const fields = this.createTransferFields(request);
      await this.getGateway().validateTransfer(signature as Signature, fields, {
        commitment: 'confirmed',
      });

      const expiresAt = this.subscriptionExpiration(request.plan);
      const upgrade = await userService.upgradeSubscription(
        request.user_id,
        'solana_pay',
        signature,
        expiresAt
      );
      if (!upgrade.success) {
        return { success: false, error: upgrade.error };
      }

      const confirmedAt = this.now();
      const updated = await db.query<PaymentRequestRow>(
        `UPDATE payment_requests
         SET status = $2, signature = $3, confirmed_at = $4
         WHERE reference = $1 AND status = $5
         RETURNING reference, user_id, plan, amount, status, signature,
                   created_at, expires_at, confirmed_at`,
        [reference, 'confirmed', signature, confirmedAt, 'pending']
      );

      if (!updated.rows[0]) {
        const current = await this.getPaymentRequest(reference);
        if (current?.status === 'confirmed' && current.signature === signature) {
          return { success: true, paymentId: signature };
        }
        return { success: false, error: 'Payment request changed during verification' };
      }

      log.info('Solana Pay transfer confirmed', {
        reference,
        signature,
        userId: request.user_id,
        plan: request.plan,
      });
      return { success: true, paymentId: signature };
    } catch (error) {
      log.warn('Solana Pay verification failed', { reference, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction verification failed',
      };
    }
  }

  async getSolanaPayStatus(
    reference: string
  ): Promise<{ success: boolean; data?: SolanaPayStatus; error?: string }> {
    if (!this.solanaPayEnabled) {
      return { success: false, error: 'Solana Pay is not configured' };
    }

    try {
      let request = await this.getPaymentRequest(reference);
      if (!request) {
        return { success: false, error: 'Payment request not found' };
      }

      if (request.status === 'pending' && this.isExpired(request)) {
        await this.markExpired(reference);
        request = { ...request, status: 'expired' };
      }

      if (request.status === 'pending') {
        try {
          const found = await this.getGateway().findReference(address(reference), {
            commitment: 'confirmed',
          });
          const verified = await this.verifySolanaPayTransaction(
            reference,
            String(found.signature)
          );
          if (verified.success) {
            request = (await this.getPaymentRequest(reference)) ?? request;
          }
        } catch (error) {
          if (!(error instanceof FindReferenceError)) {
            throw error;
          }
        }
      }

      if (request.status === 'failed') {
        return { success: false, error: 'Payment request failed' };
      }

      return {
        success: true,
        data: {
          reference: request.reference,
          status: request.status === 'confirmed' ? 'completed' : request.status,
          createdAt: new Date(request.created_at),
          ...(request.confirmed_at ? { completedAt: new Date(request.confirmed_at) } : {}),
        },
      };
    } catch (error) {
      log.error('Failed to get Solana Pay status', { reference, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get payment status',
      };
    }
  }

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
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cancellation failed',
      };
    }
  }

  private hasValidConfiguration(): boolean {
    if (!config.SOLANA_PAY_MERCHANT_WALLET) return false;
    try {
      address(config.SOLANA_PAY_MERCHANT_WALLET);
      address(config.SOLANA_PAY_USDC_MINT);
      return true;
    } catch (error) {
      log.error('Invalid Solana Pay address configuration', { error });
      return false;
    }
  }

  private getGateway(): SolanaPayGateway {
    if (!this.gateway) {
      this.gateway = createMerchantClient({
        rpcUrl: config.SOLANA_RPC_ENDPOINT,
      }).pay;
    }
    return this.gateway;
  }

  private async getPaymentRequest(reference: string): Promise<PaymentRequestRow | null> {
    const result = await db.query<PaymentRequestRow>(
      `SELECT reference, user_id, plan, amount, status, signature,
              created_at, expires_at, confirmed_at
       FROM payment_requests
       WHERE reference = $1`,
      [reference]
    );
    return result.rows[0] ?? null;
  }

  private async markExpired(reference: string): Promise<void> {
    await db.query(
      `UPDATE payment_requests
       SET status = $2
       WHERE reference = $1 AND status = $3`,
      [reference, 'expired', 'pending']
    );
  }

  private createTransferFields(request: PaymentRequestRow): TransferFields {
    return {
      recipient: address(config.SOLANA_PAY_MERCHANT_WALLET!),
      amount: Number(request.amount),
      splToken: address(config.SOLANA_PAY_USDC_MINT),
      reference: address(request.reference),
      memo: this.createMemo(request.user_id, request.plan, request.reference),
    };
  }

  private createMemo(userId: number, plan: SubscriptionPlan, reference: string): string {
    return `user:${userId}:plan:${plan}:ref:${reference}`;
  }

  private subscriptionExpiration(plan: SubscriptionPlan): Date {
    const expiresAt = this.now();
    if (plan === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }
    return expiresAt;
  }

  private isExpired(request: PaymentRequestRow): boolean {
    return new Date(request.expires_at).getTime() <= this.now().getTime();
  }

  private isValidSignature(signature: string): boolean {
    try {
      return bs58.decode(signature).length === 64;
    } catch {
      return false;
    }
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

export const paymentService = new PaymentService();
