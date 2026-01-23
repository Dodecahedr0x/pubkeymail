/**
 * User Routes
 * API endpoints for user registration and profile management
 *
 * Endpoints:
 * - POST /users/register - Register new user with wallet
 * - GET /users/me - Get current user profile
 * - GET /users/:address - Get user by address (public info only)
 * - POST /users/link-address - Link additional address
 * - DELETE /users/addresses/:addressId - Unlink address
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { userService } from '../../services/user/index.js';
import type { BlockchainType } from '../../types/blockchain.js';

const router: Router = Router();

/**
 * Registration request schema
 */
const registerSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
});

/**
 * Link address request schema
 */
const linkAddressSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  blockchain: z.enum(['solana', 'ethereum', 'polygon']).default('solana'),
});

/**
 * POST /users/register
 * Register a new user with wallet address
 *
 * This endpoint should be called AFTER successful wallet authentication
 * The auth middleware should have already verified the signature
 *
 * Request body:
 * {
 *   "address": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
 *   "blockchain": "solana"
 * }
 *
 * Response (success):
 * {
 *   "user": {
 *     "id": 1,
 *     "primaryAddress": "GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A",
 *     "blockchain": "solana",
 *     "subscriptionStatus": "inactive",
 *     "subscriptionTier": "free",
 *     "createdAt": "2024-01-01T00:00:00Z"
 *   }
 * }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);

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

    const { address, blockchain } = validation.data;

    const result = await userService.registerUser({
      address,
      blockchain: blockchain as BlockchainType,
    });

    if (!result.success) {
      // Check if user already exists
      if (result.error?.includes('already registered')) {
        res.status(409).json({
          error: {
            code: 'USER_EXISTS',
            message: result.error,
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'REGISTRATION_FAILED',
          message: result.error || 'Failed to register user',
        },
      });
      return;
    }

    res.status(201).json({
      user: {
        id: result.data!.id,
        primaryAddress: result.data!.primaryAddress,
        blockchain: result.data!.blockchain,
        subscriptionStatus: result.data!.subscriptionStatus,
        subscriptionTier: result.data!.subscriptionTier,
        createdAt: result.data!.createdAt,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /users/check/:address
 * Check if an address is registered
 *
 * Response:
 * {
 *   "registered": true
 * }
 */
router.get('/check/:address', async (req: Request, res: Response) => {
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

    const registered = await userService.isAddressRegistered(address);

    res.status(200).json({
      registered,
    });
  } catch (error) {
    console.error('Check address error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /users/profile/:address
 * Get user profile by address
 *
 * Response:
 * {
 *   "user": {
 *     "id": 1,
 *     "primaryAddress": "...",
 *     "subscriptionTier": "free",
 *     ...
 *   }
 * }
 */
router.get('/profile/:address', async (req: Request, res: Response) => {
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

    const result = await userService.getUserByAddress(address);

    if (!result.success) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.status(200).json({
      user: {
        id: result.data!.id,
        primaryAddress: result.data!.primaryAddress,
        blockchain: result.data!.blockchain,
        subscriptionStatus: result.data!.subscriptionStatus,
        subscriptionTier: result.data!.subscriptionTier,
        createdAt: result.data!.createdAt,
        linkedAddresses: result.data!.linkedAddresses.map((la) => ({
          address: la.address,
          blockchain: la.blockchain,
          verifiedAt: la.verifiedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /users/:userId/link-address
 * Link an additional address to user account
 *
 * This endpoint requires:
 * 1. User to be authenticated
 * 2. Signature verification for the new address
 *
 * Request body:
 * {
 *   "address": "...",
 *   "blockchain": "solana"
 * }
 */
router.post('/:userId/link-address', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params['userId'] || '0', 10);

    if (!userId || isNaN(userId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid user ID is required',
        },
      });
      return;
    }

    const validation = linkAddressSchema.safeParse(req.body);

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

    const { address, blockchain } = validation.data;

    const result = await userService.linkAddress(
      userId,
      address,
      blockchain as BlockchainType
    );

    if (!result.success) {
      const status = result.error?.includes('already linked') ? 409 : 400;
      res.status(status).json({
        error: {
          code: 'LINK_FAILED',
          message: result.error || 'Failed to link address',
        },
      });
      return;
    }

    res.status(201).json({
      linkedAddress: {
        id: result.data!.id,
        address: result.data!.address,
        blockchain: result.data!.blockchain,
        verifiedAt: result.data!.verifiedAt,
      },
    });
  } catch (error) {
    console.error('Link address error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * DELETE /users/:userId/addresses/:addressId
 * Unlink an address from user account
 */
router.delete('/:userId/addresses/:addressId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params['userId'] || '0', 10);
    const addressId = parseInt(req.params['addressId'] || '0', 10);

    if (!userId || isNaN(userId) || !addressId || isNaN(addressId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid user ID and address ID are required',
        },
      });
      return;
    }

    const result = await userService.unlinkAddress(userId, addressId);

    if (!result.success) {
      const status = result.error?.includes('primary') ? 400 : 404;
      res.status(status).json({
        error: {
          code: 'UNLINK_FAILED',
          message: result.error || 'Failed to unlink address',
        },
      });
      return;
    }

    res.status(200).json({
      message: 'Address unlinked successfully',
    });
  } catch (error) {
    console.error('Unlink address error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
