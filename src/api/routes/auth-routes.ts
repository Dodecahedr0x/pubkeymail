/**
 * Authentication Routes
 * API endpoints for wallet-based authentication
 *
 * Endpoints:
 * - POST /auth/challenge - Request authentication challenge
 * - POST /auth/verify - Verify signature and get JWT token
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../../services/auth/auth-service.js';
import { BlockchainType } from '../../types/blockchain.js';
import { isBlockchainSupported } from '../../services/blockchain/provider-factory.js';
import { bruteForceProtection } from '../../services/security/index.js';
import { rateLimiter } from '../../services/security/index.js';
import { auditLogger } from '../../services/security/index.js';

const router: Router = Router();

/**
 * Request challenge schema validation
 */
const challengeRequestSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
});

/**
 * Verify signature schema validation
 */
const verifyRequestSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
  signature: z.string().min(1, 'Signature is required'),
  nonce: z.string().min(1, 'Nonce is required'),
});

/**
 * POST /auth/challenge
 * Request authentication challenge
 *
 * Request body:
 * {
 *   "address": "blockchain-address",
 *   "blockchain": "solana" | "ethereum" | "polygon"
 * }
 *
 * Response:
 * {
 *   "challenge": "message to sign",
 *   "nonce": "unique nonce",
 *   "expiresAt": "ISO timestamp"
 * }
 */
router.post('/challenge', async (req: Request, res: Response) => {
  const clientIp = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';

  try {
    // Validate request body
    const parseResult = challengeRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { address, blockchain } = parseResult.data;

    // Check rate limit for auth requests
    const rateCheck = await rateLimiter.checkLimit({ key: clientIp, category: 'auth' });
    if (!rateCheck.allowed) {
      auditLogger.log({
        eventType: 'RATE_LIMIT_EXCEEDED',
        actorType: 'anonymous',
        actorAddress: address,
        action: 'challenge_request',
        status: 'blocked',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        metadata: { category: 'auth', remaining: rateCheck.remaining },
      }).catch(() => {});

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Try again after ${rateCheck.resetAt.toISOString()}`,
          retryAfter: rateCheck.retryAfter,
        },
      });
      return;
    }

    // Check if blockchain is supported
    if (!isBlockchainSupported(blockchain)) {
      res.status(400).json({
        error: {
          code: 'UNSUPPORTED_BLOCKCHAIN',
          message: `Blockchain ${blockchain} is not supported`,
        },
      });
      return;
    }

    // Increment rate limit counter
    await rateLimiter.incrementCounter({ key: clientIp, category: 'auth' });

    // Generate challenge
    const challengeResponse = await authService.generateChallenge(
      address,
      blockchain as BlockchainType
    );

    // Log challenge request
    auditLogger.log({
      eventType: 'AUTH_CHALLENGE_REQUESTED',
      actorType: 'anonymous',
      actorAddress: address,
      action: 'challenge_request',
      status: 'success',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      metadata: { blockchain },
    }).catch(() => {});

    res.status(200).json(challengeResponse);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate challenge',
      },
    });
  }
});

/**
 * POST /auth/verify
 * Verify signature and issue JWT token
 *
 * Request body:
 * {
 *   "address": "blockchain-address",
 *   "blockchain": "solana" | "ethereum" | "polygon",
 *   "signature": "base58 or base64 encoded signature",
 *   "nonce": "nonce from challenge"
 * }
 *
 * Response (success):
 * {
 *   "token": "JWT token",
 *   "expiresIn": 86400,
 *   "user": {
 *     "address": "normalized-address",
 *     "blockchain": "solana"
 *   }
 * }
 *
 * Response (failure):
 * {
 *   "error": {
 *     "code": "AUTHENTICATION_FAILED",
 *     "message": "error details"
 *   }
 * }
 */
router.post('/verify', async (req: Request, res: Response) => {
  const clientIp = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'unknown';

  try {
    // Validate request body
    const parseResult = verifyRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { address, blockchain, signature, nonce } = parseResult.data;

    // Check brute force lockout for this address
    const lockoutStatus = await bruteForceProtection.checkLockout(address, 'address');
    if (lockoutStatus.isLocked) {
      auditLogger.log({
        eventType: 'AUTH_BRUTE_FORCE_BLOCKED',
        actorType: 'anonymous',
        actorAddress: address,
        action: 'verify_blocked',
        status: 'blocked',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        metadata: { lockedUntil: lockoutStatus.lockedUntil },
      }).catch(() => {});

      res.status(429).json({
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many failed attempts. Account temporarily locked.',
          lockedUntil: lockoutStatus.lockedUntil?.toISOString(),
          retryAfter: lockoutStatus.unlockIn,
        },
      });
      return;
    }

    // Check if blockchain is supported
    if (!isBlockchainSupported(blockchain)) {
      res.status(400).json({
        error: {
          code: 'UNSUPPORTED_BLOCKCHAIN',
          message: `Blockchain ${blockchain} is not supported`,
        },
      });
      return;
    }

    // Verify signature and authenticate
    const result = await authService.verifyAndAuthenticate(
      address,
      blockchain as BlockchainType,
      signature,
      nonce
    );

    if (!result.success) {
      // Record failed attempt for brute force protection
      await bruteForceProtection.recordFailedAttempt(address, 'address');

      auditLogger.log({
        eventType: 'AUTH_CHALLENGE_FAILED',
        actorType: 'anonymous',
        actorAddress: address,
        action: 'verify_failed',
        status: 'failure',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        metadata: { error: result.error, blockchain },
      }).catch(() => {});

      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: result.error || 'Authentication failed',
        },
      });
      return;
    }

    // Success - reset brute force counter
    await bruteForceProtection.resetAttempts(address, 'address');

    // Log successful authentication
    auditLogger.log({
      eventType: 'AUTH_CHALLENGE_VERIFIED',
      actorType: 'user',
      actorAddress: address,
      action: 'verify_success',
      status: 'success',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      metadata: { blockchain },
    }).catch(() => {});

    // Success - return token
    res.status(200).json({
      token: result.token,
      expiresIn: result.expiresIn,
      user: {
        address: result.address,
        blockchain: result.blockchain,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Authentication failed',
      },
    });
  }
});

export default router;
