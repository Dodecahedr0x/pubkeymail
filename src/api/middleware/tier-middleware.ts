/**
 * Tier Middleware
 * Express middleware for subscription tier-based feature gating
 *
 * SECURITY:
 * - Gates features based on user's subscription tier
 * - Enforces rate limits by tier
 * - Must be used after authMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { tierService, type FeatureName, type RateLimitCategory } from '../../services/tier/index.js';
import { userService } from '../../services/user/index.js';
import type { AuthenticatedRequest } from './auth-middleware.js';

/**
 * Extended request with tier info
 */
export interface TieredRequest extends AuthenticatedRequest {
  tier?: {
    level: 'free' | 'paid';
    userId: number;
  };
}

/**
 * Create middleware that requires a specific feature
 *
 * Usage:
 * ```typescript
 * router.post('/send', authMiddleware, requireFeature('send_email'), handler);
 * ```
 */
export function requireFeature(feature: FeatureName) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    // Get user ID from address
    const userResult = await userService.getUserByAddress(authenticatedReq.user.address);

    if (!userResult.success || !userResult.data) {
      res.status(403).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found. Please register first.',
        },
      });
      return;
    }

    const userId = userResult.data.id;

    // Check feature access
    const access = await tierService.checkFeatureAccess(userId, feature);

    if (!access.allowed) {
      res.status(403).json({
        error: {
          code: 'FEATURE_RESTRICTED',
          message: access.reason || `This feature requires a ${access.requiredTier} subscription.`,
          requiredTier: access.requiredTier,
          upgradeUrl: access.upgradeUrl,
        },
      });
      return;
    }

    // Attach tier info to request
    const tier = await tierService.getUserTier(userId);
    (req as TieredRequest).tier = {
      level: tier || 'free',
      userId,
    };

    next();
  };
}

/**
 * Create middleware that enforces rate limits
 *
 * Usage:
 * ```typescript
 * router.post('/send', authMiddleware, rateLimit('email_send'), handler);
 * ```
 */
export function rateLimit(category: RateLimitCategory) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    // Get user ID from address
    const userResult = await userService.getUserByAddress(authenticatedReq.user.address);

    if (!userResult.success || !userResult.data) {
      res.status(403).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found.',
        },
      });
      return;
    }

    const userId = userResult.data.id;

    // Check rate limit
    const rateLimitInfo = await tierService.checkRateLimit(userId, category);

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimitInfo.resetAt.toISOString());

    if (rateLimitInfo.exceeded) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again after ${rateLimitInfo.resetAt.toISOString()}`,
          limit: rateLimitInfo.limit,
          remaining: 0,
          resetAt: rateLimitInfo.resetAt.toISOString(),
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to attach tier info without blocking
 * Useful for routes that want to know the tier but don't require it
 *
 * Usage:
 * ```typescript
 * router.get('/info', authMiddleware, attachTierInfo, handler);
 * ```
 */
export async function attachTierInfo(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authenticatedReq = req as AuthenticatedRequest;

  if (authenticatedReq.user) {
    const userResult = await userService.getUserByAddress(authenticatedReq.user.address);

    if (userResult.success && userResult.data) {
      const tier = await tierService.getUserTier(userResult.data.id);
      (req as TieredRequest).tier = {
        level: tier || 'free',
        userId: userResult.data.id,
      };
    }
  }

  next();
}

/**
 * Middleware to check if user can link more addresses
 *
 * Usage:
 * ```typescript
 * router.post('/link-address', authMiddleware, requireCanLinkAddress, handler);
 * ```
 */
export async function requireCanLinkAddress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authenticatedReq = req as AuthenticatedRequest;

  if (!authenticatedReq.user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const userResult = await userService.getUserByAddress(authenticatedReq.user.address);

  if (!userResult.success || !userResult.data) {
    res.status(403).json({
      error: {
        code: 'USER_NOT_FOUND',
        message: 'User account not found.',
      },
    });
    return;
  }

  const canLink = await tierService.canLinkAddress(userResult.data.id);

  if (!canLink) {
    const tier = await tierService.getUserTier(userResult.data.id);
    const maxAddresses = tierService.getMaxLinkedAddresses(tier || 'free');

    res.status(403).json({
      error: {
        code: 'ADDRESS_LIMIT_REACHED',
        message: `You have reached the maximum number of linked addresses (${maxAddresses}). Upgrade to add more.`,
        currentLimit: maxAddresses,
        upgradeUrl: `${process.env['DOMAIN'] || 'https://pubkeymail.com'}/upgrade`,
      },
    });
    return;
  }

  next();
}

/**
 * Middleware to check if user is in grace period (expired but within grace days)
 *
 * Usage:
 * ```typescript
 * router.post('/send', authMiddleware, blockIfInGracePeriod, handler);
 * ```
 */
export async function blockIfInGracePeriod(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authenticatedReq = req as AuthenticatedRequest;

  if (!authenticatedReq.user) {
    next();
    return;
  }

  const userResult = await userService.getUserByAddress(authenticatedReq.user.address);

  if (!userResult.success || !userResult.data) {
    next();
    return;
  }

  const inGracePeriod = await tierService.isInGracePeriod(userResult.data.id);

  if (inGracePeriod) {
    res.status(403).json({
      error: {
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Your subscription has expired. Please renew to continue using paid features.',
        gracePeriod: true,
        renewUrl: `${process.env['DOMAIN'] || 'https://pubkeymail.com'}/renew`,
      },
    });
    return;
  }

  next();
}

/**
 * Combined middleware for paid features
 * Checks auth + paid tier + rate limit in one
 *
 * Usage:
 * ```typescript
 * router.post('/send', requirePaidFeature('email_send'), handler);
 * ```
 */
export function requirePaidFeature(category: RateLimitCategory) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Chain the middlewares
    const feature = categoryToFeature(category);

    // First check auth (done in requireFeature)
    // Then check feature access
    const featureMiddleware = requireFeature(feature);
    await featureMiddleware(req, res, async () => {
      // Then check rate limit
      const rateLimitMiddleware = rateLimit(category);
      await rateLimitMiddleware(req, res, next);
    });
  };
}

/**
 * Map rate limit category to feature name
 */
function categoryToFeature(category: RateLimitCategory): FeatureName {
  switch (category) {
    case 'email_send':
      return 'send_email';
    case 'address_link':
      return 'api_access';
    default:
      return 'api_access';
  }
}
