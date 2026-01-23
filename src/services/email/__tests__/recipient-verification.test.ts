/**
 * Recipient Verification Service Tests
 * Tests for validating email recipients before sending
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecipientVerificationService } from '../recipient-verification.js';

// Mock database
vi.mock('../../../database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

// Mock config
vi.mock('../../../config/index.js', () => ({
  smtpConfig: {
    fromDomain: 'pubkeymail.com',
  },
}));

import { db } from '../../../database/connection.js';

describe('RecipientVerificationService', () => {
  let service: RecipientVerificationService;
  const mockQuery = vi.mocked(db.query);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecipientVerificationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateEmailFormat', () => {
    it('should accept valid email addresses', () => {
      expect(service.validateEmailFormat('user@example.com')).toBe(true);
      expect(service.validateEmailFormat('user.name@domain.org')).toBe(true);
      expect(service.validateEmailFormat('user+tag@example.co.uk')).toBe(true);
      expect(service.validateEmailFormat('user123@sub.domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(service.validateEmailFormat('invalid')).toBe(false);
      expect(service.validateEmailFormat('no-at-symbol')).toBe(false);
      expect(service.validateEmailFormat('@nodomain.com')).toBe(false);
      expect(service.validateEmailFormat('user@')).toBe(false);
      expect(service.validateEmailFormat('')).toBe(false);
      expect(service.validateEmailFormat('user@domain')).toBe(false);
    });
  });

  describe('isInternalRecipient', () => {
    it('should identify internal pubkeymail addresses', () => {
      expect(service.isInternalRecipient('GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch@pubkeymail.com')).toBe(true);
      expect(service.isInternalRecipient('0x742d35Cc6634C0532925a3b844Bc9e7595f3E9b9@pubkeymail.com')).toBe(true);
    });

    it('should identify external addresses', () => {
      expect(service.isInternalRecipient('user@example.com')).toBe(false);
      expect(service.isInternalRecipient('admin@gmail.com')).toBe(false);
    });
  });

  describe('verifyInternalRecipient', () => {
    it('should return valid for registered address', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, address: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await service.verifyInternalRecipient(
        'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch@pubkeymail.com'
      );

      expect(result.valid).toBe(true);
      expect(result.addressId).toBe(1);
    });

    it('should return invalid for unregistered address', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await service.verifyInternalRecipient(
        'UnregisteredAddress123456789012345678901234567@pubkeymail.com'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Recipient address is not registered');
    });

    it('should extract address from email correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, address: 'TestAddress12345678901234567890123456789012' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await service.verifyInternalRecipient(
        'TestAddress12345678901234567890123456789012@pubkeymail.com'
      );

      expect(result.valid).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('blockchain_addresses'),
        expect.arrayContaining(['TestAddress12345678901234567890123456789012'])
      );
    });
  });

  describe('verifyRecipient', () => {
    it('should fail for invalid email format', async () => {
      const result = await service.verifyRecipient('invalid-email');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid email format');
    });

    it('should verify internal recipient exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, address: 'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await service.verifyRecipient(
        'GNa9E2dWPgxHePV5hRzMZrJ1RrSzBx9rX3kgYNQGvrch@pubkeymail.com'
      );

      expect(result.valid).toBe(true);
      expect(result.isInternal).toBe(true);
    });

    it('should accept external recipients without verification', async () => {
      const result = await service.verifyRecipient('user@example.com');

      expect(result.valid).toBe(true);
      expect(result.isInternal).toBe(false);
    });

    it('should fail for unregistered internal recipient', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await service.verifyRecipient(
        'UnknownAddress1234567890123456789012345678901@pubkeymail.com'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Recipient address is not registered');
    });
  });

  describe('verifyMultipleRecipients', () => {
    it('should verify all recipients and return combined results', async () => {
      // First recipient (internal, exists)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, address: 'ValidAddress123456789012345678901234567890123' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const recipients = [
        'ValidAddress123456789012345678901234567890123@pubkeymail.com',
        'external@example.com',
      ];

      const result = await service.verifyMultipleRecipients(recipients);

      expect(result.allValid).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.valid).toBe(true);
      expect(result.results[0]?.isInternal).toBe(true);
      expect(result.results[1]?.valid).toBe(true);
      expect(result.results[1]?.isInternal).toBe(false);
    });

    it('should return allValid false if any recipient is invalid', async () => {
      const recipients = ['invalid-email', 'valid@example.com'];

      const result = await service.verifyMultipleRecipients(recipients);

      expect(result.allValid).toBe(false);
      expect(result.invalidRecipients).toContain('invalid-email');
    });

    it('should handle empty recipient list', async () => {
      const result = await service.verifyMultipleRecipients([]);

      expect(result.allValid).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('normalizeEmail', () => {
    it('should normalize email to lowercase domain', () => {
      expect(service.normalizeEmail('user@EXAMPLE.COM')).toBe('user@example.com');
      expect(service.normalizeEmail('USER@Example.Org')).toBe('USER@example.org');
    });

    it('should preserve local part case sensitivity', () => {
      expect(service.normalizeEmail('CaseSensitive@example.com')).toBe('CaseSensitive@example.com');
    });
  });
});
