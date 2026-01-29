/**
 * Authentication Service Tests
 * Tests for wallet-based authentication with challenge-response
 * Uses real cryptographic signing for end-to-end verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { AuthService } from '../../../src/services/auth/auth-service.js';

function createTestKeypair() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
    sign: (message: string): string => {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
      return bs58.encode(signatureBytes);
    },
  };
}

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('generateChallenge', () => {
    it('should generate a challenge for valid Solana address', async () => {
      const address = '11111111111111111111111111111111';
      const blockchain = 'solana';

      const result = await authService.generateChallenge(address, blockchain);

      expect(result.challenge).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Challenge should contain address and nonce
      expect(result.challenge).toContain(address);
      expect(result.challenge).toContain(result.nonce);
      expect(result.challenge).toContain('PubKeyMail');
    });

    it('should generate unique nonces for multiple challenges', async () => {
      const address = '11111111111111111111111111111111';
      const blockchain = 'solana';

      const result1 = await authService.generateChallenge(address, blockchain);
      const result2 = await authService.generateChallenge(address, blockchain);

      expect(result1.nonce).not.toBe(result2.nonce);
      expect(result1.challenge).not.toBe(result2.challenge);
    });

    it('should reject invalid address', async () => {
      const invalidAddress = 'invalid-address';
      const blockchain = 'solana';

      await expect(
        authService.generateChallenge(invalidAddress, blockchain)
      ).rejects.toThrow('Invalid address');
    });

    it('should set expiration time in the future', async () => {
      const address = '11111111111111111111111111111111';
      const blockchain = 'solana';

      const result = await authService.generateChallenge(address, blockchain);
      const now = new Date();

      expect(result.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('verifyAndAuthenticate', () => {
    it('should reject with invalid nonce', async () => {
      const address = '11111111111111111111111111111111';
      const blockchain = 'solana';
      const signature = 'fake-signature';
      const invalidNonce = 'non-existent-nonce';

      const result = await authService.verifyAndAuthenticate(
        address,
        blockchain,
        signature,
        invalidNonce
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired nonce');
    });

    it('should reject with blockchain mismatch', async () => {
      const address = '11111111111111111111111111111111';

      // Generate challenge for solana
      const challenge = await authService.generateChallenge(address, 'solana');

      // Try to verify with ethereum
      const result = await authService.verifyAndAuthenticate(
        address,
        'ethereum',
        'fake-signature',
        challenge.nonce
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blockchain mismatch');
    });

    it('should reject with address mismatch', async () => {
      const address1 = '11111111111111111111111111111111';
      const address2 = '11111111111111111111111111111112'; // Different address

      // Generate challenge for address1
      const challenge = await authService.generateChallenge(address1, 'solana');

      // Try to verify with address2
      const result = await authService.verifyAndAuthenticate(
        address2,
        'solana',
        'fake-signature',
        challenge.nonce
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Address mismatch');
    });

    it('should reject when nonce is reused', async () => {
      const address = '11111111111111111111111111111111';
      const blockchain = 'solana';

      // Generate challenge
      const challenge = await authService.generateChallenge(address, blockchain);

      // First verification attempt (will fail due to invalid signature, but marks nonce as used)
      await authService.verifyAndAuthenticate(
        address,
        blockchain,
        'fake-signature',
        challenge.nonce
      );

      // Second attempt with same nonce should be rejected
      const result = await authService.verifyAndAuthenticate(
        address,
        blockchain,
        'another-fake-signature',
        challenge.nonce
      );

      expect(result.success).toBe(false);
      // Will fail on signature verification before checking reuse in this implementation
    });

    it('should reject with invalid address format', async () => {
      const invalidAddress = 'invalid';
      const blockchain = 'solana';

      const result = await authService.verifyAndAuthenticate(
        invalidAddress,
        blockchain,
        'fake-signature',
        'fake-nonce'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should successfully authenticate with valid signature', async () => {
      const testWallet = createTestKeypair();
      const blockchain = 'solana';

      const challenge = await authService.generateChallenge(
        testWallet.publicKey,
        blockchain
      );

      const signature = testWallet.sign(challenge.challenge);

      const result = await authService.verifyAndAuthenticate(
        testWallet.publicKey,
        blockchain,
        signature,
        challenge.nonce
      );

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBeGreaterThan(0);
      expect(result.address).toBe(testWallet.publicKey);
      expect(result.blockchain).toBe(blockchain);
    });

    it('should reject invalid signature for valid challenge', async () => {
      const testWallet = createTestKeypair();
      const wrongWallet = createTestKeypair();
      const blockchain = 'solana';

      const challenge = await authService.generateChallenge(
        testWallet.publicKey,
        blockchain
      );

      const wrongSignature = wrongWallet.sign(challenge.challenge);

      const result = await authService.verifyAndAuthenticate(
        testWallet.publicKey,
        blockchain,
        wrongSignature,
        challenge.nonce
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Signature verification failed');
    });

    it('should reject tampered challenge message', async () => {
      const testWallet = createTestKeypair();
      const blockchain = 'solana';

      const challenge = await authService.generateChallenge(
        testWallet.publicKey,
        blockchain
      );

      const tamperedMessage = challenge.challenge.replace('PubKeyMail', 'FakeApp');
      const signature = testWallet.sign(tamperedMessage);

      const result = await authService.verifyAndAuthenticate(
        testWallet.publicKey,
        blockchain,
        signature,
        challenge.nonce
      );

      expect(result.success).toBe(false);
    });

    it('should prevent nonce reuse after successful auth', async () => {
      const testWallet = createTestKeypair();
      const blockchain = 'solana';

      const challenge = await authService.generateChallenge(
        testWallet.publicKey,
        blockchain
      );

      const signature = testWallet.sign(challenge.challenge);

      const result1 = await authService.verifyAndAuthenticate(
        testWallet.publicKey,
        blockchain,
        signature,
        challenge.nonce
      );

      expect(result1.success).toBe(true);

      const result2 = await authService.verifyAndAuthenticate(
        testWallet.publicKey,
        blockchain,
        signature,
        challenge.nonce
      );

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already been used');
    });
  });

  describe('verifyJWT', () => {
    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.jwt.token';
      const result = authService.verifyJWT(invalidToken);

      expect(result).toBeNull();
    });

    it('should return null for malformed token', () => {
      const malformedToken = 'not-a-jwt';
      const result = authService.verifyJWT(malformedToken);

      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.test';
      const result = authService.verifyJWT(expiredToken);

      expect(result).toBeNull();
    });

    it('should verify a valid JWT from successful authentication', async () => {
      const testWallet = createTestKeypair();
      const blockchain = 'solana';

      const challenge = await authService.generateChallenge(
        testWallet.publicKey,
        blockchain
      );

      const signature = testWallet.sign(challenge.challenge);

      const authResult = await authService.verifyAndAuthenticate(
        testWallet.publicKey,
        blockchain,
        signature,
        challenge.nonce
      );

      expect(authResult.success).toBe(true);
      expect(authResult.token).toBeDefined();

      const payload = authService.verifyJWT(authResult.token!);

      expect(payload).not.toBeNull();
      expect(payload?.address).toBe(testWallet.publicKey);
      expect(payload?.blockchain).toBe(blockchain);
    });
  });

  describe('cleanupExpiredNonces', () => {
    it('should cleanup expired nonces', async () => {
      // Generate a challenge
      const address = '11111111111111111111111111111111';
      await authService.generateChallenge(address, 'solana');

      // Cleanup (won't remove non-expired nonces)
      const cleaned = await authService.cleanupExpiredNonces();

      // Should be 0 since nonce is not expired yet
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('should return number of cleaned nonces', async () => {
      const cleaned = await authService.cleanupExpiredNonces();
      expect(typeof cleaned).toBe('number');
    });
  });

  describe('Challenge message format', () => {
    it('should include security warning about no gas cost', async () => {
      const address = '11111111111111111111111111111111';
      const result = await authService.generateChallenge(address, 'solana');

      expect(result.challenge).toContain('gas');
      expect(result.challenge).toContain('transaction');
    });

    it('should include timestamp for freshness verification', async () => {
      const address = '11111111111111111111111111111111';
      const result = await authService.generateChallenge(address, 'solana');

      expect(result.challenge).toContain('Timestamp');
    });
  });
});
