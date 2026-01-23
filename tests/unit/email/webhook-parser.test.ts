/**
 * Webhook Parser Tests
 * Tests for SMTP webhook parsing from various providers
 */

import { describe, it, expect } from 'vitest';
import {
  parseSendGridWebhook,
  parsePostmarkWebhook,
  parseMailgunWebhook,
  parseWebhookEmail,
  webhookToCreateEmailData,
  validateEmailData,
  sanitizeHtmlContent,
} from '../../../src/services/email/webhook-parser.js';

describe('WebhookParser', () => {
  describe('parseSendGridWebhook', () => {
    it('should parse basic SendGrid webhook', () => {
      const payload = {
        to: 'recipient@domain.tld',
        from: 'sender@example.com',
        subject: 'Test Email',
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      };

      const result = parseSendGridWebhook(payload);

      expect(result.to).toBe('recipient@domain.tld');
      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Test Email');
      expect(result.bodyText).toBe('Plain text body');
      expect(result.bodyHtml).toBe('<p>HTML body</p>');
    });

    it('should parse SendGrid webhook with headers', () => {
      const payload = {
        to: 'recipient@domain.tld',
        from: 'sender@example.com',
        headers: JSON.stringify({ 'Message-ID': '<test@example.com>' }),
      };

      const result = parseSendGridWebhook(payload);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Message-ID']).toBe('<test@example.com>');
    });

    it('should parse SendGrid webhook with attachments', () => {
      const payload = {
        to: 'recipient@domain.tld',
        from: 'sender@example.com',
        attachments: JSON.stringify([
          {
            filename: 'test.pdf',
            type: 'application/pdf',
            content: 'base64content',
          },
        ]),
      };

      const result = parseSendGridWebhook(payload);

      expect(result.attachments).toBeDefined();
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments![0]!.filename).toBe('test.pdf');
      expect(result.attachments![0]!.contentType).toBe('application/pdf');
    });
  });

  describe('parsePostmarkWebhook', () => {
    it('should parse basic Postmark webhook', () => {
      const payload = {
        To: 'recipient@domain.tld',
        From: 'sender@example.com',
        Subject: 'Test Email',
        TextBody: 'Plain text body',
        HtmlBody: '<p>HTML body</p>',
      };

      const result = parsePostmarkWebhook(payload);

      expect(result.to).toBe('recipient@domain.tld');
      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Test Email');
      expect(result.bodyText).toBe('Plain text body');
      expect(result.bodyHtml).toBe('<p>HTML body</p>');
    });

    it('should parse Postmark webhook with headers', () => {
      const payload = {
        To: 'recipient@domain.tld',
        From: 'sender@example.com',
        Headers: [{ Name: 'Message-ID', Value: '<test@example.com>' }],
      };

      const result = parsePostmarkWebhook(payload);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Message-ID']).toBe('<test@example.com>');
    });

    it('should parse Postmark webhook with attachments', () => {
      const payload = {
        To: 'recipient@domain.tld',
        From: 'sender@example.com',
        Attachments: [
          {
            Name: 'test.pdf',
            ContentType: 'application/pdf',
            Content: 'base64content',
            ContentLength: 1024,
          },
        ],
      };

      const result = parsePostmarkWebhook(payload);

      expect(result.attachments).toBeDefined();
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments![0]!.filename).toBe('test.pdf');
      expect(result.attachments![0]!.size).toBe(1024);
    });
  });

  describe('parseMailgunWebhook', () => {
    it('should parse basic Mailgun webhook', () => {
      const payload = {
        recipient: 'recipient@domain.tld',
        sender: 'sender@example.com',
        subject: 'Test Email',
        'body-plain': 'Plain text body',
        'body-html': '<p>HTML body</p>',
      };

      const result = parseMailgunWebhook(payload);

      expect(result.to).toBe('recipient@domain.tld');
      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Test Email');
      expect(result.bodyText).toBe('Plain text body');
      expect(result.bodyHtml).toBe('<p>HTML body</p>');
    });
  });

  describe('parseWebhookEmail (auto-detect)', () => {
    it('should auto-detect Postmark format', () => {
      const payload = {
        To: 'recipient@domain.tld',
        From: 'sender@example.com',
        TextBody: 'Plain text',
      };

      const result = parseWebhookEmail(payload);

      expect(result.to).toBe('recipient@domain.tld');
      expect(result.from).toBe('sender@example.com');
    });

    it('should auto-detect Mailgun format', () => {
      const payload = {
        recipient: 'recipient@domain.tld',
        sender: 'sender@example.com',
        'body-plain': 'Plain text',
      };

      const result = parseWebhookEmail(payload);

      expect(result.to).toBe('recipient@domain.tld');
      expect(result.from).toBe('sender@example.com');
    });

    it('should default to SendGrid format', () => {
      const payload = {
        to: 'recipient@domain.tld',
        from: 'sender@example.com',
        text: 'Plain text',
      };

      const result = parseWebhookEmail(payload);

      expect(result.to).toBe('recipient@domain.tld');
      expect(result.from).toBe('sender@example.com');
    });
  });

  describe('webhookToCreateEmailData', () => {
    it('should convert parsed webhook to CreateEmailData', () => {
      const parsed = {
        to: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@domain.tld',
        from: 'sender@example.com',
        subject: 'Test',
        bodyText: 'Text',
        bodyHtml: '<p>HTML</p>',
      };

      const result = webhookToCreateEmailData(parsed);

      expect(result.recipientEmail).toBe(parsed.to);
      expect(result.senderAddress).toBe(parsed.from);
      expect(result.subject).toBe(parsed.subject);
      expect(result.bodyText).toBe(parsed.bodyText);
      expect(result.bodyHtml).toBe(parsed.bodyHtml);
    });

    it('should preserve case sensitivity of recipient', () => {
      const parsed = {
        to: 'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@domain.tld',
        from: 'sender@example.com',
      };

      const result = webhookToCreateEmailData(parsed);

      expect(result.recipientEmail).toBe(
        'GNa9E2dWP8e2fg23pRJoiCvJm5cbzomm94YzotpcRh7A@domain.tld'
      );
    });
  });

  describe('validateEmailData', () => {
    it('should validate valid email data', () => {
      const data = {
        recipientEmail: 'recipient@domain.tld',
        senderAddress: 'sender@example.com',
        bodyText: 'Text content',
      };

      const errors = validateEmailData(data);

      expect(errors).toHaveLength(0);
    });

    it('should reject email without recipient', () => {
      const data = {
        recipientEmail: '',
        senderAddress: 'sender@example.com',
        bodyText: 'Text',
      };

      const errors = validateEmailData(data);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('recipient'))).toBe(true);
    });

    it('should reject email without sender', () => {
      const data = {
        recipientEmail: 'recipient@domain.tld',
        senderAddress: '',
        bodyText: 'Text',
      };

      const errors = validateEmailData(data);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('sender'))).toBe(true);
    });

    it('should reject email without body', () => {
      const data = {
        recipientEmail: 'recipient@domain.tld',
        senderAddress: 'sender@example.com',
      };

      const errors = validateEmailData(data);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('body'))).toBe(true);
    });

    it('should reject email with oversized attachment', () => {
      const data = {
        recipientEmail: 'recipient@domain.tld',
        senderAddress: 'sender@example.com',
        bodyText: 'Text',
        attachments: [
          {
            filename: 'large.pdf',
            contentType: 'application/pdf',
            size: 11 * 1024 * 1024, // 11MB
          },
        ],
      };

      const errors = validateEmailData(data);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('10MB'))).toBe(true);
    });
  });

  describe('sanitizeHtmlContent', () => {
    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("XSS")</script>';
      const sanitized = sanitizeHtmlContent(html);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('<p>Hello</p>');
    });

    it('should remove event handlers', () => {
      const html = '<button onclick="alert(\'XSS\')">Click</button>';
      const sanitized = sanitizeHtmlContent(html);

      expect(sanitized).not.toContain('onclick');
      expect(sanitized).toContain('<button');
    });

    it('should remove javascript: URLs', () => {
      const html = '<a href="javascript:alert(\'XSS\')">Link</a>';
      const sanitized = sanitizeHtmlContent(html);

      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('href="#"');
    });

    it('should preserve safe HTML', () => {
      const html = '<p>Hello <strong>world</strong></p><img src="image.jpg" alt="test">';
      const sanitized = sanitizeHtmlContent(html);

      expect(sanitized).toContain('<p>');
      expect(sanitized).toContain('<strong>');
      expect(sanitized).toContain('<img');
    });
  });
});
