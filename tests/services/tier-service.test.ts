/**
 * Tier Service Tests
 * Tests for subscription tier-based feature gating
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TierService } from '../../src/services/tier/tier-service.js';

// Mock database
vi.mock('../../src/database/connection.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    EMAIL_RETENTION_DAYS: 30,
    RATE_LIMIT_EMAIL_SEND_PAID_TIER: 500,
    SUBSCRIPTION_GRACE_PERIOD_DAYS: 7,
    DOMAIN: 'https://pubkeymail.com',
  },
}));

import { db } from '../../src/database/connection.js';

describe('TierService', () => {
  let tierService: TierService;
  const mockQuery = vi.mocked(db.query);

  beforeEach(() => {
    vi.clearAllMocks();
    tierService = new TierService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasFeature', () => {
    it('should return false for send_email on free tier', () => {
      expect(tierService.hasFeature('free', 'send_email')).toBe(false);
    });

    it('should return true for send_email on paid tier', () => {
      expect(tierService.hasFeature('paid', 'send_email')).toBe(true);
    });

    it('should return true for extended_retention on paid tier', () => {
      expect(tierService.hasFeature('paid', 'extended_retention')).toBe(true);
    });

    it('should return true for email_forwarding on paid tier', () => {
      expect(tierService.hasFeature('paid', 'email_forwarding')).toBe(true);
    });

    it('should return false for custom_domain on both tiers', () => {
      expect(tierService.hasFeature('free', 'custom_domain')).toBe(false);
      expect(tierService.hasFeature('paid', 'custom_domain')).toBe(false);
    });
  });

  describe('checkFeatureAccess', () => {
    it('should allow send_email for paid user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await tierService.checkFeatureAccess(1, 'send_email');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny send_email for free user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'free', subscription_expires_at: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await tierService.checkFeatureAccess(1, 'send_email');

      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe('paid');
      expect(result.reason).toContain('paid subscription');
    });

    it('should return not allowed if user not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await tierService.checkFeatureAccess(999, 'send_email');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('User not found');
    });
  });

  describe('getUserTier', () => {
    it('should return paid for active paid subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const tier = await tierService.getUserTier(1);

      expect(tier).toBe('paid');
    });

    it('should return free for free user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'free', subscription_expires_at: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const tier = await tierService.getUserTier(1);

      expect(tier).toBe('free');
    });

    it('should return free for expired paid subscription', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: expiredDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const tier = await tierService.getUserTier(1);

      expect(tier).toBe('free');
    });

    it('should return paid for non-expired paid subscription', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: futureDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const tier = await tierService.getUserTier(1);

      expect(tier).toBe('paid');
    });

    it('should return null for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const tier = await tierService.getUserTier(999);

      expect(tier).toBeNull();
    });
  });

  describe('getRateLimit', () => {
    it('should return 0 for email_send on free tier', () => {
      const limit = tierService.getRateLimit('free', 'email_send');
      expect(limit).toBe(0);
    });

    it('should return configured limit for email_send on paid tier', () => {
      const limit = tierService.getRateLimit('paid', 'email_send');
      expect(limit).toBe(500);
    });

    it('should return higher api_request limit for paid tier', () => {
      const freeLimit = tierService.getRateLimit('free', 'api_request');
      const paidLimit = tierService.getRateLimit('paid', 'api_request');

      expect(paidLimit).toBeGreaterThan(freeLimit);
    });
  });

  describe('getRetentionDays', () => {
    it('should return 30 days for free tier', () => {
      const days = tierService.getRetentionDays('free');
      expect(days).toBe(30);
    });

    it('should return 365 days for paid tier', () => {
      const days = tierService.getRetentionDays('paid');
      expect(days).toBe(365);
    });
  });

  describe('getMaxLinkedAddresses', () => {
    it('should return 1 for free tier', () => {
      const max = tierService.getMaxLinkedAddresses('free');
      expect(max).toBe(1);
    });

    it('should return 10 for paid tier', () => {
      const max = tierService.getMaxLinkedAddresses('paid');
      expect(max).toBe(10);
    });
  });

  describe('canLinkAddress', () => {
    it('should allow linking if under limit', async () => {
      // Mock getUserTier
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'free', subscription_expires_at: null }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock count query
        .mockResolvedValueOnce({
          rows: [{ count: '0' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const canLink = await tierService.canLinkAddress(1);

      expect(canLink).toBe(true);
    });

    it('should deny linking if at limit', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'free', subscription_expires_at: null }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const canLink = await tierService.canLinkAddress(1);

      expect(canLink).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const canLink = await tierService.canLinkAddress(999);

      expect(canLink).toBe(false);
    });
  });

  describe('isInGracePeriod', () => {
    it('should return false for free user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'free', subscription_expires_at: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const inGrace = await tierService.isInGracePeriod(1);

      expect(inGrace).toBe(false);
    });

    it('should return false for active paid user', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: futureDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const inGrace = await tierService.isInGracePeriod(1);

      expect(inGrace).toBe(false);
    });

    it('should return true for recently expired paid user', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 3);

      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: expiredDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const inGrace = await tierService.isInGracePeriod(1);

      expect(inGrace).toBe(true);
    });

    it('should return false for long-expired paid user', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 30);

      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_tier: 'paid', subscription_expires_at: expiredDate }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const inGrace = await tierService.isInGracePeriod(1);

      expect(inGrace).toBe(false);
    });
  });

  describe('getTierComparison', () => {
    it('should return tier comparison data', () => {
      const comparison = tierService.getTierComparison();

      expect(comparison.free).toBeDefined();
      expect(comparison.paid).toBeDefined();
      expect(comparison.differences).toBeInstanceOf(Array);
      expect(comparison.differences.length).toBeGreaterThan(0);
    });

    it('should include key differences', () => {
      const comparison = tierService.getTierComparison();

      expect(comparison.differences.some((d) => d.includes('Send emails'))).toBe(true);
      expect(comparison.differences.some((d) => d.includes('retention'))).toBe(true);
    });
  });

  describe('getRequiredTierForFeature', () => {
    it('should return paid for send_email', () => {
      expect(tierService.getRequiredTierForFeature('send_email')).toBe('paid');
    });

    it('should return paid for extended_retention', () => {
      expect(tierService.getRequiredTierForFeature('extended_retention')).toBe('paid');
    });
  });

  describe('checkRateLimit', () => {
    it('should return rate limit info for user', async () => {
      // Mock getUserTier
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'paid', subscription_expires_at: null }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Mock usage count
        .mockResolvedValueOnce({
          rows: [{ count: '10' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const info = await tierService.checkRateLimit(1, 'email_send');

      expect(info.limit).toBe(500);
      expect(info.remaining).toBe(490);
      expect(info.exceeded).toBe(false);
      expect(info.resetAt).toBeInstanceOf(Date);
    });

    it('should mark as exceeded when limit reached', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'paid', subscription_expires_at: null }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '500' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const info = await tierService.checkRateLimit(1, 'email_send');

      expect(info.remaining).toBe(0);
      expect(info.exceeded).toBe(true);
    });
  });
});
