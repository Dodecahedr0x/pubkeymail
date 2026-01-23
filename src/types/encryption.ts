/**
 * Encryption Type Definitions
 * Types for X25519 key pairs and encrypted email content
 */

/**
 * X25519 encryption key pair
 * Keys are stored as hex strings for easy serialization
 */
export interface EncryptionKeyPair {
  publicKey: string; // Hex-encoded X25519 public key (32 bytes = 64 hex chars)
  privateKey: string; // Hex-encoded X25519 private key (32 bytes = 64 hex chars)
}

/**
 * Encrypted data structure using X25519 + XSalsa20-Poly1305
 * Uses ephemeral key for forward secrecy
 */
export interface EncryptedData {
  ciphertext: string; // Base64-encoded encrypted content
  nonce: string; // Hex-encoded nonce (24 bytes = 48 hex chars)
  ephemeralPublicKey: string; // Hex-encoded ephemeral public key (32 bytes = 64 hex chars)
}

/**
 * Encryption metadata stored with emails
 */
export interface EncryptionMetadata {
  algorithm: 'x25519-xsalsa20-poly1305';
  version: number;
  encryptedAt: string; // ISO timestamp
  senderPublicKey?: string; // Optional sender's public key for replies
}

/**
 * User encryption key stored in database
 */
export interface UserEncryptionKey {
  id: number;
  userId: number;
  publicKey: string; // Hex-encoded X25519 public key
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for user encryption key
 */
export interface UserEncryptionKeyRow {
  id: number;
  user_id: number;
  public_key: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Result of encryption key retrieval by address
 */
export interface AddressEncryptionKeyRow {
  public_key: string;
}
