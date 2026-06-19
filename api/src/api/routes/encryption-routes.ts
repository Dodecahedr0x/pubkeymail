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
import { emailEncryptionService } from '../../services/encryption/email-encryption-service.js';
import { userService } from '../../services/user/index.js';
import {
  authMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth-middleware.js';
import { createLogger } from '../../services/logger/index.js';

const log = createLogger('EncryptionRoutes');
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
    log.debug('Registering encryption key');
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      log.warn('Key registration without authentication');
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
      log.warn('Key registration validation failed', { issues: validation.error.issues });
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
      log.warn('Key registration for unknown user', { address: authReq.user.address });
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

    log.info('Encryption key registered', { userId });
    res.status(200).json({
      success: true,
      message: 'Encryption key registered',
    });
  } catch (error) {
    log.error('Register encryption key error', { error });
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
    log.debug('Getting encryption key', { address });

    if (!address) {
      log.warn('Get key missing address');
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
      log.warn('Encryption key not found', { address });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No encryption key found for this address',
        },
      });
      return;
    }

    log.info('Encryption key retrieved', { address });
    res.status(200).json({
      publicKey,
      encryptionSupported: true,
    });
  } catch (error) {
    log.error('Get encryption key error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve encryption key',
      },
    });
  }
});

/**
 * Encrypt email content for storage.
 *
 * Provide either a `recipientPublicKey` directly, or a `recipientAddress`
 * whose published key will be looked up.
 */
const encryptSchema = z
  .object({
    recipientPublicKey: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/)
      .optional(),
    recipientAddress: z.string().optional(),
    subject: z.string().optional(),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
    senderPublicKey: z.string().optional(),
  })
  .refine((d) => d.recipientPublicKey || d.recipientAddress, {
    message: 'Either recipientPublicKey or recipientAddress is required',
  })
  .refine((d) => d.subject || d.bodyText || d.bodyHtml, {
    message: 'At least one of subject, bodyText, or bodyHtml is required',
  });

/**
 * POST /encryption/encrypt
 * Encrypt email content to a recipient's public key for E2E storage.
 *
 * Response:
 * {
 *   "isEncrypted": true,
 *   "ciphertext": "...",
 *   "encryptionMetadata": { ... }
 * }
 */
router.post('/encrypt', async (req: Request, res: Response) => {
  try {
    const validation = encryptSchema.safeParse(req.body);
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

    const { recipientPublicKey, recipientAddress, subject, bodyText, bodyHtml, senderPublicKey } =
      validation.data;

    let publicKey = recipientPublicKey;
    if (!publicKey && recipientAddress) {
      const resolved = await encryptionService.getPublicKeyByAddress(recipientAddress);
      if (!resolved) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'No encryption key found for recipient address',
          },
        });
        return;
      }
      publicKey = resolved;
    }

    const envelope = await emailEncryptionService.encryptForStorage(
      { subject, bodyText, bodyHtml },
      publicKey!,
      senderPublicKey
    );

    log.info('Email content encrypted', { recipientAddress });
    res.status(200).json(envelope);
  } catch (error) {
    log.error('Encrypt content error', { error });
    res.status(400).json({
      error: {
        code: 'ENCRYPTION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to encrypt content',
      },
    });
  }
});

/**
 * Decrypt a stored encrypted email envelope.
 *
 * The recipient private key is used transiently and never persisted.
 */
const decryptSchema = z.object({
  ciphertext: z.string().min(1, 'Ciphertext is required'),
  encryptionMetadata: z.object({
    algorithm: z.string(),
    version: z.number(),
    encryptedAt: z.string().optional(),
    nonce: z.string(),
    ephemeralPublicKey: z.string(),
    senderPublicKey: z.string().optional(),
  }),
  privateKey: z
    .string()
    .length(64, 'Private key must be 64 hex characters')
    .regex(/^[0-9a-fA-F]+$/, 'Private key must be valid hex'),
});

/**
 * POST /encryption/decrypt
 * Decrypt an encrypted email on retrieval using the recipient's private key.
 *
 * Response:
 * {
 *   "subject": "...",
 *   "bodyText": "...",
 *   "bodyHtml": "..."
 * }
 */
router.post('/decrypt', async (req: Request, res: Response) => {
  try {
    const validation = decryptSchema.safeParse(req.body);
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

    const { ciphertext, encryptionMetadata, privateKey } = validation.data;

    const content = await emailEncryptionService.decryptOnRetrieval(
      {
        ciphertext,
        encryptionMetadata: encryptionMetadata as never,
      },
      privateKey
    );

    res.status(200).json(content);
  } catch (error) {
    log.warn('Decrypt content failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(400).json({
      error: {
        code: 'DECRYPTION_FAILED',
        message: 'Failed to decrypt content - invalid key or corrupted data',
      },
    });
  }
});

export default router;
