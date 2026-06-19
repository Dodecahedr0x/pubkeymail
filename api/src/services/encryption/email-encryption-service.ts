/**
 * Email Encryption Service
 *
 * Orchestrates end-to-end encrypted email storage and retrieval on top of the
 * low-level X25519 primitives in {@link EncryptionService}.
 *
 * Model: the server encrypts an email's content to the recipient's published
 * public key using an ephemeral key pair (forward secrecy). The resulting
 * ciphertext is stored; only the holder of the recipient private key can
 * decrypt it. "Decryption on retrieval" therefore requires the caller to
 * supply the recipient's private key (typically derived/held client-side and
 * passed transiently — never persisted).
 *
 * The serialized envelope stores the whole content blob ({subject, bodyText,
 * bodyHtml}) as one ciphertext, with the nonce and ephemeral public key kept
 * in the email's `encryption_metadata`.
 */

import { EncryptionService, encryptionService } from './encryption-service.js';
import type { EncryptedData } from '../../types/encryption.js';

/** Email content that can be encrypted. */
export interface EncryptableContent {
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
}

/** Metadata persisted alongside an encrypted email. */
export interface StoredEncryptionMetadata {
  algorithm: 'x25519-xsalsa20-poly1305';
  version: number;
  encryptedAt: string;
  nonce: string;
  ephemeralPublicKey: string;
  senderPublicKey?: string;
}

/** Result of preparing an email for encrypted storage. */
export interface EncryptedEnvelope {
  isEncrypted: true;
  /** Base64 ciphertext to store in the email body field. */
  ciphertext: string;
  encryptionMetadata: StoredEncryptionMetadata;
}

/** Minimal shape needed to decrypt a stored email. */
export interface StoredEncryptedEmail {
  ciphertext: string;
  encryptionMetadata: StoredEncryptionMetadata;
}

const ALGORITHM = 'x25519-xsalsa20-poly1305' as const;
const VERSION = 1;

export class EmailEncryptionService {
  constructor(private readonly crypto: EncryptionService = encryptionService) {}

  /**
   * Encrypt email content for storage using the recipient's public key.
   */
  async encryptForStorage(
    content: EncryptableContent,
    recipientPublicKey: string,
    senderPublicKey?: string
  ): Promise<EncryptedEnvelope> {
    // Serialize the content blob; only defined fields are included.
    const payload = JSON.stringify({
      subject: content.subject,
      bodyText: content.bodyText,
      bodyHtml: content.bodyHtml,
    });

    const encrypted = await this.crypto.encryptEmail(payload, recipientPublicKey);

    return {
      isEncrypted: true,
      ciphertext: encrypted.ciphertext,
      encryptionMetadata: {
        algorithm: ALGORITHM,
        version: VERSION,
        encryptedAt: new Date().toISOString(),
        nonce: encrypted.nonce,
        ephemeralPublicKey: encrypted.ephemeralPublicKey,
        ...(senderPublicKey ? { senderPublicKey } : {}),
      },
    };
  }

  /**
   * Decrypt a stored encrypted email using the recipient's private key.
   */
  async decryptOnRetrieval(
    email: StoredEncryptedEmail,
    recipientPrivateKey: string
  ): Promise<EncryptableContent> {
    const meta = email.encryptionMetadata;
    if (!meta || !meta.nonce || !meta.ephemeralPublicKey) {
      throw new Error('Encrypted email is missing required metadata (nonce/ephemeralPublicKey)');
    }

    const encrypted: EncryptedData = {
      ciphertext: email.ciphertext,
      nonce: meta.nonce,
      ephemeralPublicKey: meta.ephemeralPublicKey,
    };

    const plaintext = await this.crypto.decryptEmail(encrypted, recipientPrivateKey);

    let parsed: EncryptableContent;
    try {
      parsed = JSON.parse(plaintext) as EncryptableContent;
    } catch {
      throw new Error('Decrypted payload is not valid email content');
    }

    return {
      subject: parsed.subject,
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
    };
  }
}

export const emailEncryptionService = new EmailEncryptionService();
