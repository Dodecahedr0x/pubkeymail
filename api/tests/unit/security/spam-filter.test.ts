/**
 * Spam Filter Service Tests
 * Tests heuristic spam scoring plus allowlist/blocklist matching.
 */

import { describe, it, expect } from 'vitest';
import {
  SpamFilterService,
  type SpamFilterInput,
} from '../../../src/services/security/spam-filter-service.js';

function makeInput(overrides: Partial<SpamFilterInput> = {}): SpamFilterInput {
  return {
    from: 'alice@example.com',
    subject: 'Hello there',
    bodyText: 'Just checking in about the project.',
    ...overrides,
  };
}

describe('SpamFilterService', () => {
  describe('allowlist / blocklist', () => {
    it('always allows a sender on the allowlist regardless of content', () => {
      const filter = new SpamFilterService({ allowlist: ['alice@example.com'] });
      const result = filter.evaluate(
        makeInput({
          subject: 'FREE VIAGRA!!! WIN MONEY NOW',
          bodyText: 'Click here to claim your prize $$$ http://scam.example',
        })
      );

      expect(result.allowed).toBe(true);
      expect(result.isSpam).toBe(false);
      expect(result.reason).toBe('allowlisted');
      expect(result.score).toBe(0);
    });

    it('always blocks a sender on the blocklist', () => {
      const filter = new SpamFilterService({ blocklist: ['spammer@bad.com'] });
      const result = filter.evaluate(makeInput({ from: 'spammer@bad.com' }));

      expect(result.allowed).toBe(false);
      expect(result.isSpam).toBe(true);
      expect(result.reason).toBe('blocklisted');
      expect(result.score).toBe(100);
    });

    it('matches allowlist by domain wildcard', () => {
      const filter = new SpamFilterService({ allowlist: ['*@example.com'] });
      const result = filter.evaluate(makeInput({ from: 'anyone@example.com' }));
      expect(result.reason).toBe('allowlisted');
    });

    it('matches blocklist by domain wildcard', () => {
      const filter = new SpamFilterService({ blocklist: ['*@bad.com'] });
      const result = filter.evaluate(makeInput({ from: 'whoever@bad.com' }));
      expect(result.reason).toBe('blocklisted');
    });

    it('treats sender matching case-insensitively for list matching', () => {
      const filter = new SpamFilterService({ blocklist: ['Spammer@Bad.com'] });
      const result = filter.evaluate(makeInput({ from: 'spammer@bad.com' }));
      expect(result.allowed).toBe(false);
    });

    it('prioritizes allowlist over blocklist', () => {
      const filter = new SpamFilterService({
        allowlist: ['alice@example.com'],
        blocklist: ['*@example.com'],
      });
      const result = filter.evaluate(makeInput({ from: 'alice@example.com' }));
      expect(result.reason).toBe('allowlisted');
      expect(result.allowed).toBe(true);
    });
  });

  describe('heuristic scoring', () => {
    it('scores a clean email as not spam', () => {
      const filter = new SpamFilterService();
      const result = filter.evaluate(makeInput());
      expect(result.isSpam).toBe(false);
      expect(result.allowed).toBe(true);
      expect(result.score).toBeLessThan(50);
    });

    it('flags excessive capitalization in subject', () => {
      const filter = new SpamFilterService();
      const result = filter.evaluate(
        makeInput({ subject: 'BUY NOW CHEAP DEALS LIMITED TIME OFFER' })
      );
      expect(result.signals).toContain('excessive_caps');
      expect(result.score).toBeGreaterThan(0);
    });

    it('flags known spam trigger phrases', () => {
      const filter = new SpamFilterService();
      const result = filter.evaluate(
        makeInput({ bodyText: 'Congratulations! You won the lottery. Claim your prize now.' })
      );
      expect(result.signals).toContain('spam_phrases');
    });

    it('flags too many links', () => {
      const links = Array.from({ length: 12 }, (_, i) => `http://site${i}.example`).join(' ');
      const filter = new SpamFilterService();
      const result = filter.evaluate(makeInput({ bodyText: `Check these out ${links}` }));
      expect(result.signals).toContain('excessive_links');
    });

    it('flags empty subject', () => {
      const filter = new SpamFilterService();
      const result = filter.evaluate(makeInput({ subject: '' }));
      expect(result.signals).toContain('empty_subject');
    });

    it('classifies a heavily spammy email as spam', () => {
      const filter = new SpamFilterService();
      const result = filter.evaluate(
        makeInput({
          subject: 'WINNER!!! CLAIM YOUR FREE PRIZE MONEY NOW!!!',
          bodyText:
            'CONGRATULATIONS you WON the LOTTERY! Click here http://a.example http://b.example ' +
            'http://c.example to claim your FREE $$$ CASH PRIZE risk free guarantee!!!',
        })
      );
      expect(result.isSpam).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('respects a custom threshold', () => {
      const strict = new SpamFilterService({ threshold: 10 });
      const result = strict.evaluate(
        makeInput({ subject: 'LIMITED TIME OFFER' })
      );
      expect(result.isSpam).toBe(true);
    });
  });

  describe('list management helpers', () => {
    it('normalizes and deduplicates list entries', () => {
      const filter = new SpamFilterService({ blocklist: ['A@B.com', 'a@b.com', '  a@b.com '] });
      expect(filter.getBlocklist()).toEqual(['a@b.com']);
    });

    it('can add and remove entries at runtime', () => {
      const filter = new SpamFilterService();
      filter.addToBlocklist('spammer@bad.com');
      expect(filter.evaluate(makeInput({ from: 'spammer@bad.com' })).allowed).toBe(false);
      filter.removeFromBlocklist('spammer@bad.com');
      expect(filter.evaluate(makeInput({ from: 'spammer@bad.com' })).allowed).toBe(true);
    });
  });
});
