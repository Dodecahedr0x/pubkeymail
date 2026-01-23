/**
 * Brute Force Protection Middleware
 * Express middleware to check and enforce brute force lockouts
 *
 * SECURITY:
 * - Blocks requests from locked out addresses/IPs
 * - Returns 429 Too Many Requests with Retry-After header
 */

import { Request, Response, NextFunction } from 'express';
import { bruteForceProtection } from '../../services/security/brute-force-protection.js';

type ProtectionType = 'address' | 'ip' | 'both';

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
  }
  return req.ip || 'unknown';
}

function getAddress(req: Request): string | null {
  return (
    (req.body?.address as string | undefined) ||
    (req.params['address'] as string | undefined) ||
    null
  );
}

export function bruteForceMiddleware(type: ProtectionType) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (type === 'ip' || type === 'both') {
        const ip = getClientIP(req);
        const ipStatus = await bruteForceProtection.checkLockout(ip, 'ip');

        if (ipStatus.isLocked) {
          res.setHeader('Retry-After', String(ipStatus.unlockIn || 0));
          res.status(429).json({
            error: {
              code: 'TOO_MANY_REQUESTS',
              message: 'Too many failed attempts. Please try again later.',
              unlockIn: ipStatus.unlockIn,
              lockedUntil: ipStatus.lockedUntil?.toISOString(),
            },
          });
          return;
        }
      }

      if (type === 'address' || type === 'both') {
        const address = getAddress(req);
        if (address) {
          const addressStatus = await bruteForceProtection.checkLockout(
            address,
            'address'
          );

          if (addressStatus.isLocked) {
            res.setHeader('Retry-After', String(addressStatus.unlockIn || 0));
            res.status(429).json({
              error: {
                code: 'TOO_MANY_REQUESTS',
                message: 'Too many failed attempts. Please try again later.',
                unlockIn: addressStatus.unlockIn,
                lockedUntil: addressStatus.lockedUntil?.toISOString(),
              },
            });
            return;
          }
        }
      }

      next();
    } catch (error) {
      console.error('Brute force middleware error:', error);
      next();
    }
  };
}
