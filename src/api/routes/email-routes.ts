/**
 * Email Routes
 * API endpoints for email sending and management
 *
 * Endpoints:
 * - POST /emails/send - Send an email (paid tier only)
 * - GET /emails/sent - Get sent emails
 * - GET /emails/from-addresses - Get available "from" addresses
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { emailSenderService } from '../../services/email/index.js';

const router: Router = Router();

/**
 * Send email request schema
 */
const sendEmailSchema = z.object({
  userId: z.number().positive('Valid user ID required'),
  fromAddressId: z.number().positive('Valid from address ID required'),
  toAddress: z.string().email('Valid recipient email required'),
  subject: z.string().min(1, 'Subject is required').max(998, 'Subject too long'),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  replyTo: z.string().email().optional(),
}).refine(
  (data) => data.bodyText || data.bodyHtml,
  { message: 'Either bodyText or bodyHtml is required' }
);

/**
 * Get sent emails query schema
 */
const getSentEmailsSchema = z.object({
  userId: z.coerce.number().positive('Valid user ID required'),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * POST /emails/send
 * Send an email (requires paid subscription)
 *
 * Request body:
 * {
 *   "userId": 1,
 *   "fromAddressId": 1,
 *   "toAddress": "recipient@example.com",
 *   "subject": "Hello",
 *   "bodyText": "Plain text body",
 *   "bodyHtml": "<p>HTML body</p>",
 *   "replyTo": "reply@example.com" // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "messageId": "...",
 *   "emailId": "uuid",
 *   "details": {
 *     "provider": "sendgrid",
 *     "deliveryStatus": "sent",
 *     "sentAt": "..."
 *   }
 * }
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const validation = sendEmailSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { userId, fromAddressId, toAddress, subject, bodyText, bodyHtml, replyTo } =
      validation.data;

    const result = await emailSenderService.sendEmail(userId, {
      fromAddressId,
      toAddress,
      subject,
      bodyText,
      bodyHtml,
      replyTo,
    });

    if (!result.success) {
      // Determine appropriate status code
      let status = 400;
      if (result.error?.includes('not found')) {
        status = 404;
      } else if (result.error?.includes('subscription')) {
        status = 403;
      } else if (result.error?.includes('Rate limit')) {
        status = 429;
      } else if (result.error?.includes('permission')) {
        status = 403;
      }

      res.status(status).json({
        error: {
          code: 'SEND_FAILED',
          message: result.error,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      messageId: result.messageId,
      emailId: result.emailId,
      details: result.details,
    });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /emails/sent
 * Get user's sent emails
 *
 * Query params:
 * - userId: number (required)
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 *
 * Response:
 * {
 *   "emails": [...],
 *   "total": 100,
 *   "limit": 50,
 *   "offset": 0
 * }
 */
router.get('/sent', async (req: Request, res: Response) => {
  try {
    const validation = getSentEmailsSchema.safeParse(req.query);

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.errors,
        },
      });
      return;
    }

    const { userId, limit, offset } = validation.data;

    const result = await emailSenderService.getSentEmails(userId, limit, offset);

    res.status(200).json({
      emails: result.emails.map((email) => ({
        id: email.id,
        from: email.senderEmail,
        to: email.recipientAddress,
        subject: email.subject,
        sentAt: email.sentAt,
        deliveryStatus: email.deliveryStatus,
      })),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get sent emails error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /emails/from-addresses
 * Get available "from" addresses for a user
 *
 * Query params:
 * - userId: number (required)
 *
 * Response:
 * {
 *   "addresses": [
 *     {
 *       "id": 1,
 *       "address": "GNa9E2dWP...",
 *       "email": "GNa9E2dWP...@pubkeymail.com",
 *       "blockchain": "solana"
 *     }
 *   ]
 * }
 */
router.get('/from-addresses', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query['userId'] as string, 10);

    if (!userId || isNaN(userId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid userId is required',
        },
      });
      return;
    }

    const addresses = await emailSenderService.getFromAddresses(userId);

    res.status(200).json({ addresses });
  } catch (error) {
    console.error('Get from addresses error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /emails/:emailId
 * Get a specific sent email by ID
 */
router.get('/:emailId', async (req: Request, res: Response) => {
  try {
    const emailId = req.params['emailId'];
    const userId = parseInt(req.query['userId'] as string, 10);

    if (!emailId || !userId || isNaN(userId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid emailId and userId are required',
        },
      });
      return;
    }

    // Get user's sent emails and find the specific one
    const result = await emailSenderService.getSentEmails(userId, 1000, 0);
    const email = result.emails.find((e) => e.id === emailId);

    if (!email) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Email not found',
        },
      });
      return;
    }

    res.status(200).json({
      email: {
        id: email.id,
        from: email.senderEmail,
        to: email.recipientAddress,
        subject: email.subject,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        sentAt: email.sentAt,
        deliveryStatus: email.deliveryStatus,
        messageId: email.smtpMessageId,
      },
    });
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
