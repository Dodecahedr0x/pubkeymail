/**
 * Encryption Service Tests
 * Tests for X25519 key pair generation and email encryption/decryption
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from '../../../src/services/encryption/encryption-service.js';
import { db } from '../../../src/database/connection.js';

vi.mock('../../../src/database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    vi.clearAllMocks();
  });

  describe('generateKeyPair', () => {
    it('should generate a valid X25519 key pair', async () => {
      const keyPair = await encryptionService.generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toHaveLength(64);
      expect(keyPair.privateKey).toHaveLength(64);
    });

    it('should generate hex-encoded keys', async () => {
      const keyPair = await encryptionService.generateKeyPair();

      expect(keyPair.publicKey).toMatch(/^[0-9a-f]{64}$/);
      expect(keyPair.privateKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique key pairs on each call', async () => {
      const keyPair1 = await encryptionService.generateKeyPair();
      const keyPair2 = await encryptionService.generateKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe('encryptEmail', () => {
    it('should encrypt plaintext with recipient public key', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Hello, this is a secret message!';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.ephemeralPublicKey).toBeDefined();
    });

    it('should return base64-encoded ciphertext', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Test message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      expect(() => Buffer.from(encrypted.ciphertext, 'base64')).not.toThrow();
    });

    it('should return hex-encoded nonce (48 chars = 24 bytes)', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Test message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      expect(encrypted.nonce).toHaveLength(48);
      expect(encrypted.nonce).toMatch(/^[0-9a-f]{48}$/);
    });

    it('should return hex-encoded ephemeral public key (64 chars = 32 bytes)', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Test message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      expect(encrypted.ephemeralPublicKey).toHaveLength(64);
      expect(encrypted.ephemeralPublicKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique ephemeral keys for each encryption', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Same message';

      const encrypted1 = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );
      const encrypted2 = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      expect(encrypted1.ephemeralPublicKey).not.toBe(encrypted2.ephemeralPublicKey);
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('should throw error for invalid public key length', async () => {
      const invalidPublicKey = 'abc123';
      const plaintext = 'Test message';

      await expect(
        encryptionService.encryptEmail(plaintext, invalidPublicKey)
      ).rejects.toThrow('Invalid recipient public key length');
    });

    it('should handle empty plaintext', async () => {
      const keyPair = await encryptionService.generateKeyPair();

      const encrypted = await encryptionService.encryptEmail('', keyPair.publicKey);

      expect(encrypted.ciphertext).toBeDefined();
    });

    it('should handle unicode plaintext', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = '你好世界 🌍 مرحبا';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      expect(encrypted.ciphertext).toBeDefined();
    });
  });

  describe('decryptEmail', () => {
    it('should decrypt ciphertext with recipient private key', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Hello, this is a secret message!';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );
      const decrypted = await encryptionService.decryptEmail(
        encrypted,
        keyPair.privateKey
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should handle round-trip encryption/decryption for various messages', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const messages = [
        'Short',
        'A longer message with more content to encrypt',
        'Special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>?/',
        '你好世界 🌍 مرحبا',
        'Multi\nLine\nMessage\n\nWith paragraphs',
      ];

      for (const message of messages) {
        const encrypted = await encryptionService.encryptEmail(
          message,
          keyPair.publicKey
        );
        const decrypted = await encryptionService.decryptEmail(
          encrypted,
          keyPair.privateKey
        );
        expect(decrypted).toBe(message);
      }
    });

    it('should throw error for invalid private key', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const wrongKeyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Secret message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      await expect(
        encryptionService.decryptEmail(encrypted, wrongKeyPair.privateKey)
      ).rejects.toThrow('Decryption failed');
    });

    it('should throw error for tampered ciphertext', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Secret message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      const tamperedEncrypted = {
        ...encrypted,
        ciphertext: Buffer.from('tampered').toString('base64'),
      };

      await expect(
        encryptionService.decryptEmail(tamperedEncrypted, keyPair.privateKey)
      ).rejects.toThrow('Decryption failed');
    });

    it('should throw error for invalid nonce length', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Secret message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      const invalidEncrypted = {
        ...encrypted,
        nonce: 'abc123',
      };

      await expect(
        encryptionService.decryptEmail(invalidEncrypted, keyPair.privateKey)
      ).rejects.toThrow('Invalid nonce length');
    });

    it('should throw error for invalid ephemeral public key length', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Secret message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      const invalidEncrypted = {
        ...encrypted,
        ephemeralPublicKey: 'short',
      };

      await expect(
        encryptionService.decryptEmail(invalidEncrypted, keyPair.privateKey)
      ).rejects.toThrow('Invalid ephemeral public key length');
    });

    it('should throw error for invalid private key length', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Secret message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      await expect(
        encryptionService.decryptEmail(encrypted, 'invalidkey')
      ).rejects.toThrow('Invalid recipient private key length');
    });

    it('should handle empty encrypted content round-trip', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = '';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );
      const decrypted = await encryptionService.decryptEmail(
        encrypted,
        keyPair.privateKey
      );

      expect(decrypted).toBe('');
    });
  });

  describe('storeUserPublicKey', () => {
    it('should store user public key in database', async () => {
      const userId = 1;
      const publicKey =
        'a'.repeat(64);

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await encryptionService.storeUserPublicKey(userId, publicKey);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_encryption_keys'),
        [userId, publicKey]
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });

    it('should use upsert for existing keys', async () => {
      const userId = 1;
      const publicKey = 'b'.repeat(64);

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await encryptionService.storeUserPublicKey(userId, publicKey);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DO UPDATE SET'),
        expect.any(Array)
      );
    });

    it('should throw error for invalid public key length', async () => {
      const userId = 1;
      const invalidPublicKey = 'tooshort';

      await expect(
        encryptionService.storeUserPublicKey(userId, invalidPublicKey)
      ).rejects.toThrow('Invalid public key length');
    });
  });

  describe('getUserPublicKey', () => {
    it('should return public key for existing user', async () => {
      const userId = 1;
      const publicKey = 'c'.repeat(64);

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ public_key: publicKey }],
      });

      const result = await encryptionService.getUserPublicKey(userId);

      expect(result).toBe(publicKey);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT public_key FROM user_encryption_keys'),
        [userId]
      );
    });

    it('should return null for user without encryption key', async () => {
      const userId = 999;

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      const result = await encryptionService.getUserPublicKey(userId);

      expect(result).toBeNull();
    });
  });

  describe('getPublicKeyByAddress', () => {
    it('should return public key for valid blockchain address', async () => {
      const address = 'TestAddress123';
      const publicKey = 'd'.repeat(64);

      vi.mocked(db.query).mockResolvedValueOnce({
        rows: [{ public_key: publicKey }],
      });

      const result = await encryptionService.getPublicKeyByAddress(address);

      expect(result).toBe(publicKey);
    });

    it('should join users and blockchain_addresses tables', async () => {
      const address = 'TestAddress123';

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      await encryptionService.getPublicKeyByAddress(address);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN users'),
        [address]
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN blockchain_addresses'),
        [address]
      );
    });

    it('should use case-sensitive collation for address lookup', async () => {
      const address = 'CaseSensitiveAddress';

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      await encryptionService.getPublicKeyByAddress(address);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('COLLATE "C"'),
        [address]
      );
    });

    it('should return null for non-existent address', async () => {
      const address = 'NonExistentAddress';

      vi.mocked(db.query).mockResolvedValueOnce({ rows: [] });

      const result = await encryptionService.getPublicKeyByAddress(address);

      expect(result).toBeNull();
    });
  });

  describe('encryption algorithm', () => {
    it('should produce ciphertext larger than plaintext due to auth tag', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const plaintext = 'Test message';

      const encrypted = await encryptionService.encryptEmail(
        plaintext,
        keyPair.publicKey
      );

      const ciphertextBytes = Buffer.from(encrypted.ciphertext, 'base64');
      const plaintextBytes = Buffer.from(plaintext, 'utf8');

      expect(ciphertextBytes.length).toBeGreaterThan(plaintextBytes.length);
    });

    it('should work with large email content', async () => {
      const keyPair = await encryptionService.generateKeyPair();
      const largePlaintext = 'x'.repeat(100000);

      const encrypted = await encryptionService.encryptEmail(
        largePlaintext,
        keyPair.publicKey
      );
      const decrypted = await encryptionService.decryptEmail(
        encrypted,
        keyPair.privateKey
      );

      expect(decrypted).toBe(largePlaintext);
    });
  });
});
