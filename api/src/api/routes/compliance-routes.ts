/**
 * Compliance Routes
 * API endpoints for GDPR compliance (data export and deletion)
 *
 * Endpoints:
 * - POST /compliance/export - Request data export
 * - POST /compliance/delete - Request account deletion
 * - GET /compliance/deletion-status - Check scheduled deletion
 * - DELETE /compliance/deletion - Cancel scheduled deletion
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { gdprService } from '../../services/compliance/index.js';
import { userService } from '../../services/user/index.js';
import {
  authMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth-middleware.js';
import { createLogger } from '../../services/logger/index.js';

const log = createLogger('ComplianceRoutes');
const router: Router = Router();

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
 * Deletion request schema
 */
const deletionRequestSchema = z.object({
  gracePeriodDays: z.number().min(0).max(30).optional(),
  immediate: z.boolean().optional().default(false),
});

/**
 * POST /compliance/export
 * Request data export (GDPR Article 20)
 *
 * Requires authentication.
 *
 * Response:
 * {
 *   "export": { ...complete user data export }
 * }
 */
router.post('/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    log.debug('Requesting data export');
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      log.warn('Export request without authentication');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const userId = await getUserIdFromAddress(authReq.user.address);
    if (!userId) {
      log.warn('Export request for unknown user', { address: authReq.user.address });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    const exportData = await gdprService.exportUserData(userId);

    log.info('User data exported', { userId });
    res.status(200).json({
      export: exportData,
    });
  } catch (error) {
    log.error('Export error', { error });
    res.status(500).json({
      error: {
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to export data',
      },
    });
  }
});

/**
 * POST /compliance/delete
 * Request account deletion (GDPR Article 17)
 *
 * Requires authentication.
 *
 * Request body:
 * {
 *   "gracePeriodDays": 7, // optional, default 7
 *   "immediate": false    // optional, skip grace period if true
 * }
 *
 * Response (scheduled):
 * {
 *   "message": "Deletion scheduled",
 *   "scheduledFor": "2024-01-08T00:00:00Z"
 * }
 *
 * Response (immediate):
 * {
 *   "message": "Account deleted",
 *   "deletedResources": { ... }
 * }
 */
router.post('/delete', authMiddleware, async (req: Request, res: Response) => {
  try {
    log.debug('Requesting account deletion', { body: req.body });
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      log.warn('Deletion request without authentication');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const validation = deletionRequestSchema.safeParse(req.body);
    if (!validation.success) {
      log.warn('Deletion request validation failed', { issues: validation.error.issues });
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
      log.warn('Deletion request for unknown user', { address: authReq.user.address });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    const { gracePeriodDays, immediate } = validation.data;

    if (immediate) {
      const result = await gdprService.deleteUserData(userId);

      if (!result.success) {
        log.warn('Immediate deletion failed', { userId, errors: result.errors });
        res.status(500).json({
          error: {
            code: 'DELETION_FAILED',
            message: 'Failed to delete account',
            details: result.errors,
          },
        });
        return;
      }

      log.info('Account deleted immediately', { userId, deletedResources: result.deletedResources });
      res.status(200).json({
        message: 'Account deleted',
        deletedResources: result.deletedResources,
      });
    } else {
      const result = await gdprService.scheduleDeletion(userId, gracePeriodDays);

      log.info('Deletion scheduled', { userId, scheduledFor: result.scheduledFor });
      res.status(200).json({
        message: 'Deletion scheduled',
        scheduledFor: result.scheduledFor,
      });
    }
  } catch (error) {
    log.error('Deletion error', { error });

    if (error instanceof Error && error.message === 'Deletion already scheduled') {
      res.status(409).json({
        error: {
          code: 'ALREADY_SCHEDULED',
          message: 'Deletion is already scheduled for this account',
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'DELETION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to process deletion request',
      },
    });
  }
});

/**
 * GET /compliance/deletion-status
 * Check scheduled deletion status
 *
 * Requires authentication.
 *
 * Response:
 * {
 *   "scheduled": true,
 *   "scheduledFor": "2024-01-08T00:00:00Z"
 * }
 */
router.get('/deletion-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    log.debug('Checking deletion status');
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      log.warn('Deletion status check without authentication');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const userId = await getUserIdFromAddress(authReq.user.address);
    if (!userId) {
      log.warn('Deletion status check for unknown user', { address: authReq.user.address });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    const status = await gdprService.getDeletionStatus(userId);

    if (!status) {
      log.warn('Deletion status not found', { userId });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    log.info('Deletion status retrieved', { userId, scheduled: status.scheduled });
    res.status(200).json(status);
  } catch (error) {
    log.error('Status check error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check deletion status',
      },
    });
  }
});

/**
 * DELETE /compliance/deletion
 * Cancel scheduled deletion
 *
 * Requires authentication.
 *
 * Response (success):
 * {
 *   "message": "Scheduled deletion cancelled"
 * }
 *
 * Response (no scheduled deletion):
 * {
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "No scheduled deletion found"
 *   }
 * }
 */
router.delete('/deletion', authMiddleware, async (req: Request, res: Response) => {
  try {
    log.debug('Cancelling scheduled deletion');
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      log.warn('Cancel deletion without authentication');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const userId = await getUserIdFromAddress(authReq.user.address);
    if (!userId) {
      log.warn('Cancel deletion for unknown user', { address: authReq.user.address });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    const cancelled = await gdprService.cancelScheduledDeletion(userId);

    if (!cancelled) {
      log.warn('No scheduled deletion to cancel', { userId });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No scheduled deletion found',
        },
      });
      return;
    }

    log.info('Scheduled deletion cancelled', { userId });
    res.status(200).json({
      message: 'Scheduled deletion cancelled',
    });
  } catch (error) {
    log.error('Cancel deletion error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel scheduled deletion',
      },
    });
  }
});

export default router;
