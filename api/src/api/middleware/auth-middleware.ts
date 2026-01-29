/**
 * Authentication Middleware
 * Express middleware for JWT-based authentication
 *
 * SECURITY:
 * - Validates JWT tokens on protected routes
 * - Extracts authenticated user info
 * - Rejects invalid or expired tokens
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth/auth-service.js';
import { BlockchainType } from '../../types/blockchain.js';

/**
 * Authenticated request with user info
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    address: string;
    blockchain: BlockchainType;
  };
}

/**
 * Extract JWT token from Authorization header
 * Supports format: "Bearer <token>"
 *
 * @param req - Express request
 * @returns JWT token or null
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Check for Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user info to request
 *
 * Usage:
 * ```typescript
 * router.get('/protected', authMiddleware, (req: AuthenticatedRequest, res) => {
 *   const { address, blockchain } = req.user;
 *   // Handle request
 * });
 * ```
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid token.',
      },
    });
    return;
  }

  // Verify token
  const payload = authService.verifyJWT(token);

  if (!payload) {
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token.',
      },
    });
    return;
  }

  // Attach user info to request
  (req as AuthenticatedRequest).user = {
    address: payload.address,
    blockchain: payload.blockchain,
  };

  next();
}

/**
 * Optional authentication middleware
 * Attaches user info if token is valid, but doesn't reject if missing/invalid
 *
 * Useful for routes that have different behavior for authenticated vs anonymous users
 */
export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (token) {
    const payload = authService.verifyJWT(token);
    if (payload) {
      (req as AuthenticatedRequest).user = {
        address: payload.address,
        blockchain: payload.blockchain,
      };
    }
  }

  next();
}

/**
 * Middleware to check if authenticated user owns a specific address
 * Must be used after authMiddleware
 *
 * Usage:
 * ```typescript
 * router.get('/mailbox/:address',
 *   authMiddleware,
 *   requireAddressOwnership,
 *   handler
 * );
 * ```
 */
export function requireAddressOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): void {
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

  // Get address from route params or query
  const targetAddress = req.params['address'] || req.query['address'];

  if (!targetAddress) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Address parameter required.',
      },
    });
    return;
  }

  // CRITICAL: Case-sensitive comparison
  if (authenticatedReq.user.address !== targetAddress) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this address.',
      },
    });
    return;
  }

  next();
}
