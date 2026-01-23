/**
 * Encryption Routes
 * API endpoints for encryption key management
 *
 * Endpoints:
 * - POST /encryption/keys - Register user's public encryption key (authenticated)
 * - GET /encryption/keys/:address - Get public key for an address (public)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { encryptionService } from '../../services/encryption/encryption-service.js';
import { userService } from '../../services/user/index.js';
import {
  authMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth-middleware.js';

const router: Router = Router();

/**
 * Public key registration schema
 */
const registerKeySchema = z.object({
  publicKey: z
    .string()
    .length(64, 'Public key must be 64 hex characters')
    .regex(/^[0-9a-fA-F]+$/, 'Public key must be valid hex'),
});

/**
 * Get user ID from authenticated address
 */
async function getUserIdFromAddress(address: string): Promise<number | null> {
  const result = await userService.getUserByAddress(address);
  if (!result.success || !result.data) {
    return null;
  }
  return result.data.id;
}

/**
 * POST /encryption/keys
 * Register user's public encryption key
 *
 * Requires authentication.
 *
 * Request body:
 * {
 *   "publicKey": "64-char-hex-string"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Encryption key registered"
 * }
 */
router.post('/keys', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const validation = registerKeySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.issues,
        },
      });
      return;
    }

    const userId = await getUserIdFromAddress(authReq.user.address);
    if (!userId) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    const { publicKey } = validation.data;
    await encryptionService.storeUserPublicKey(userId, publicKey);

    res.status(200).json({
      success: true,
      message: 'Encryption key registered',
    });
  } catch (error) {
    console.error('Register encryption key error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to register encryption key',
      },
    });
  }
});

/**
 * GET /encryption/keys/:address
 * Get public encryption key for an address
 *
 * Public endpoint - no authentication required.
 *
 * Response (success):
 * {
 *   "publicKey": "64-char-hex-string",
 *   "encryptionSupported": true
 * }
 *
 * Response (not found):
 * {
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "No encryption key found for this address"
 *   }
 * }
 */
router.get('/keys/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params['address'];

    if (!address) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Address is required',
        },
      });
      return;
    }

    const publicKey = await encryptionService.getPublicKeyByAddress(address);

    if (!publicKey) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No encryption key found for this address',
        },
      });
      return;
    }

    res.status(200).json({
      publicKey,
      encryptionSupported: true,
    });
  } catch (error) {
    console.error('Get encryption key error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve encryption key',
      },
    });
  }
});

export default router;
