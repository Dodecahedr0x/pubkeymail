/**
 * Email Search Tests
 * Tests the search query parser and the in-memory matcher.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  matchesQuery,
  searchEmails,
  type SearchableEmail,
} from '../../../src/services/email/search.js';

function email(overrides: Partial<SearchableEmail>): SearchableEmail {
  return {
    id: 'id',
    subject: 'Hello world',
    senderAddress: 'alice@example.com',
    bodyText: 'This is the body',
    bodyHtml: null,
    hasAttachments: false,
    receivedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('parseSearchQuery', () => {
  it('parses free-text terms', () => {
    const q = parseSearchQuery('hello world');
    expect(q.terms).toEqual(['hello', 'world']);
    expect(q.from).toBeUndefined();
  });

  it('parses from: filter', () => {
    const q = parseSearchQuery('from:alice@example.com project');
    expect(q.from).toBe('alice@example.com');
    expect(q.terms).toEqual(['project']);
  });

  it('parses subject: filter', () => {
    const q = parseSearchQuery('subject:invoice');
    expect(q.subject).toBe('invoice');
  });

  it('parses has:attachment filter', () => {
    const q = parseSearchQuery('has:attachment report');
    expect(q.hasAttachment).toBe(true);
    expect(q.terms).toEqual(['report']);
  });

  it('supports quoted phrases as a single term', () => {
    const q = parseSearchQuery('"quarterly report" urgent');
    expect(q.terms).toEqual(['quarterly report', 'urgent']);
  });

  it('lowercases operators and is case-insensitive on keys', () => {
    const q = parseSearchQuery('From:Bob@X.com Subject:Hi');
    expect(q.from).toBe('bob@x.com');
    expect(q.subject).toBe('hi');
  });

  it('returns empty structure for blank query', () => {
    const q = parseSearchQuery('   ');
    expect(q.terms).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it('matches when all free-text terms appear in subject or body', () => {
    const e = email({ subject: 'Project update', bodyText: 'the latest status' });
    expect(matchesQuery(e, parseSearchQuery('project status'))).toBe(true);
  });

  it('does not match when a term is absent', () => {
    const e = email({ subject: 'Project update', bodyText: 'the latest status' });
    expect(matchesQuery(e, parseSearchQuery('project missing'))).toBe(false);
  });

  it('matches from: against sender substring', () => {
    const e = email({ senderAddress: 'alice@example.com' });
    expect(matchesQuery(e, parseSearchQuery('from:alice'))).toBe(true);
    expect(matchesQuery(e, parseSearchQuery('from:bob'))).toBe(false);
  });

  it('matches subject: against subject substring only', () => {
    const e = email({ subject: 'Invoice #5', bodyText: 'invoice details' });
    expect(matchesQuery(e, parseSearchQuery('subject:invoice'))).toBe(true);
    expect(matchesQuery(e, parseSearchQuery('subject:nope'))).toBe(false);
  });

  it('matches has:attachment only when email has attachments', () => {
    expect(matchesQuery(email({ hasAttachments: true }), parseSearchQuery('has:attachment'))).toBe(true);
    expect(matchesQuery(email({ hasAttachments: false }), parseSearchQuery('has:attachment'))).toBe(false);
  });

  it('searches inside HTML body when text body is null', () => {
    const e = email({ bodyText: null, bodyHtml: '<p>special keyword</p>' });
    expect(matchesQuery(e, parseSearchQuery('keyword'))).toBe(true);
  });

  it('matches a quoted phrase as a contiguous substring', () => {
    const e = email({ bodyText: 'the quarterly report is ready' });
    expect(matchesQuery(e, parseSearchQuery('"quarterly report"'))).toBe(true);
    expect(matchesQuery(e, parseSearchQuery('"report quarterly"'))).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matchesQuery(email({}), parseSearchQuery(''))).toBe(true);
  });
});

describe('searchEmails', () => {
  it('returns only matching emails, newest first', () => {
    const emails = [
      email({ id: 'a', subject: 'Project alpha', receivedAt: new Date('2026-01-01T00:00:00Z') }),
      email({ id: 'b', subject: 'Project beta', receivedAt: new Date('2026-02-01T00:00:00Z') }),
      email({ id: 'c', subject: 'Unrelated', receivedAt: new Date('2026-03-01T00:00:00Z') }),
    ];
    const results = searchEmails(emails, 'project');
    expect(results.map((e) => e.id)).toEqual(['b', 'a']);
  });
});
