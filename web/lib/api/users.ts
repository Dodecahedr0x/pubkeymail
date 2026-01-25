import { apiRequest } from './client';

export interface User {
  id: number;
  primaryAddress: string;
  blockchain: string;
  subscriptionStatus: string;
  subscriptionTier: 'free' | 'paid';
  createdAt: string;
  linkedAddresses?: Array<{
    address: string;
    blockchain: string;
    verifiedAt: string;
  }>;
}

export async function checkAddress(address: string) {
  return apiRequest<{ registered: boolean }>(`/users/check/${address}`);
}

export async function registerUser(address: string, blockchain = 'solana') {
  return apiRequest<{ user: User }>('/users/register', {
    method: 'POST',
    body: JSON.stringify({ address, blockchain }),
  });
}

export async function getProfile(address: string) {
  return apiRequest<{ user: User }>(`/users/profile/${address}`);
}

export async function linkAddress(userId: number, address: string, blockchain = 'solana') {
  return apiRequest<{ linkedAddress: { id: number; address: string; blockchain: string; verifiedAt: string } }>(
    `/users/${userId}/link-address`,
    { method: 'POST', body: JSON.stringify({ address, blockchain }) }
  );
}

export async function unlinkAddress(userId: number, addressId: number) {
  return apiRequest<{ message: string }>(
    `/users/${userId}/addresses/${addressId}`,
    { method: 'DELETE' }
  );
}
