/**
 * API Middleware
 * Export all middleware functions
 */

export {
  authMiddleware,
  optionalAuthMiddleware,
  requireAddressOwnership,
} from './auth-middleware.js';
export type { AuthenticatedRequest } from './auth-middleware.js';

export {
  requireFeature,
  rateLimit,
  attachTierInfo,
  requireCanLinkAddress,
  blockIfInGracePeriod,
  requirePaidFeature,
} from './tier-middleware.js';
export type { TieredRequest } from './tier-middleware.js';

export { bruteForceMiddleware } from './brute-force-middleware.js';

export {
  emailSizeLimits,
  contentLengthLimit,
  validateEmailSize,
} from './email-limits-middleware.js';
export type { EmailSizeValidation } from './email-limits-middleware.js';
