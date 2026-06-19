/**
 * Email Routes
 * API endpoints for email sending and management
 *
 * Endpoints:
 * - GET /emails/mailbox/:userId - Get user's unified mailbox with optional filtering
 * - POST /emails/send - Send an email (paid tier only)
 * - GET /emails/sent - Get sent emails
 * - GET /emails/from-addresses - Get available "from" addresses
 * - GET /emails/:emailId - Get specific email details
 * - DELETE /emails/:emailId - Delete an email
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { emailSenderService, groupIntoThreads } from '../../services/email/index.js';
import { addressLinkingService, userService } from '../../services/user/index.js';
import { createLogger } from '../../services/logger/index.js';

const router: Router = Router();
const log = createLogger('EmailRoutes');

/**
 * Mailbox query schema
 */
const getMailboxSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sourceAddress: z.string().optional(), // Filter by specific source address
});

/**
 * GET /emails/mailbox/:userId
 * Get user's unified mailbox (all linked addresses)
 *
 * Query params:
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 * - sourceAddress: string (optional) - Filter by specific source address
 *
 * Response:
 * {
 *   "emails": [...],
 *   "total": 100,
 *   "limit": 50,
 *   "offset": 0,
 *   "addresses": [...] - List of addresses included in the mailbox
 * }
 */
router.get('/mailbox/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params['userId'] || '0', 10);
    log.debug('Get mailbox request', { userId, query: req.query });

    if (!userId || isNaN(userId)) {
      log.warn('Invalid user ID in mailbox request', { userId: req.params['userId'] });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid user ID is required',
        },
      });
      return;
    }

    const validation = getMailboxSchema.safeParse(req.query);

    if (!validation.success) {
      log.warn('Mailbox query validation failed', { userId, errors: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { limit, offset, sourceAddress } = validation.data;

    // Get unified mailbox for user
    const result = await addressLinkingService.getUnifiedMailbox(userId, limit, offset, sourceAddress);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: {
          code: 'FETCH_FAILED',
          message: result.error || 'Failed to fetch mailbox',
        },
      });
      return;
    }

    // Get user's addresses for filtering UI
    const userResult = await userService.getUserById(userId);
    const linkedAddressesResult = await addressLinkingService.getLinkedAddresses(userId);
    
    const addresses: Array<{ address: string; isPrimary: boolean }> = [];
    
    if (userResult.success && userResult.data) {
      addresses.push({ address: userResult.data.primaryAddress, isPrimary: true });
    }
    
    if (linkedAddressesResult.success && linkedAddressesResult.data) {
      for (const la of linkedAddressesResult.data) {
        addresses.push({ address: la.address, isPrimary: false });
      }
    }

    log.info('Mailbox retrieved successfully', { userId, emailCount: result.data!.emails.length, total: result.data!.total });
    res.status(200).json({
      emails: result.data!.emails.map((email) => ({
        id: email.id,
        from: email.from,
        to: email.sourceAddress,
        subject: email.subject,
        receivedAt: email.receivedAt,
        read: email.read,
      })),
      total: result.data!.total,
      limit,
      offset,
      addresses,
    });
  } catch (error) {
    log.error('Get mailbox error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * GET /emails/mailbox/:userId/:emailId
 * Get a specific received email by ID
 */
router.get('/mailbox/:userId/:emailId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params['userId'] || '0', 10);
    const emailId = req.params['emailId'];
    log.debug('Get received email request', { userId, emailId });

    if (!userId || isNaN(userId) || !emailId) {
      log.warn('Invalid userId or emailId in get received email request', { userId, emailId });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid userId and emailId are required',
        },
      });
      return;
    }

    const result = await addressLinkingService.getEmailById(userId, emailId);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: {
          code: status === 404 ? 'NOT_FOUND' : 'FETCH_FAILED',
          message: result.error || 'Failed to fetch email',
        },
      });
      return;
    }

    log.info('Received email retrieved successfully', { userId, emailId });
    res.status(200).json({
      email: result.data,
    });
  } catch (error) {
    log.error('Get received email error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * Attachment schema
 */
const attachmentSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  content: z.string().min(1, 'Content is required'),
  contentType: z.string().min(1, 'Content type is required'),
});

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
  attachments: z.array(attachmentSchema).max(10, 'Maximum 10 attachments allowed').optional(),
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
    log.debug('Send email request', { body: { ...req.body, bodyText: undefined, bodyHtml: undefined } });
    const validation = sendEmailSchema.safeParse(req.body);

    if (!validation.success) {
      log.warn('Send email validation failed', { errors: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId, fromAddressId, toAddress, subject, bodyText, bodyHtml, replyTo, attachments } =
      validation.data;

    const result = await emailSenderService.sendEmail(userId, {
      fromAddressId,
      toAddress,
      subject,
      bodyText,
      bodyHtml,
      replyTo,
      attachments,
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
        log.warn('Email rate limit exceeded', { userId, fromAddressId, toAddress });
      } else if (result.error?.includes('permission')) {
        status = 403;
      }

      log.warn('Email send failed', { userId, toAddress, error: result.error, status });
      res.status(status).json({
        error: {
          code: 'SEND_FAILED',
          message: result.error,
        },
      });
      return;
    }

    log.info('Email sent successfully', { userId, emailId: result.emailId, toAddress, messageId: result.messageId });
    res.status(200).json({
      success: true,
      messageId: result.messageId,
      emailId: result.emailId,
      details: result.details,
    });
  } catch (error) {
    log.error('Send email error', { error });
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
    log.debug('Get sent emails request', { query: req.query });
    const validation = getSentEmailsSchema.safeParse(req.query);

    if (!validation.success) {
      log.warn('Get sent emails validation failed', { errors: validation.error.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { userId, limit, offset } = validation.data;

    const result = await emailSenderService.getSentEmails(userId, limit, offset);

    log.info('Sent emails retrieved', { userId, count: result.emails.length, total: result.total });
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
    log.error('Get sent emails error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * Threads query schema
 */
const getThreadsSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(100),
  offset: z.coerce.number().min(0).default(0),
  sourceAddress: z.string().optional(),
});

/**
 * GET /emails/threads/:userId
 * Get the user's mailbox grouped into conversation threads.
 *
 * Query params:
 * - limit: number of emails to group (default 100, max 200)
 * - offset: pagination offset
 * - sourceAddress: optional filter by source address
 */
router.get('/threads/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params['userId'] || '0', 10);
    if (!userId || isNaN(userId)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Valid user ID is required' },
      });
      return;
    }

    const validation = getThreadsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { limit, offset, sourceAddress } = validation.data;
    const result = await addressLinkingService.getUnifiedMailbox(userId, limit, offset, sourceAddress);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: { code: 'FETCH_FAILED', message: result.error || 'Failed to fetch mailbox' },
      });
      return;
    }

    const threads = groupIntoThreads(
      result.data!.emails.map((email) => ({
        id: email.id,
        subject: email.subject,
        senderAddress: email.from,
        receivedAt: new Date(email.receivedAt),
        headers: {},
      }))
    );

    log.info('Mailbox threads retrieved', { userId, threadCount: threads.length });
    res.status(200).json({
      threads: threads.map((thread) => ({
        id: thread.id,
        subject: thread.subject,
        messageCount: thread.messageCount,
        lastMessageAt: thread.lastMessageAt,
        participants: thread.participants,
        emails: thread.emails.map((e) => ({
          id: e.id,
          from: e.senderAddress,
          subject: e.subject,
          receivedAt: e.receivedAt,
        })),
      })),
      total: result.data!.total,
    });
  } catch (error) {
    log.error('Get threads error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
});

