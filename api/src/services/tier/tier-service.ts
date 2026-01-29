/**
 * Tier Service
 * Manages subscription tier-based feature access and rate limits
 *
 * Features by tier:
 * - Free: Receive emails, basic mailbox access
 * - Paid: Send emails, extended retention, higher rate limits
 */

import { db } from '../../database/connection.js';
import { config } from '../../config/index.js';

/**
 * Subscription tiers
 */
export type SubscriptionTier = 'free' | 'paid';

/**
 * Feature names that can be gated by tier
 */
export type FeatureName =
  | 'send_email'
  | 'extended_retention'
  | 'email_forwarding'
  | 'custom_domain'
  | 'priority_support'
  | 'api_access';

/**
 * Rate limit categories
 */
export type RateLimitCategory =
  | 'email_send'
  | 'email_receive'
  | 'api_request'
  | 'address_link';

/**
 * Feature access result
 */
export interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
  requiredTier?: SubscriptionTier;
  upgradeUrl?: string;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  exceeded: boolean;
}

/**
 * Tier configuration
 */
interface TierConfig {
  features: Set<FeatureName>;
  rateLimits: Record<RateLimitCategory, number>;
  retentionDays: number;
  maxLinkedAddresses: number;
  maxEmailSize: number; // in bytes
}

/**
 * Tier configurations
 */
const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    features: new Set<FeatureName>([]),
    rateLimits: {
      email_send: 0, // Cannot send
      email_receive: 1000, // per day
      api_request: 100, // per hour
      address_link: 1, // max 1 additional address
    },
    retentionDays: config.EMAIL_RETENTION_DAYS,
    maxLinkedAddresses: 1,
    maxEmailSize: 5 * 1024 * 1024, // 5MB
  },
  paid: {
    features: new Set<FeatureName>([
      'send_email',
      'extended_retention',
      'email_forwarding',
      'api_access',
    ]),
    rateLimits: {
      email_send: config.RATE_LIMIT_EMAIL_SEND_PAID_TIER, // per hour
      email_receive: 10000, // per day
      api_request: 1000, // per hour
      address_link: 10, // max 10 additional addresses
    },
    retentionDays: 365, // 1 year for paid users
    maxLinkedAddresses: 10,
    maxEmailSize: 25 * 1024 * 1024, // 25MB
  },
};

/**
 * Tier Service Class
 */
export class TierService {
  /**
   * Check if a feature is available for a tier
   */
  hasFeature(tier: SubscriptionTier, feature: FeatureName): boolean {
    return TIER_CONFIGS[tier].features.has(feature);
  }

  /**
   * Check feature access for a user
   */
  async checkFeatureAccess(
    userId: number,
    feature: FeatureName
  ): Promise<FeatureAccessResult> {
    const tier = await this.getUserTier(userId);

    if (!tier) {
      return {
        allowed: false,
        reason: 'User not found',
      };
    }

    if (this.hasFeature(tier, feature)) {
      return { allowed: true };
    }

    // Find the tier that has this feature
    const requiredTier = this.getRequiredTierForFeature(feature);

    return {
      allowed: false,
      reason: `Feature '${feature}' requires ${requiredTier} subscription`,
      requiredTier,
      upgradeUrl: `${config.DOMAIN}/upgrade`,
    };
  }

  /**
   * Get the minimum tier required for a feature
   */
  getRequiredTierForFeature(feature: FeatureName): SubscriptionTier {
    // Check if free tier has the feature
    if (TIER_CONFIGS.free.features.has(feature)) {
      return 'free';
    }
    return 'paid';
  }

  /**
   * Get rate limit for a tier and category
   */
  getRateLimit(tier: SubscriptionTier, category: RateLimitCategory): number {
    return TIER_CONFIGS[tier].rateLimits[category];
  }

  /**
   * Check rate limit for a user
   */
  async checkRateLimit(
    userId: number,
    category: RateLimitCategory
  ): Promise<RateLimitInfo> {
    const tier = await this.getUserTier(userId);
    const limit = this.getRateLimit(tier || 'free', category);

    // Get current usage
    const usage = await this.getCurrentUsage(userId, category);

    const remaining = Math.max(0, limit - usage);
    const resetAt = this.getResetTime(category);

    return {
      limit,
      remaining,
      resetAt,
      exceeded: usage >= limit,
    };
  }

  /**
   * Get user's subscription tier
   */
  async getUserTier(userId: number): Promise<SubscriptionTier | null> {
    const result = await db.query<{
      subscription_tier: string;
      subscription_expires_at: Date | null;
    }>(
      `SELECT subscription_tier, subscription_expires_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;

    // Check if paid subscription has expired
    if (
      row.subscription_tier === 'paid' &&
      row.subscription_expires_at &&
      row.subscription_expires_at < new Date()
    ) {
      // Subscription expired, treat as free
      return 'free';
    }

    return row.subscription_tier as SubscriptionTier;
  }

  /**
   * Get user's tier by address
   */
  async getUserTierByAddress(address: string): Promise<SubscriptionTier | null> {
    const result = await db.query<{
      subscription_tier: string;
      subscription_expires_at: Date | null;
    }>(
      `SELECT u.subscription_tier, u.subscription_expires_at
       FROM users u
       JOIN blockchain_addresses ba ON u.primary_address_id = ba.id
       WHERE ba.address = $1
       UNION
       SELECT u.subscription_tier, u.subscription_expires_at
       FROM users u
       JOIN address_links al ON u.id = al.user_id
       JOIN blockchain_addresses ba ON al.address_id = ba.id
       WHERE ba.address = $1
       LIMIT 1`,
      [address]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;

    if (
      row.subscription_tier === 'paid' &&
      row.subscription_expires_at &&
      row.subscription_expires_at < new Date()
    ) {
      return 'free';
    }

    return row.subscription_tier as SubscriptionTier;
  }

  /**
   * Get tier configuration
   */
  getTierConfig(tier: SubscriptionTier): TierConfig {
    return TIER_CONFIGS[tier];
  }

  /**
   * Get retention days for a tier
   */
  getRetentionDays(tier: SubscriptionTier): number {
    return TIER_CONFIGS[tier].retentionDays;
  }

  /**
   * Get max linked addresses for a tier
   */
  getMaxLinkedAddresses(tier: SubscriptionTier): number {
    return TIER_CONFIGS[tier].maxLinkedAddresses;
  }

  /**
   * Check if user can link more addresses
   */
  async canLinkAddress(userId: number): Promise<boolean> {
    const tier = await this.getUserTier(userId);
    if (!tier) return false;

    const maxAddresses = this.getMaxLinkedAddresses(tier);

    // Count current linked addresses
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM address_links WHERE user_id = $1`,
      [userId]
    );

    const currentCount = parseInt(result.rows[0]?.count || '0');
    return currentCount < maxAddresses;
  }

