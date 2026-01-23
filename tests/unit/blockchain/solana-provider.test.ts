/**
 * Solana Provider Tests
 * Tests for Solana blockchain operations
 *
 * These tests validate:
 * - Address validation and case sensitivity
 * - Signature verification (Ed25519)
 * - SNS resolution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SolanaProvider } from '../../../src/services/blockchain/solana-provider.js';
import { SignatureVerificationError } from '../../../src/types/blockchain.js';

describe('SolanaProvider', () => {
  let provider: SolanaProvider;

  beforeEach(() => {
    // Use devnet for testing
    provider = new SolanaProvider('https://api.devnet.solana.com');
  });

  describe('getBlockchainType', () => {
    it('should return solana as blockchain type', () => {
      expect(provider.getBlockchainType()).toBe('solana');
    });
  });

  describe('validateAddress', () => {
    it('should validate a correct Solana address', async () => {
      const validAddress = '11111111111111111111111111111111';
      const result = await provider.validateAddress(validAddress);

      expect(result.valid).toBe(true);
      expect(result.blockchain).toBe('solana');
      expect(result.normalized).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should validate a real Solana address', async () => {
      // This is a known Solana address (system program)
      const validAddress = '11111111111111111111111111111111';
      const result = await provider.validateAddress(validAddress);

      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(validAddress);
    });

    it('should reject an invalid base58 string', async () => {
      const invalidAddress = 'not-a-valid-base58-address!@#';
      const result = await provider.validateAddress(invalidAddress);

      expect(result.valid).toBe(false);
      expect(result.blockchain).toBe('solana');
      expect(result.error).toBeDefined();
    });

    it('should reject an empty string', async () => {
      const result = await provider.validateAddress('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an address that is too short', async () => {
      const shortAddress = '123';
      const result = await provider.validateAddress(shortAddress);

      expect(result.valid).toBe(false);
    });

    it('should preserve case sensitivity in addresses', async () => {
      // Base58 is case-sensitive
      const address1 = 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A';
      const result1 = await provider.validateAddress(address1);

      expect(result1.valid).toBe(true);
      // Normalized address should preserve exact case
      expect(result1.normalized).toBe(address1);
    });
  });

  describe('verifySignature', () => {
    it('should throw error for invalid address format', async () => {
      const invalidAddress = 'invalid-address';
      const message = 'test message';
      const signature = 'fake-signature';

      await expect(
        provider.verifySignature(message, signature, invalidAddress)
      ).rejects.toThrow(SignatureVerificationError);
    });

    it('should return false for mismatched signature', async () => {
      // Valid address but wrong signature
      const validAddress = '11111111111111111111111111111111';
      const message = 'test message';
      const wrongSignature = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      const result = await provider.verifySignature(
        message,
        wrongSignature,
        validAddress
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid result for signature with bad encoding or size', async () => {
      const validAddress = '11111111111111111111111111111111';
      const message = 'test message';
      const invalidSignature = 'not-base58-or-base64!@#$%';

      const result = await provider.verifySignature(
        message,
        invalidSignature,
        validAddress
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    // Note: Testing valid signature verification requires a real keypair
    // which should be done in integration tests with test fixtures
  });

  describe('resolveNameService', () => {
    it('should reject non-SNS name services', async () => {
      await expect(
        provider.resolveNameService('example.eth', 'ENS')
      ).rejects.toThrow('Unsupported name service for Solana');
    });

    it('should reject names with wrong TLD', async () => {
      await expect(
        provider.resolveNameService('example.eth', 'SNS')
      ).rejects.toThrow();
    });

    // Note: Testing actual SNS resolution requires:
    // 1. A registered SNS domain on devnet/testnet
    // 2. Network access to Solana RPC
    // These should be done in integration tests
  });

  describe('getAddressFromPublicKey', () => {
    it('should return address from valid public key', async () => {
      const publicKey = '11111111111111111111111111111111';
      const address = await provider.getAddressFromPublicKey(publicKey);

      expect(address).toBe(publicKey);
    });

    it('should throw error for invalid public key', async () => {
      const invalidKey = 'invalid-key';

      await expect(
        provider.getAddressFromPublicKey(invalidKey)
      ).rejects.toThrow('Invalid public key');
    });
  });

  describe('isAddressActive', () => {
    it('should return true for system program address', async () => {
      // System program address always exists
      const systemProgram = '11111111111111111111111111111111';
      const isActive = await provider.isAddressActive(systemProgram);

      expect(isActive).toBe(true);
    });

    it('should return false for invalid address', async () => {
      const invalidAddress = 'invalid';
      const isActive = await provider.isAddressActive(invalidAddress);

      expect(isActive).toBe(false);
    });
  });

  describe('getBalance', () => {
    it('should return balance for valid address', async () => {
      const systemProgram = '11111111111111111111111111111111';
      const balance = await provider.getBalance(systemProgram);

      // System program should have some balance (in lamports)
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });

    it('should throw error for invalid address', async () => {
      const invalidAddress = 'invalid';

      await expect(provider.getBalance(invalidAddress)).rejects.toThrow(
        'Failed to get balance'
      );
    });
  });
});
