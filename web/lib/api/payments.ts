import { apiRequest } from './client';

export interface CurrencyPricing {
  amount: number;
  currency: string;
  formatted: string;
}

export interface PlanPricing {
  usd: CurrencyPricing;
  usdc?: CurrencyPricing;
}

export interface Pricing {
  monthly: PlanPricing;
  yearly: PlanPricing;
  savings: {
    yearly: string;
    percentage: number;
  };
}

export interface SolanaPayRequest {
  reference: string;
  recipient: string;
  amount: number;
  splToken: string;
  label: string;
  message: string;
  memo: string;
}

export interface SolanaPayStatus {
  reference: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: string;
  completedAt?: string;
}

export async function getPricing() {
  return apiRequest<Pricing>('/payments/pricing');
}

export async function getProviders() {
  return apiRequest<{ providers: string[]; solana_pay: { available: boolean } }>(
    '/payments/providers'
  );
}

export async function createSolanaPayRequest(userId: number, plan: 'monthly' | 'yearly') {
  return apiRequest<SolanaPayRequest>('/payments/solana-pay/request', {
    method: 'POST',
    body: JSON.stringify({ userId, plan }),
  });
}

export async function verifySolanaPayTransaction(reference: string, signature: string) {
  return apiRequest<{ verified: boolean; paymentId: string }>(
    '/payments/solana-pay/verify',
    {
      method: 'POST',
      body: JSON.stringify({ reference, signature }),
    }
  );
}

export async function getSolanaPayStatus(reference: string) {
  return apiRequest<SolanaPayStatus>(`/payments/solana-pay/status/${reference}`);
}

export async function cancelSubscription(userId: number) {
  return apiRequest<{ message: string }>('/payments/cancel', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}