  /**
   * Get tier comparison data (for upgrade prompts)
   */
  getTierComparison(): {
    free: TierConfig;
    paid: TierConfig;
    differences: string[];
  } {
    return {
      free: TIER_CONFIGS.free,
      paid: TIER_CONFIGS.paid,
      differences: [
        'Send emails from your wallet address',
        'Extended email retention (1 year vs 30 days)',
        'Email forwarding rules',
        'Higher rate limits',
        'Up to 10 linked addresses',
        'Priority support',
      ],
    };
  }

  /**
   * Update retention policy when user upgrades
   */
  async updateRetentionOnUpgrade(userId: number): Promise<void> {
    // Get user's addresses
    const addressResult = await db.query<{ id: number }>(
      `SELECT ba.id
       FROM blockchain_addresses ba
       WHERE ba.id = (SELECT primary_address_id FROM users WHERE id = $1)
       UNION
       SELECT ba.id
       FROM blockchain_addresses ba
       JOIN address_links al ON ba.id = al.address_id
       WHERE al.user_id = $1`,
      [userId]
    );

    const addressIds = addressResult.rows.map((r) => r.id);

    if (addressIds.length > 0) {
      // Extend retention for existing emails
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + TIER_CONFIGS.paid.retentionDays);

      await db.query(
        `UPDATE emails
         SET retention_expires_at = $1
         WHERE recipient_address_id = ANY($2)
           AND retention_expires_at IS NOT NULL`,
        [newExpiresAt, addressIds]
      );
    }
  }

  /**
   * Handle grace period for expired subscriptions
   */
  async isInGracePeriod(userId: number): Promise<boolean> {
    const result = await db.query<{
      subscription_tier: string;
      subscription_expires_at: Date | null;
    }>(
      `SELECT subscription_tier, subscription_expires_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const row = result.rows[0]!;

    if (row.subscription_tier !== 'paid' || !row.subscription_expires_at) {
      return false;
    }

    const now = new Date();
    const gracePeriodEnd = new Date(row.subscription_expires_at);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + config.SUBSCRIPTION_GRACE_PERIOD_DAYS);

    // In grace period if expired but within grace days
    return row.subscription_expires_at < now && now < gracePeriodEnd;
  }

  /**
   * Get current usage for rate limiting
   */
  private async getCurrentUsage(
    userId: number,
    category: RateLimitCategory
  ): Promise<number> {
    const window = this.getRateLimitWindow(category);
    const windowStart = new Date(Date.now() - window);

    switch (category) {
      case 'email_send': {
        const result = await db.query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM sent_emails se
           JOIN blockchain_addresses ba ON se.sender_address_id = ba.id
           WHERE (
             ba.id = (SELECT primary_address_id FROM users WHERE id = $1)
             OR ba.id IN (SELECT address_id FROM address_links WHERE user_id = $1)
           )
           AND se.sent_at > $2`,
          [userId, windowStart]
        );
        return parseInt(result.rows[0]?.count || '0');
      }

      case 'email_receive': {
        const result = await db.query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM emails e
           JOIN blockchain_addresses ba ON e.recipient_address_id = ba.id
           WHERE (
             ba.id = (SELECT primary_address_id FROM users WHERE id = $1)
             OR ba.id IN (SELECT address_id FROM address_links WHERE user_id = $1)
           )
           AND e.received_at > $2`,
          [userId, windowStart]
        );
        return parseInt(result.rows[0]?.count || '0');
      }

      case 'api_request':
        // API request tracking would typically use Redis for performance
        // For now, return 0 (not tracked)
        return 0;

      case 'address_link': {
        const result = await db.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM address_links WHERE user_id = $1`,
          [userId]
        );
        return parseInt(result.rows[0]?.count || '0');
      }

      default:
        return 0;
    }
  }

  /**
   * Get rate limit window in milliseconds
   */
  private getRateLimitWindow(category: RateLimitCategory): number {
    switch (category) {
      case 'email_send':
        return 60 * 60 * 1000; // 1 hour
      case 'email_receive':
        return 24 * 60 * 60 * 1000; // 24 hours
      case 'api_request':
        return 60 * 60 * 1000; // 1 hour
      case 'address_link':
        return 0; // Not time-based, just count
      default:
        return 60 * 60 * 1000;
    }
  }

  /**
   * Get reset time for rate limit
   */
  private getResetTime(category: RateLimitCategory): Date {
    const window = this.getRateLimitWindow(category);
    return new Date(Date.now() + window);
  }
}

/**
 * Singleton instance
 */
export const tierService = new TierService();
