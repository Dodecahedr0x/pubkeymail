/**
 * Email Limits Middleware
 * Enforces email size and attachment limits
 *
 * SECURITY:
 * - Prevents oversized payloads
 * - Limits attachment count and size
 * - Must be applied before body parsing for size limits
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';

/**
 * Email size validation result
 */
export interface EmailSizeValidation {
  valid: boolean;
  error?: string;
  details?: {
    totalSize: number;
    maxSize: number;
    attachmentCount: number;
    maxAttachments: number;
    oversizedAttachments?: string[];
  };
}

/**
 * Check email size limits
 */
export function validateEmailSize(email: {
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{
    filename: string;
    size: number;
  }>;
}): EmailSizeValidation {
  const maxEmailSize = config.MAX_EMAIL_SIZE_MB * 1024 * 1024;
  const maxAttachmentSize = config.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
  const maxAttachments = config.MAX_ATTACHMENTS_PER_EMAIL;

  const textSize = email.bodyText ? Buffer.byteLength(email.bodyText, 'utf8') : 0;
  const htmlSize = email.bodyHtml ? Buffer.byteLength(email.bodyHtml, 'utf8') : 0;
  const attachments = email.attachments || [];

  const attachmentTotalSize = attachments.reduce((sum, att) => sum + att.size, 0);
  const totalSize = textSize + htmlSize + attachmentTotalSize;

  // Check total email size
  if (totalSize > maxEmailSize) {
    return {
      valid: false,
      error: `Email size (${formatBytes(totalSize)}) exceeds maximum allowed (${formatBytes(maxEmailSize)})`,
      details: {
        totalSize,
        maxSize: maxEmailSize,
        attachmentCount: attachments.length,
        maxAttachments,
      },
    };
  }

  // Check attachment count
  if (attachments.length > maxAttachments) {
    return {
      valid: false,
      error: `Too many attachments (${attachments.length}). Maximum allowed: ${maxAttachments}`,
      details: {
        totalSize,
        maxSize: maxEmailSize,
        attachmentCount: attachments.length,
        maxAttachments,
      },
    };
  }

  // Check individual attachment sizes
  const oversizedAttachments = attachments
    .filter((att) => att.size > maxAttachmentSize)
    .map((att) => `${att.filename} (${formatBytes(att.size)})`);

  if (oversizedAttachments.length > 0) {
    return {
      valid: false,
      error: `Attachment(s) exceed maximum size (${formatBytes(maxAttachmentSize)}): ${oversizedAttachments.join(', ')}`,
      details: {
        totalSize,
        maxSize: maxEmailSize,
        attachmentCount: attachments.length,
        maxAttachments,
        oversizedAttachments,
      },
    };
  }

  return {
    valid: true,
    details: {
      totalSize,
      maxSize: maxEmailSize,
      attachmentCount: attachments.length,
      maxAttachments,
    },
  };
}

/**
 * Middleware to validate email size before processing
 */
export function emailSizeLimits(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract email data from body
  const { bodyText, bodyHtml, attachments } = req.body as {
    bodyText?: string;
    bodyHtml?: string;
    attachments?: Array<{ filename: string; size: number }>;
  };

  const validation = validateEmailSize({ bodyText, bodyHtml, attachments });

  if (!validation.valid) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: validation.error,
        details: validation.details,
      },
    });
    return;
  }

  next();
}

/**
 * Middleware to check content-length before body parsing
 * Apply this before express.json() for early rejection
 */
export function contentLengthLimit(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > maxBytes) {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Request body too large. Maximum: ${formatBytes(maxBytes)}`,
          details: {
            received: contentLength,
            maximum: maxBytes,
          },
        },
      });
      return;
    }

    next();
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
