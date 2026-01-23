/**
 * Authentication Service
 * Implements wallet-based authentication with challenge-response pattern
 *
 * SECURITY CRITICAL:
 * - Never use passwords or non-blockchain keypairs
 * - All authentication via wallet signatures
 * - Nonces prevent replay attacks
 * - JWTs have expiration
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authConfig } from '../../config/index.js';
import { getBlockchainProvider } from '../blockchain/provider-factory.js';
import type { BlockchainType } from '../../types/blockchain.js';

/**
 * Nonce storage interface (will be implemented with Redis)
 */
interface INonceStore {
  save(nonce: AuthNonce): Promise<void>;
  get(nonceValue: string): Promise<AuthNonce | null>;
  markUsed(nonceValue: string): Promise<void>;
  cleanup(): Promise<number>;
}

/**
 * Internal nonce structure
 */
interface AuthNonce {
  nonce: string;
  address: string;
  blockchain: BlockchainType;
  challenge: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  address: string;
  blockchain: BlockchainType;
  iat: number;
  exp: number;
}

/**
 * Authentication challenge response
 */
export interface ChallengeResponse {
  challenge: string;
  nonce: string;
  expiresAt: Date;
}

/**
 * Authentication verification result
 */
export interface AuthVerificationResult {
  success: boolean;
  token?: string;
  expiresIn?: number;
  address?: string;
  blockchain?: BlockchainType;
  error?: string;
}

/**
 * In-memory nonce store
 * Used for development and testing. In production deployments with multiple
 * instances, implement INonceStore with Redis or database-backed storage
 * to ensure nonces are shared across all instances.
 */
class MemoryNonceStore implements INonceStore {
  private nonces: Map<string, AuthNonce> = new Map();

  async save(nonce: AuthNonce): Promise<void> {
    this.nonces.set(nonce.nonce, nonce);
  }

  async get(nonceValue: string): Promise<AuthNonce | null> {
    return this.nonces.get(nonceValue) || null;
  }

  async markUsed(nonceValue: string): Promise<void> {
    const nonce = this.nonces.get(nonceValue);
    if (nonce) {
      nonce.used = true;
    }
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let cleaned = 0;
    for (const [key, nonce] of this.nonces.entries()) {
      if (nonce.expiresAt < now || nonce.used) {
        this.nonces.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

/**
 * Authentication Service
 */
export class AuthService {
  private nonceStore: INonceStore;

  constructor(nonceStore?: INonceStore) {
    this.nonceStore = nonceStore || new MemoryNonceStore();
  }

  /**
   * Generate authentication challenge
   * Creates a unique nonce and challenge message for the user to sign
   *
   * @param address - Blockchain address requesting authentication
   * @param blockchain - Blockchain type
   * @returns Challenge and nonce
   */
  async generateChallenge(
    address: string,
    blockchain: BlockchainType
  ): Promise<ChallengeResponse> {
    // Validate address format
    const provider = getBlockchainProvider(blockchain);
    const validation = await provider.validateAddress(address);

    if (!validation.valid) {
      throw new Error(`Invalid address: ${validation.error}`);
    }

    // Use normalized address
    const normalizedAddress = validation.normalized || address;

    // Generate cryptographically secure nonce
    const nonce = crypto.randomBytes(32).toString('hex');

    // Create challenge message
    // IMPORTANT: Include nonce to prevent replay attacks
    const timestamp = Date.now();
    const challenge = `Sign this message to authenticate with PubKeyMail:\n\nAddress: ${normalizedAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\n\nThis signature will not trigger any blockchain transaction or cost gas.`;

    // Calculate expiration
    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + authConfig.nonceExpiration * 1000
    );

    // Store nonce
    const authNonce: AuthNonce = {
      nonce,
      address: normalizedAddress,
      blockchain,
      challenge,
      createdAt,
      expiresAt,
      used: false,
    };

    await this.nonceStore.save(authNonce);

    return {
      challenge,
      nonce,
      expiresAt,
    };
  }

  /**
   * Verify signature and issue JWT token
   * CRITICAL: This is the authentication gate - must verify signature
   *
   * @param address - Address claiming to have signed
   * @param blockchain - Blockchain type
   * @param signature - Signature of the challenge message
   * @param nonce - Nonce from challenge
   * @returns Verification result with JWT token if successful
   */
  async verifyAndAuthenticate(
    address: string,
    blockchain: BlockchainType,
    signature: string,
    nonce: string
  ): Promise<AuthVerificationResult> {
    try {
      // Retrieve nonce
      const storedNonce = await this.nonceStore.get(nonce);

      if (!storedNonce) {
        return {
          success: false,
          error: 'Invalid or expired nonce',
        };
      }

      // Check if nonce is expired
      if (storedNonce.expiresAt < new Date()) {
        return {
          success: false,
          error: 'Nonce has expired',
        };
      }

      // Check if nonce was already used
      if (storedNonce.used) {
        return {
          success: false,
          error: 'Nonce has already been used',
        };
      }

      // Verify blockchain and address match
      if (storedNonce.blockchain !== blockchain) {
        return {
          success: false,
          error: 'Blockchain mismatch',
        };
      }

      // CRITICAL: Validate address format
      const provider = getBlockchainProvider(blockchain);
      const validation = await provider.validateAddress(address);

      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid address: ${validation.error}`,
        };
      }

      const normalizedAddress = validation.normalized || address;

      // Case-sensitive address comparison
      if (storedNonce.address !== normalizedAddress) {
        return {
          success: false,
          error: 'Address mismatch',
        };
      }

      // CRITICAL: Verify signature
      const verificationResult = await provider.verifySignature(
        storedNonce.challenge,
        signature,
        normalizedAddress
      );

      if (!verificationResult.valid) {
        return {
          success: false,
          error: verificationResult.error || 'Signature verification failed',
        };
      }

      // Mark nonce as used to prevent replay attacks
      await this.nonceStore.markUsed(nonce);

      // Generate JWT token
      const token = this.generateJWT(normalizedAddress, blockchain);

      return {
        success: true,
        token,
        expiresIn: authConfig.jwtExpiration,
        address: normalizedAddress,
        blockchain,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Generate JWT token
   * @param address - Authenticated blockchain address
   * @param blockchain - Blockchain type
   * @returns JWT token string
   */
  private generateJWT(address: string, blockchain: BlockchainType): string {
    const payload: JWTPayload = {
      address,
      blockchain,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + authConfig.jwtExpiration,
    };

    return jwt.sign(payload, authConfig.jwtSecret, {
      algorithm: 'HS256',
    });
  }

  /**
   * Verify JWT token
   * @param token - JWT token to verify
   * @returns Decoded payload if valid, null if invalid
   */
  verifyJWT(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, authConfig.jwtSecret, {
        algorithms: ['HS256'],
      }) as JWTPayload;

      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Cleanup expired nonces
   * Should be called periodically (e.g., via cron job)
   * @returns Number of nonces cleaned up
   */
  async cleanupExpiredNonces(): Promise<number> {
    return await this.nonceStore.cleanup();
  }
}

// Export singleton instance
export const authService = new AuthService();
