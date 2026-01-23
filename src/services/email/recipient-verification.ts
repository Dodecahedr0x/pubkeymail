/**
 * Recipient Verification Service
 * Validates email recipients before sending
 *
 * SECURITY NOTES:
 * - Validates email format
 * - Verifies internal recipients exist
 * - Case-sensitive address matching for internal recipients
 */

import { db } from '../../database/connection.js';
import { smtpConfig } from '../../config/index.js';

/**
 * Verification result for a single recipient
 */
export interface RecipientVerificationResult {
  valid: boolean;
  email: string;
  isInternal?: boolean;
  addressId?: number;
  reason?: string;
}

/**
 * Verification result for multiple recipients
 */
export interface MultipleRecipientVerificationResult {
  allValid: boolean;
  results: RecipientVerificationResult[];
  invalidRecipients: string[];
}

/**
 * Recipient Verification Service Class
 */
export class RecipientVerificationService {
  private readonly fromDomain: string;

  constructor() {
    this.fromDomain = smtpConfig.fromDomain;
  }

  /**
   * Validate email format using regex
   */
  validateEmailFormat(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if recipient is an internal PubKeyMail address
   */
  isInternalRecipient(email: string): boolean {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    return domain === this.fromDomain.toLowerCase();
  }

  /**
   * Extract blockchain address from internal email
   */
  extractAddressFromEmail(email: string): string | null {
    if (!this.isInternalRecipient(email)) {
      return null;
    }
    const localPart = email.split('@')[0];
    return localPart || null;
  }

  /**
   * Verify internal recipient exists in the system
   */
  async verifyInternalRecipient(
    email: string
  ): Promise<RecipientVerificationResult> {
    const address = this.extractAddressFromEmail(email);

    if (!address) {
      return {
        valid: false,
        email,
        reason: 'Invalid internal email format',
      };
    }

    try {
      const result = await db.query<{ id: number; address: string }>(
        `SELECT id, address FROM blockchain_addresses WHERE address = $1 COLLATE "C"`,
        [address]
      );

      if (result.rows.length === 0) {
        return {
          valid: false,
          email,
          isInternal: true,
          reason: 'Recipient address is not registered',
        };
      }

      return {
        valid: true,
        email,
        isInternal: true,
        addressId: result.rows[0]!.id,
      };
    } catch (error) {
      return {
        valid: false,
        email,
        reason: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Verify a single recipient
   * - Validates email format
   * - For internal recipients, verifies the address exists
   * - External recipients are accepted without verification
   */
  async verifyRecipient(email: string): Promise<RecipientVerificationResult> {
    if (!this.validateEmailFormat(email)) {
      return {
        valid: false,
        email,
        reason: 'Invalid email format',
      };
    }

    if (this.isInternalRecipient(email)) {
      return this.verifyInternalRecipient(email);
    }

    return {
      valid: true,
      email,
      isInternal: false,
    };
  }

  /**
   * Verify multiple recipients
   */
  async verifyMultipleRecipients(
    emails: string[]
  ): Promise<MultipleRecipientVerificationResult> {
    if (emails.length === 0) {
      return {
        allValid: true,
        results: [],
        invalidRecipients: [],
      };
    }

    const results: RecipientVerificationResult[] = [];
    const invalidRecipients: string[] = [];

    for (const email of emails) {
      const result = await this.verifyRecipient(email);
      results.push(result);

      if (!result.valid) {
        invalidRecipients.push(email);
      }
    }

    return {
      allValid: invalidRecipients.length === 0,
      results,
      invalidRecipients,
    };
  }

  /**
   * Normalize email address
   * - Preserves local part case (important for blockchain addresses)
   * - Lowercases domain
   */
  normalizeEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) {
      return email;
    }
    return `${parts[0]}@${parts[1]!.toLowerCase()}`;
  }
}

/**
 * Singleton instance
 */
export const recipientVerificationService = new RecipientVerificationService();
