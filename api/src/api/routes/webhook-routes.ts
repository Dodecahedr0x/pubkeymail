/**
 * Webhook Routes
 * API endpoints for receiving inbound emails from SMTP providers
 *
 * Endpoints:
 * - POST /webhooks/inbound - Receive inbound emails
 */

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { emailStorageService, resolveEmailToBlockchainAddress } from '../../services/email/index.js';
import {
  parseWebhookEmail,
  webhookToCreateEmailData,
  validateEmailData,
  sanitizeHtmlContent,
} from '../../services/email/webhook-parser.js';
import { smtpConfig } from '../../config/index.js';
import { userService } from '../../services/user/index.js';
import { createLogger } from '../../services/logger/index.js';

const log = createLogger('WebhookRoutes');

const router: Router = Router();

/**
 * Verify SendGrid webhook signature
 * @see https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
function verifySendGridSignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

  if (!signature || !timestamp) return false;

  const payload = timestamp + JSON.stringify(req.body);
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Verify Postmark webhook signature
 * @see https://postmarkapp.com/developer/webhooks/webhooks-overview
 */
function verifyPostmarkSignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-postmark-signature'] as string;

  if (!signature) return false;

  const payload = JSON.stringify(req.body);
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Verify Mailgun webhook signature
 * @see https://documentation.mailgun.com/en/latest/user_manual.html#webhooks-1
 */
function verifyMailgunSignature(req: Request, secret: string): boolean {
  const timestamp = req.body?.signature?.timestamp as string;
  const token = req.body?.signature?.token as string;
  const signature = req.body?.signature?.signature as string;

  if (!timestamp || !token || !signature) return false;

  const expectedSignature = createHmac('sha256', secret)
    .update(timestamp + token)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Verify Mailjet webhook signature
 * @see https://dev.mailjet.com/email/guides/parse-api/
 *
 * Note: Mailjet Parse API (inbound email) does NOT use signature verification.
 * It relies on HTTPS + basic authentication in the webhook URL instead.
 * Only Mailjet event webhooks (open, click, bounce) use signatures.
 * For Parse API, we validate the payload structure instead.
 */
function verifyMailjetSignature(req: Request, _secret: string): boolean {
  // Mailjet Parse API doesn't send a signature header - it uses URL-based auth
  // Check for signature header (event webhooks) vs Parse API payload
  const signature = req.headers['x-mj-signature'] as string;

  if (signature) {
    // This is an event webhook with signature - verify it
    const payload = JSON.stringify(req.body);
    const expectedSignature = createHmac('sha256', _secret)
      .update(payload)
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }

  // Parse API webhook - validate by checking for expected payload structure
  // Mailjet Parse API sends: Sender, Recipient, Subject, etc.
  const body = req.body;
  if (body && (body.Sender || body.From) && (body.Recipient || body.To)) {
    return true;
  }

  return false;
}

/**
 * Verify webhook signature (provider-specific)
 * Implements proper HMAC signature verification for each provider.
 *
 * @param req - Express request
 * @returns True if signature is valid
 */
function verifyWebhookSignature(req: Request): boolean {
  const secret = smtpConfig.webhookSecret;
  const provider = smtpConfig.provider;

  // In development/test mode without production flag, allow unsigned webhooks
  if (process.env['NODE_ENV'] !== 'production') {
    const hasAnySignature =
      req.headers['x-twilio-email-event-webhook-signature'] ||
      req.headers['x-postmark-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.body?.signature?.signature;

    if (!hasAnySignature) {
      return true;
    }
  }

  // Verify based on provider
  switch (provider) {
    case 'sendgrid':
      return verifySendGridSignature(req, secret);
    case 'postmark':
      return verifyPostmarkSignature(req, secret);
    case 'mailgun':
      return verifyMailgunSignature(req, secret);
    case 'mailjet':
      return verifyMailjetSignature(req, secret);
    default: {
      // Fallback: check for generic signature header
      const genericSignature = req.headers['x-webhook-signature'] as string;
      return genericSignature === secret;
    }
  }
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
    log.debug('Received inbound webhook', { provider: smtpConfig.provider, bodyKeys: Object.keys(req.body) });

    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      log.warn('Webhook signature verification failed', { provider: smtpConfig.provider });
      res.status(401).json({
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Webhook signature verification failed',
        },
      });
      return;
    }

    // Parse webhook payload
    const parsed = parseWebhookEmail(req.body, smtpConfig.provider as 'sendgrid' | 'postmark' | 'mailgun' | 'mailjet');

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
      log.warn('Email validation failed', { errors: validationErrors, from: emailData.senderAddress, to: emailData.recipientEmail });
      res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Email validation failed',
          details: validationErrors,
        },
      });
      return;
    }

    // Resolve recipient to blockchain address and check if mailbox is registered
    const { address } = await resolveEmailToBlockchainAddress(emailData.recipientEmail);
    const userResult = await userService.getUserByAddress(address);

    if (!userResult.success || !userResult.data) {
      log.warn('Email discarded - mailbox not registered', { recipientEmail: emailData.recipientEmail, address });
      res.status(200).json({
        success: true,
        message: 'Email discarded - mailbox not registered',
      });
      return;
    }

    // Store email
    const storedEmail = await emailStorageService.storeEmail(emailData);

    log.info('Email processed successfully', { emailId: storedEmail.id, from: emailData.senderAddress, to: emailData.recipientEmail });

    // Success response
    res.status(200).json({
      success: true,
      emailId: storedEmail.id,
    });
  } catch (error) {
    log.error('Webhook processing error', { error: error instanceof Error ? error.message : String(error) });

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
