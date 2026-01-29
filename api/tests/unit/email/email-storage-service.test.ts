/**
 * Email Storage Service Tests
 * Tests for email storage and retrieval functionality
 */

import { describe, it, expect } from 'vitest';
import {
  parseEmailAddress,
  resolveEmailToBlockchainAddress,
} from '../../../src/services/email/email-storage-service.js';

describe('EmailStorageService', () => {
  describe('parseEmailAddress', () => {
    it('should parse standard blockchain address email', () => {
      const email = '11111111111111111111111111111111@domain.tld';
      const result = parseEmailAddress(email);

      expect(result).not.toBeNull();
      expect(result!.localPart).toBe('11111111111111111111111111111111');
      expect(result!.domain).toBe('domain.tld');
      expect(result!.isNameService).toBe(false);
    });

    it('should parse SNS name service email', () => {
      const email = 'example.sol@domain.tld';
      const result = parseEmailAddress(email);

      expect(result).not.toBeNull();
      expect(result!.localPart).toBe('example.sol');
      expect(result!.domain).toBe('domain.tld');
      expect(result!.isNameService).toBe(true);
    });

    it('should parse ENS name service email', () => {
      const email = 'vitalik.eth@domain.tld';
      const result = parseEmailAddress(email);

      expect(result).not.toBeNull();
      expect(result!.localPart).toBe('vitalik.eth');
      expect(result!.domain).toBe('domain.tld');
      expect(result!.isNameService).toBe(true);
    });

    it('should preserve case sensitivity', () => {
      const email = 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@domain.tld';
      const result = parseEmailAddress(email);

      expect(result).not.toBeNull();
      expect(result!.localPart).toBe('GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A');
    });

    it('should return null for invalid email format', () => {
      const invalidEmails = [
        'no-at-sign',
        '@missing-local',
        'missing-domain@',
        'multiple@at@signs',
        '',
      ];

      invalidEmails.forEach((email) => {
        expect(parseEmailAddress(email)).toBeNull();
      });
    });

    it('should handle complex domains', () => {
      const email = 'address@sub.domain.co.uk';
      const result = parseEmailAddress(email);

      expect(result).not.toBeNull();
      expect(result!.domain).toBe('sub.domain.co.uk');
    });
  });

  describe('resolveEmailToBlockchainAddress', () => {
    it('should resolve direct blockchain address', async () => {
      const email = '11111111111111111111111111111111@domain.tld';
      const result = await resolveEmailToBlockchainAddress(email, 'solana');

      expect(result.blockchain).toBe('solana');
      expect(result.address).toBe('11111111111111111111111111111111');
    });

    it('should reject invalid blockchain address', async () => {
      const email = 'invalid-address@domain.tld';

      await expect(
        resolveEmailToBlockchainAddress(email, 'solana')
      ).rejects.toThrow('Invalid blockchain address');
    });

    it('should reject invalid email format', async () => {
      const email = 'no-at-sign';

      await expect(
        resolveEmailToBlockchainAddress(email, 'solana')
      ).rejects.toThrow('Invalid email address format');
    });

    it('should preserve address case sensitivity', async () => {
      const email = 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@domain.tld';
      const result = await resolveEmailToBlockchainAddress(email, 'solana');

      // Should return normalized version from validation
      expect(result.address).toBe('GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A');
    });

    // Note: Testing SNS resolution requires integration tests
    // with actual blockchain connection
  });

  // Note: Testing EmailStorageService methods requires database
  // These should be tested in integration tests with test database
  describe('EmailStorageService integration (skipped)', () => {
    it.skip('should store email with retention policy', () => {
      // Requires database connection
    });

    it.skip('should retrieve emails with pagination', () => {
      // Requires database connection
    });

    it.skip('should apply 30-day retention for unregistered users', () => {
      // Requires database connection
    });

    it.skip('should apply indefinite retention for registered users', () => {
      // Requires database connection
    });

    it.skip('should cleanup expired emails', () => {
      // Requires database connection
    });
  });
});
