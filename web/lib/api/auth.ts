import { apiRequest } from './client';

export interface ChallengeResponse {
  challenge: string;
  nonce: string;
  expiresAt: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
  user: {
    address: string;
    blockchain: string;
  };
}

export async function requestChallenge(address: string, blockchain = 'solana') {
  return apiRequest<ChallengeResponse>('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ address, blockchain }),
  });
}

export async function verifySignature(
  address: string,
  signature: string,
  nonce: string,
  blockchain = 'solana'
) {
  return apiRequest<AuthResponse>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ address, blockchain, signature, nonce }),
  });
}
