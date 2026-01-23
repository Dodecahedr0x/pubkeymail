/**
 * Encryption Service
 * Implements X25519 key exchange with XSalsa20-Poly1305 encryption
 * for optional end-to-end email encryption
 *
 * Uses ephemeral keys for forward secrecy
 */

import nacl from 'tweetnacl';
import { db } from '../../database/connection.js';
import type {
  EncryptionKeyPair,
  EncryptedData,
  UserEncryptionKeyRow,
  AddressEncryptionKeyRow,
} from '../../types/encryption.js';

/**
 * Encryption Service
 * Provides X25519 key pair generation and email encryption/decryption
 */
export class EncryptionService {
  /**
   * Generate a new X25519 key pair for encryption
   * @returns Key pair with hex-encoded public and private keys
   */
  async generateKeyPair(): Promise<EncryptionKeyPair> {
    const keyPair = nacl.box.keyPair();

    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      privateKey: Buffer.from(keyPair.secretKey).toString('hex'),
    };
  }

  /**
   * Encrypt email content using recipient's public key
   * Uses ephemeral key pair for forward secrecy
   *
   * @param plaintext - The email content to encrypt
   * @param recipientPublicKey - Recipient's X25519 public key (hex-encoded)
   * @returns Encrypted data with ciphertext, nonce, and ephemeral public key
   */
  async encryptEmail(
    plaintext: string,
    recipientPublicKey: string
  ): Promise<EncryptedData> {
    const ephemeralKeyPair = nacl.box.keyPair();
    const recipientPubKeyBytes = Buffer.from(recipientPublicKey, 'hex');

    if (recipientPubKeyBytes.length !== 32) {
      throw new Error('Invalid recipient public key length');
    }

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = Buffer.from(plaintext, 'utf8');

    const ciphertext = nacl.box(
      messageBytes,
      nonce,
      recipientPubKeyBytes,
      ephemeralKeyPair.secretKey
    );

    if (!ciphertext) {
      throw new Error('Encryption failed');
    }

    return {
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      nonce: Buffer.from(nonce).toString('hex'),
      ephemeralPublicKey: Buffer.from(ephemeralKeyPair.publicKey).toString('hex'),
    };
  }

  /**
   * Decrypt email content using recipient's private key
   *
   * @param encrypted - The encrypted data structure
   * @param recipientPrivateKey - Recipient's X25519 private key (hex-encoded)
   * @returns Decrypted plaintext
   */
  async decryptEmail(
    encrypted: EncryptedData,
    recipientPrivateKey: string
  ): Promise<string> {
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
    const nonce = Buffer.from(encrypted.nonce, 'hex');
    const ephemeralPubKey = Buffer.from(encrypted.ephemeralPublicKey, 'hex');
    const recipientPrivKeyBytes = Buffer.from(recipientPrivateKey, 'hex');

    if (nonce.length !== nacl.box.nonceLength) {
      throw new Error('Invalid nonce length');
    }

    if (ephemeralPubKey.length !== 32) {
      throw new Error('Invalid ephemeral public key length');
    }

    if (recipientPrivKeyBytes.length !== 32) {
      throw new Error('Invalid recipient private key length');
    }

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      ephemeralPubKey,
      recipientPrivKeyBytes
    );

    if (!decrypted) {
      throw new Error('Decryption failed - invalid ciphertext or wrong key');
    }

    return Buffer.from(decrypted).toString('utf8');
  }

  /**
   * Store or update user's public encryption key in database
   * Uses ON CONFLICT for upsert behavior
   *
   * @param userId - User ID
   * @param publicKey - X25519 public key (hex-encoded)
   */
  async storeUserPublicKey(userId: number, publicKey: string): Promise<void> {
    if (publicKey.length !== 64) {
      throw new Error('Invalid public key length - expected 64 hex characters');
    }

    await db.query(
      `INSERT INTO user_encryption_keys (user_id, public_key, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         public_key = EXCLUDED.public_key,
         updated_at = NOW()`,
      [userId, publicKey]
    );
  }

  /**
   * Get user's public encryption key by user ID
   *
   * @param userId - User ID
   * @returns Public key (hex-encoded) or null if not found
   */
  async getUserPublicKey(userId: number): Promise<string | null> {
    const result = await db.query<UserEncryptionKeyRow>(
      `SELECT public_key FROM user_encryption_keys WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return result.rows[0].public_key;
  }

  /**
   * Get public encryption key by blockchain address
   * Joins users and blockchain_addresses tables
   *
   * @param address - Blockchain address (case-sensitive)
   * @returns Public key (hex-encoded) or null if not found
   */
  async getPublicKeyByAddress(address: string): Promise<string | null> {
    const result = await db.query<AddressEncryptionKeyRow>(
      `SELECT uek.public_key
       FROM user_encryption_keys uek
       JOIN users u ON u.id = uek.user_id
       JOIN blockchain_addresses ba ON ba.id = u.primary_address_id
       WHERE ba.address = $1 COLLATE "C"`,
      [address]
    );

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return result.rows[0].public_key;
  }
}

export const encryptionService = new EncryptionService();
