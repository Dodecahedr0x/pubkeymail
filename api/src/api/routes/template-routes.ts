/**
 * Email Template Routes
 * API endpoints for managing and rendering reusable email templates.
 *
 * Endpoints:
 * - POST   /templates              - Create a template
 * - GET    /templates?userId=      - List a user's templates
 * - GET    /templates/:id?userId=  - Get a single template (with variables)
 * - DELETE /templates/:id?userId=  - Delete a template
 * - POST   /templates/:id/render   - Render a template with variable values
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  emailTemplateService,
  extractVariables,
} from '../../services/email/template-service.js';
import { createLogger } from '../../services/logger/index.js';

const log = createLogger('TemplateRoutes');
const router: Router = Router();

const createTemplateSchema = z
  .object({
    userId: z.number().positive('Valid user ID required'),
    name: z.string().min(1, 'Name is required').max(120, 'Name too long'),
    subject: z.string().min(1, 'Subject is required').max(998, 'Subject too long'),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
  })
  .refine((data) => data.bodyText || data.bodyHtml, {
    message: 'Either bodyText or bodyHtml is required',
  });

const userIdQuerySchema = z.object({
  userId: z.coerce.number().positive('Valid user ID required'),
});

const renderSchema = z.object({
  userId: z.number().positive('Valid user ID required'),
  variables: z.record(z.string(), z.unknown()).default({}),
});

function templateVariables(subject: string, bodyText?: string, bodyHtml?: string): string[] {
  const all = new Set<string>([
    ...extractVariables(subject),
    ...(bodyText ? extractVariables(bodyText) : []),
    ...(bodyHtml ? extractVariables(bodyHtml) : []),
  ]);
  return [...all];
}

function validationError(res: Response, issues: unknown): void {
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: issues },
  });
}

/**
 * POST /templates
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createTemplateSchema.safeParse(req.body);
    if (!validation.success) {
      validationError(res, validation.error.issues);
      return;
    }
    const template = emailTemplateService.create(validation.data);
    log.info('Template created', { templateId: template.id, userId: template.userId });
    res.status(201).json({
      template: {
        ...template,
        variables: templateVariables(template.subject, template.bodyText, template.bodyHtml),
      },
    });
  } catch (error) {
    log.error('Create template error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
});

/**
 * GET /templates?userId=
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const validation = userIdQuerySchema.safeParse(req.query);
    if (!validation.success) {
      validationError(res, validation.error.issues);
      return;
    }
    const templates = emailTemplateService.list(validation.data.userId);
    res.status(200).json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        variables: templateVariables(t.subject, t.bodyText, t.bodyHtml),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (error) {
    log.error('List templates error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
});

/**
 * GET /templates/:id?userId=
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const validation = userIdQuerySchema.safeParse(req.query);
    if (!validation.success) {
      validationError(res, validation.error.issues);
      return;
    }
    const template = emailTemplateService.get(req.params['id']!, validation.data.userId);
    if (!template) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
      return;
    }
    res.status(200).json({
      template: {
        ...template,
        variables: templateVariables(template.subject, template.bodyText, template.bodyHtml),
      },
    });
  } catch (error) {
    log.error('Get template error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
});

/**
 * DELETE /templates/:id?userId=
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const validation = userIdQuerySchema.safeParse(req.query);
    if (!validation.success) {
      validationError(res, validation.error.issues);
      return;
    }
    const deleted = emailTemplateService.delete(req.params['id']!, validation.data.userId);
    if (!deleted) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    log.error('Delete template error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
});

/**
 * POST /templates/:id/render
 */
router.post('/:id/render', async (req: Request, res: Response) => {
  try {
    const validation = renderSchema.safeParse(req.body);
    if (!validation.success) {
      validationError(res, validation.error.issues);
      return;
    }
    const rendered = emailTemplateService.render(
      req.params['id']!,
      validation.data.userId,
      validation.data.variables
    );
    if (!rendered) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
      return;
    }
    res.status(200).json({ rendered });
  } catch (error) {
    log.error('Render template error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
});

export default router;
