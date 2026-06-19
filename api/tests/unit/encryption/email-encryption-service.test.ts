/**
 * Email Encryption Service Tests
 * Tests encrypt-for-storage and decrypt-on-retrieval orchestration around the
 * X25519 primitives. Uses generated key pairs — no database required.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EncryptionService } from '../../../src/services/encryption/encryption-service.js';
import {
  EmailEncryptionService,
} from '../../../src/services/encryption/email-encryption-service.js';

const crypto = new EncryptionService();
const service = new EmailEncryptionService(crypto);

let publicKey: string;
let privateKey: string;

beforeAll(async () => {
  const pair = await crypto.generateKeyPair();
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
});

describe('EmailEncryptionService', () => {
  describe('encryptForStorage', () => {
    it('produces an encrypted envelope with metadata', async () => {
      const envelope = await service.encryptForStorage(
        { subject: 'Secret', bodyText: 'Top secret content' },
        publicKey
      );

      expect(envelope.isEncrypted).toBe(true);
      expect(typeof envelope.ciphertext).toBe('string');
      expect(envelope.ciphertext.length).toBeGreaterThan(0);
      expect(envelope.encryptionMetadata.algorithm).toBe('x25519-xsalsa20-poly1305');
      expect(envelope.encryptionMetadata.version).toBe(1);
      expect(envelope.encryptionMetadata.nonce).toMatch(/^[0-9a-f]+$/);
      expect(envelope.encryptionMetadata.ephemeralPublicKey).toMatch(/^[0-9a-f]+$/);
      expect(envelope.encryptionMetadata.encryptedAt).toBeTruthy();
    });

    it('does not leak plaintext into the ciphertext', async () => {
      const envelope = await service.encryptForStorage(
        { bodyText: 'plaintext-marker-xyz' },
        publicKey
      );
      const decoded = Buffer.from(envelope.ciphertext, 'base64').toString('binary');
      expect(decoded).not.toContain('plaintext-marker-xyz');
    });

    it('rejects an invalid recipient public key', async () => {
      await expect(
        service.encryptForStorage({ bodyText: 'x' }, 'not-a-key')
      ).rejects.toThrow();
    });
  });

  describe('decryptOnRetrieval', () => {
    it('round-trips encrypted content back to plaintext', async () => {
      const content = {
        subject: 'Quarterly numbers',
        bodyText: 'Revenue is up 20%',
        bodyHtml: '<p>Revenue is up <b>20%</b></p>',
      };
      const envelope = await service.encryptForStorage(content, publicKey);
      const decrypted = await service.decryptOnRetrieval(
        { ciphertext: envelope.ciphertext, encryptionMetadata: envelope.encryptionMetadata },
        privateKey
      );

      expect(decrypted.subject).toBe(content.subject);
      expect(decrypted.bodyText).toBe(content.bodyText);
      expect(decrypted.bodyHtml).toBe(content.bodyHtml);
    });

    it('preserves undefined fields as undefined', async () => {
      const envelope = await service.encryptForStorage({ bodyText: 'only text' }, publicKey);
      const decrypted = await service.decryptOnRetrieval(
        { ciphertext: envelope.ciphertext, encryptionMetadata: envelope.encryptionMetadata },
        privateKey
      );
      expect(decrypted.bodyText).toBe('only text');
      expect(decrypted.subject).toBeUndefined();
      expect(decrypted.bodyHtml).toBeUndefined();
    });

    it('fails to decrypt with the wrong private key', async () => {
      const envelope = await service.encryptForStorage({ bodyText: 'secret' }, publicKey);
      const wrong = await crypto.generateKeyPair();
      await expect(
        service.decryptOnRetrieval(
          { ciphertext: envelope.ciphertext, encryptionMetadata: envelope.encryptionMetadata },
          wrong.privateKey
        )
      ).rejects.toThrow();
    });

    it('throws when metadata is missing required fields', async () => {
      await expect(
        service.decryptOnRetrieval(
          {
            ciphertext: 'abc',
            // @ts-expect-error intentionally malformed metadata
            encryptionMetadata: { algorithm: 'x25519-xsalsa20-poly1305', version: 1 },
          },
          privateKey
        )
      ).rejects.toThrow();
    });
  });
});
