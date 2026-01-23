/**
 * Email Limits Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { validateEmailSize, emailSizeLimits, contentLengthLimit } from '../../../src/api/middleware/email-limits-middleware.js';

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    MAX_EMAIL_SIZE_MB: 25,
    MAX_ATTACHMENT_SIZE_MB: 10,
    MAX_ATTACHMENTS_PER_EMAIL: 10,
  },
}));

describe('Email Limits Middleware', () => {
  describe('validateEmailSize', () => {
    it('should allow email within size limits', () => {
      const result = validateEmailSize({
        bodyText: 'Hello, this is a test email.',
        bodyHtml: '<p>Hello, this is a test email.</p>',
      });

      expect(result.valid).toBe(true);
      expect(result.details?.totalSize).toBeGreaterThan(0);
      expect(result.details?.maxSize).toBe(25 * 1024 * 1024);
    });

    it('should reject email exceeding total size limit', () => {
      const largeContent = 'x'.repeat(26 * 1024 * 1024); // 26MB

      const result = validateEmailSize({
        bodyText: largeContent,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject too many attachments', () => {
      const attachments = Array.from({ length: 11 }, (_, i) => ({
        filename: `file${i}.txt`,
        size: 1024, // 1KB each
      }));

      const result = validateEmailSize({
        bodyText: 'Test',
        attachments,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Too many attachments');
      expect(result.details?.attachmentCount).toBe(11);
      expect(result.details?.maxAttachments).toBe(10);
    });

    it('should reject oversized attachments', () => {
      const attachments = [
        { filename: 'small.txt', size: 1024 },
        { filename: 'huge.zip', size: 15 * 1024 * 1024 }, // 15MB > 10MB limit
      ];

      const result = validateEmailSize({
        bodyText: 'Test',
        attachments,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceed maximum size');
      expect(result.details?.oversizedAttachments?.[0]).toContain('huge.zip');
    });

    it('should allow email with valid attachments', () => {
      const attachments = [
        { filename: 'doc.pdf', size: 5 * 1024 * 1024 },
        { filename: 'image.png', size: 2 * 1024 * 1024 },
      ];

      const result = validateEmailSize({
        bodyText: 'Please see attached files.',
        attachments,
      });

      expect(result.valid).toBe(true);
      expect(result.details?.attachmentCount).toBe(2);
    });

    it('should handle empty email', () => {
      const result = validateEmailSize({});

      expect(result.valid).toBe(true);
      expect(result.details?.totalSize).toBe(0);
    });

    it('should calculate total size correctly', () => {
      const bodyText = 'Hello'; // 5 bytes
      const bodyHtml = '<p>Hi</p>'; // 9 bytes
      const attachments = [{ filename: 'test.txt', size: 100 }];

      const result = validateEmailSize({ bodyText, bodyHtml, attachments });

      expect(result.valid).toBe(true);
      expect(result.details?.totalSize).toBe(5 + 9 + 100);
    });
  });

  describe('emailSizeLimits middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = { body: {} };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('should call next for valid email', () => {
      mockReq.body = {
        bodyText: 'Valid email content',
      };

      emailSizeLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 413 for oversized email', () => {
      mockReq.body = {
        bodyText: 'x'.repeat(26 * 1024 * 1024),
      };

      emailSizeLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PAYLOAD_TOO_LARGE',
          }),
        })
      );
    });

    it('should return 413 for too many attachments', () => {
      mockReq.body = {
        bodyText: 'Test',
        attachments: Array.from({ length: 11 }, (_, i) => ({
          filename: `file${i}.txt`,
          size: 100,
        })),
      };

      emailSizeLimits(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(413);
    });
  });

  describe('contentLengthLimit middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = { headers: {} };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('should call next when content-length is within limit', () => {
      mockReq.headers = { 'content-length': '1024' };

      const middleware = contentLengthLimit(10 * 1024 * 1024);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 413 when content-length exceeds limit', () => {
      mockReq.headers = { 'content-length': String(20 * 1024 * 1024) };

      const middleware = contentLengthLimit(10 * 1024 * 1024);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PAYLOAD_TOO_LARGE',
          }),
        })
      );
    });

    it('should allow request without content-length header', () => {
      mockReq.headers = {};

      const middleware = contentLengthLimit(10 * 1024 * 1024);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
