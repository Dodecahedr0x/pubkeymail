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

    // Generate challenge
    const challengeResponse = await authService.generateChallenge(
      address,
      blockchain as BlockchainType
    );

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
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: result.error || 'Authentication failed',
        },
      });
      return;
    }

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