/**
 * Search mailbox query schema
 */
const searchMailboxSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(500, 'Query too long'),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * GET /emails/search/:userId
 * Search a user's unified mailbox.
 *
 * Query params:
 * - q: search query (supports from:, subject:, has:attachment, "quoted phrases")
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 */
router.get('/search/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params['userId'] || '0', 10);
    if (!userId || isNaN(userId)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Valid user ID is required' },
      });
      return;
    }

    const validation = searchMailboxSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: validation.error.issues,
        },
      });
      return;
    }

    const { q, limit, offset } = validation.data;
    const result = await addressLinkingService.searchMailbox(userId, q, limit, offset);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400;
      res.status(status).json({
        error: { code: 'SEARCH_FAILED', message: result.error || 'Search failed' },
      });
      return;
    }

    log.info('Mailbox search completed', { userId, query: q, results: result.data!.emails.length });
    res.status(200).json({
      emails: result.data!.emails.map((email) => ({
        id: email.id,
        from: email.from,
        to: email.sourceAddress,
        subject: email.subject,
        receivedAt: email.receivedAt,
        read: email.read,
      })),
      total: result.data!.total,
      query: q,
      limit,
      offset,
    });
  } catch (error) {
    log.error('Mailbox search error', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
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
    log.debug('Get from addresses request', { userId });

    if (!userId || isNaN(userId)) {
      log.warn('Invalid userId in from-addresses request', { userId: req.query['userId'] });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid userId is required',
        },
      });
      return;
    }

    const addresses = await emailSenderService.getFromAddresses(userId);

    log.info('From addresses retrieved', { userId, count: addresses.length });
    res.status(200).json({ addresses });
  } catch (error) {
    log.error('Get from addresses error', { error });
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
    log.debug('Get email request', { emailId, userId });

    if (!emailId || !userId || isNaN(userId)) {
      log.warn('Invalid emailId or userId in get email request', { emailId, userId: req.query['userId'] });
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
      log.warn('Email not found', { emailId, userId });
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Email not found',
        },
      });
      return;
    }

    log.info('Email retrieved', { emailId, userId });
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
    log.error('Get email error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
