/**
 * Webhook Routes
 * API endpoints for receiving inbound emails from SMTP providers
 *
 * Endpoints:
 * - POST /webhooks/inbound - Receive inbound emails
 */

import { Router, Request, Response } from 'express';
import { emailStorageService } from '../../services/email/index.js';
import {
  parseWebhookEmail,
  webhookToCreateEmailData,
  validateEmailData,
  sanitizeHtmlContent,
} from '../../services/email/webhook-parser.js';
import { smtpConfig } from '../../config/index.js';

const router: Router = Router();

/**
 * Verify webhook signature (provider-specific)
 * This should be implemented based on the SMTP provider being used
 *
 * @param req - Express request
 * @returns True if signature is valid
 */
function verifyWebhookSignature(req: Request): boolean {
  const signature = req.headers['x-webhook-signature'] as string;
  const secret = smtpConfig.webhookSecret;

  // TODO: Implement provider-specific signature verification
  // SendGrid: https://docs.sendgrid.com/for-developers/parsing-email/inbound-email#verify-the-webhook-signature
  // Postmark: Uses X-Postmark-Signature header
  // Mailgun: Uses X-Mailgun-Signature and timestamp

  if (!signature) {
    // For development, allow unsigned webhooks
    // In production, this should return false
    return process.env['NODE_ENV'] !== 'production';
  }

  // Basic validation - check if signature exists and matches secret
  // This is a placeholder - implement proper HMAC verification
  return signature === secret;
}

/**
 * POST /webhooks/inbound
 * Receive inbound email from SMTP provider
 *
 * Request body: Provider-specific format (SendGrid, Postmark, Mailgun)
 *
 * Response (success):
 * {
 *   "success": true,
 *   "emailId": "uuid"
 * }
 *
 * Response (failure):
 * {
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "error details"
 *   }
 * }
 */
router.post('/inbound', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      res.status(401).json({
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Webhook signature verification failed',
        },
      });
      return;
    }

    // Parse webhook payload
    const parsed = parseWebhookEmail(req.body, smtpConfig.provider as any);

    // Convert to email creation data
    let emailData = webhookToCreateEmailData(parsed);

    // Sanitize HTML content if present
    if (emailData.bodyHtml) {
      emailData = {
        ...emailData,
        bodyHtml: sanitizeHtmlContent(emailData.bodyHtml),
      };
    }

    // Validate email data
    const validationErrors = validateEmailData(emailData);
    if (validationErrors.length > 0) {
      res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Email validation failed',
          details: validationErrors,
        },
      });
      return;
    }

    // Store email
    const storedEmail = await emailStorageService.storeEmail(emailData);

    // Success response
    res.status(200).json({
      success: true,
      emailId: storedEmail.id,
    });
  } catch (error) {
    // Log error for debugging
    console.error('Webhook processing error:', error);

    // Check if it's an address resolution error
    if (
      error instanceof Error &&
      (error.message.includes('Invalid blockchain address') ||
        error.message.includes('Failed to resolve'))
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_RECIPIENT',
          message: error.message,
        },
      });
      return;
    }

    // Generic error response
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to process inbound email',
      },
    });
  }
});

/**
 * GET /webhooks/test
 * Test endpoint to verify webhook is accessible
 * Should be disabled in production
 */
router.get('/test', (_req: Request, res: Response) => {
  if (process.env['NODE_ENV'] === 'production') {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not available in production',
      },
    });
    return;
  }

  res.status(200).json({
    message: 'Webhook endpoint is accessible',
    provider: smtpConfig.provider,
    webhookPath: smtpConfig.webhookPath,
  });
});

export default router;
