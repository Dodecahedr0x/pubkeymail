/**
 * Forwarding Routes
 * API endpoints for email forwarding rule management
 *
 * Endpoints:
 * - POST /forwarding/rules - Create a forwarding rule
 * - GET /forwarding/rules - Get user's forwarding rules
 * - PUT /forwarding/rules/:ruleId - Update a rule
 * - DELETE /forwarding/rules/:ruleId - Delete a rule
 * - POST /forwarding/verify/:token - Verify destination email
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { forwardingService } from '../../services/email/forwarding-service.js';
import { createLogger } from '../../services/logger/index.js';

const log = createLogger('ForwardingRoutes');
const router: Router = Router();

/**
 * Filter conditions schema
 */
const filterConditionsSchema = z.object({
  fromContains: z.array(z.string()).optional(),
  subjectContains: z.array(z.string()).optional(),
  bodyContains: z.array(z.string()).optional(),
  excludeFrom: z.array(z.string()).optional(),
  excludeSubject: z.array(z.string()).optional(),
  excludeBody: z.array(z.string()).optional(),
  hasAttachment: z.boolean().optional(),
  matchAll: z.boolean().optional(),
}).optional();

/**
 * Create forwarding rule request schema
 */
const createRuleSchema = z.object({
  userId: z.number().positive('Valid user ID required'),
  sourceAddressId: z.number().positive('Valid source address ID required'),
  destinationEmail: z.string().email('Valid destination email required'),
  filterConditions: filterConditionsSchema,
});

/**
 * Update forwarding rule request schema
 */
const updateRuleSchema = z.object({
  userId: z.number().positive('Valid user ID required'),
  destinationEmail: z.string().email('Valid destination email required').optional(),
  filterConditions: filterConditionsSchema.nullable(),
  enabled: z.boolean().optional(),
});

/**
 * Get rules query schema
 */
const getRulesQuerySchema = z.object({
  userId: z.coerce.number().positive('Valid user ID required'),
});

/**
 * Delete rule query schema
 */
const deleteRuleQuerySchema = z.object({
  userId: z.coerce.number().positive('Valid user ID required'),
});

/**
 * POST /forwarding/rules
 * Create a new forwarding rule (requires paid subscription)
 *
 * Request body:
 * {
 *   "userId": 1,
 *   "sourceAddressId": 1,
 *   "destinationEmail": "forward@example.com",
 *   "filterConditions": {
 *     "fromContains": ["important"],
 *     "subjectContains": ["urgent"],
 *     "excludeFrom": ["spam"],
 *     "excludeSubject": ["newsletter"]
 *   }
 * }
 */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    log.debug('Creating forwarding rule', { body: req.body });
    const validation = createRuleSchema.safeParse(req.body);

    if (!validation.success) {
      log.warn('Create rule validation failed', { issues: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId, sourceAddressId, destinationEmail, filterConditions } = validation.data;

    const result = await forwardingService.createRule({
      userId,
      sourceAddressId,
      destinationEmail,
      filterConditions: filterConditions || undefined,
    });

    if (!result.success) {
      let status = 400;
      if (result.error?.includes('subscription') || result.error?.includes('paid')) {
        status = 403;
      } else if (result.error?.includes('not own')) {
        status = 403;
      }

      log.warn('Create rule failed', { userId, sourceAddressId, error: result.error });
      res.status(status).json({
        error: {
          code: 'CREATE_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Forwarding rule created', { userId, ruleId: result.data?.id, sourceAddressId });
    res.status(201).json({
      success: true,
      rule: result.data,
    });
  } catch (error) {
    log.error('Create forwarding rule error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /forwarding/rules
 * Get user's forwarding rules
 *
 * Query params:
 * - userId: number (required)
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    log.debug('Getting forwarding rules', { query: req.query });
    const validation = getRulesQuerySchema.safeParse(req.query);

    if (!validation.success) {
      log.warn('Get rules validation failed', { issues: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId } = validation.data;

    const rules = await forwardingService.getRules(userId);

    log.info('Forwarding rules retrieved', { userId, count: rules.length });
    res.status(200).json({
      rules,
    });
  } catch (error) {
    log.error('Get forwarding rules error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * PUT /forwarding/rules/:ruleId
 * Update a forwarding rule
 *
 * Request body:
 * {
 *   "userId": 1,
 *   "destinationEmail": "new-forward@example.com",
 *   "filterConditions": { ... },
 *   "enabled": false
 * }
 */
router.put('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const ruleId = parseInt(req.params['ruleId'] as string, 10);
    log.debug('Updating forwarding rule', { ruleId, body: req.body });

    if (isNaN(ruleId) || ruleId <= 0) {
      log.warn('Update rule invalid ruleId', { ruleId: req.params['ruleId'] });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid ruleId is required',
        },
      });
      return;
    }

    const validation = updateRuleSchema.safeParse(req.body);

    if (!validation.success) {
      log.warn('Update rule validation failed', { ruleId, issues: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId, destinationEmail, filterConditions, enabled } = validation.data;

    const result = await forwardingService.updateRule(ruleId, userId, {
      destinationEmail,
      filterConditions,
      enabled,
    });

    if (!result.success) {
      let status = 400;
      if (result.error?.includes('not found')) {
        status = 404;
      } else if (result.error?.includes('not own')) {
        status = 403;
      }

      log.warn('Update rule failed', { ruleId, userId, error: result.error });
      res.status(status).json({
        error: {
          code: 'UPDATE_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Forwarding rule updated', { ruleId, userId });
    res.status(200).json({
      success: true,
      rule: result.data,
    });
  } catch (error) {
    log.error('Update forwarding rule error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * DELETE /forwarding/rules/:ruleId
 * Delete a forwarding rule
 *
 * Query params:
 * - userId: number (required)
 */
router.delete('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const ruleId = parseInt(req.params['ruleId'] as string, 10);
    log.debug('Deleting forwarding rule', { ruleId, query: req.query });

    if (isNaN(ruleId) || ruleId <= 0) {
      log.warn('Delete rule invalid ruleId', { ruleId: req.params['ruleId'] });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid ruleId is required',
        },
      });
      return;
    }

    const validation = deleteRuleQuerySchema.safeParse(req.query);

    if (!validation.success) {
      log.warn('Delete rule validation failed', { ruleId, issues: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId } = validation.data;

    const result = await forwardingService.deleteRule(ruleId, userId);

    if (!result.success) {
      log.warn('Delete rule failed', { ruleId, userId, error: result.error });
      res.status(404).json({
        error: {
          code: 'DELETE_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Forwarding rule deleted', { ruleId, userId });
    res.status(204).send();
  } catch (error) {
    log.error('Delete forwarding rule error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /forwarding/verify/:token
 * Verify a forwarding destination email
 */
router.post('/verify/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params['token'];
    log.debug('Verifying forwarding destination', { token: token ? '***' : undefined });

    if (!token) {
      log.warn('Verify destination missing token');
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Verification token is required',
        },
      });
      return;
    }

    const result = await forwardingService.verifyDestination(token);

    if (!result.success) {
      log.warn('Verify destination failed', { error: result.error });
      res.status(400).json({
        error: {
          code: 'VERIFICATION_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Forwarding destination verified', { ruleId: result.data?.id });
    res.status(200).json({
      success: true,
      rule: result.data,
    });
  } catch (error) {
    log.error('Verify forwarding destination error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
