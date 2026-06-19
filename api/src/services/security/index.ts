/**
 * Security Services
 * Export security-related functionality
 */

export {
  AuditLogger,
  auditLogger,
  type SecurityEventType,
  type AuditLogEntry,
  type StoredAuditLog,
  type QueryOptions,
} from './audit-logger.js';

export {
  RateLimiter,
  rateLimiter,
  type RateLimitResult,
  type RateLimitOptions,
  type RateLimitCategory,
} from './rate-limiter.js';

export {
  BruteForceProtection,
  bruteForceProtection,
  type BruteForceConfig,
  type LockoutStatus,
} from './brute-force-protection.js';

export {
  SpamFilterService,
  spamFilterService,
  type SpamFilterInput,
  type SpamFilterResult,
  type SpamFilterOptions,
  type SpamReason,
} from './spam-filter-service.js';
