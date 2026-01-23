import { apiRequest } from './client';

export interface Pricing {
  monthly: {
    usd: { amount: number; formatted: string };
    usdc: { amount: number; formatted: string };
  };
  yearly: {
    usd: { amount: number; formatted: string };
    usdc: { amount: number; formatted: string };
  };
}

export async function getPricing() {
  return apiRequest<Pricing>('/payments/pricing');
}

export async function getProviders() {
  return apiRequest<{ providers: string[] }>('/payments/providers');
}

export async function createStripeCheckout(
  userId: number,
  plan: 'monthly' | 'yearly',
  successUrl: string,
  cancelUrl: string
) {
  return apiRequest<{ sessionId: string; checkoutUrl: string }>(
    '/payments/stripe/checkout',
    { method: 'POST', body: JSON.stringify({ userId, plan, successUrl, cancelUrl }) }
  );
}

export async function createSolanaPayRequest(userId: number, plan: 'monthly' | 'yearly') {
  return apiRequest<{ reference: string; recipient: string; amount: number }>(
    '/payments/solana-pay/request',
    { method: 'POST', body: JSON.stringify({ userId, plan }) }
  );
}
