/**
 * Email Threading Tests
 * Tests grouping of flat email lists into conversation threads.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSubject,
  groupIntoThreads,
  type ThreadableEmail,
} from '../../../src/services/email/threading.js';

function email(overrides: Partial<ThreadableEmail>): ThreadableEmail {
  return {
    id: 'id',
    subject: 'Subject',
    senderAddress: 'alice@example.com',
    receivedAt: new Date('2026-01-01T00:00:00Z'),
    headers: {},
    ...overrides,
  };
}

describe('normalizeSubject', () => {
  it('strips reply and forward prefixes', () => {
    expect(normalizeSubject('Re: Hello')).toBe('hello');
    expect(normalizeSubject('FW: Hello')).toBe('hello');
    expect(normalizeSubject('Fwd: Hello')).toBe('hello');
  });

  it('strips repeated/stacked prefixes', () => {
    expect(normalizeSubject('Re: Fwd: RE: Project update')).toBe('project update');
  });

  it('handles localized-ish bracketed counts like Re[2]:', () => {
    expect(normalizeSubject('Re[2]: Status')).toBe('status');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeSubject('  Re:   Hello   World ')).toBe('hello world');
  });

  it('returns empty string for empty/undefined subject', () => {
    expect(normalizeSubject('')).toBe('');
    expect(normalizeSubject(undefined)).toBe('');
  });
});

describe('groupIntoThreads', () => {
  it('groups a single email into a single thread', () => {
    const threads = groupIntoThreads([email({ id: 'a', subject: 'Hello' })]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.emails).toHaveLength(1);
    expect(threads[0]!.messageCount).toBe(1);
  });

  it('groups replies with the original by normalized subject', () => {
    const threads = groupIntoThreads([
      email({ id: 'a', subject: 'Project', receivedAt: new Date('2026-01-01T00:00:00Z') }),
      email({ id: 'b', subject: 'Re: Project', receivedAt: new Date('2026-01-02T00:00:00Z') }),
      email({ id: 'c', subject: 'Re: Re: Project', receivedAt: new Date('2026-01-03T00:00:00Z') }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.messageCount).toBe(3);
  });

  it('keeps distinct subjects in separate threads', () => {
    const threads = groupIntoThreads([
      email({ id: 'a', subject: 'Project' }),
      email({ id: 'b', subject: 'Invoice' }),
    ]);
    expect(threads).toHaveLength(2);
  });

  it('groups by References/In-Reply-To headers even when subjects differ', () => {
    const threads = groupIntoThreads([
      email({ id: 'a', subject: 'Original', headers: { messageId: '<m1@x>' } }),
      email({
        id: 'b',
        subject: 'Totally different subject',
        headers: { messageId: '<m2@x>', inReplyTo: '<m1@x>' },
      }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.messageCount).toBe(2);
  });

  it('links a chain across References transitively', () => {
    const threads = groupIntoThreads([
      email({ id: 'a', subject: 'A', headers: { messageId: '<m1@x>' } }),
      email({ id: 'b', subject: 'B', headers: { messageId: '<m2@x>', inReplyTo: '<m1@x>' } }),
      email({
        id: 'c',
        subject: 'C',
        headers: { messageId: '<m3@x>', references: '<m1@x> <m2@x>' },
      }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.messageCount).toBe(3);
  });

  it('orders threads by most recent message first', () => {
    const threads = groupIntoThreads([
      email({ id: 'a', subject: 'Old', receivedAt: new Date('2026-01-01T00:00:00Z') }),
      email({ id: 'b', subject: 'New', receivedAt: new Date('2026-02-01T00:00:00Z') }),
    ]);
    expect(threads[0]!.subject).toBe('New');
    expect(threads[1]!.subject).toBe('Old');
  });

  it('orders emails within a thread chronologically and exposes metadata', () => {
    const threads = groupIntoThreads([
      email({ id: 'b', subject: 'Re: Hi', senderAddress: 'bob@x', receivedAt: new Date('2026-01-02T00:00:00Z') }),
      email({ id: 'a', subject: 'Hi', senderAddress: 'alice@x', receivedAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    const thread = threads[0]!;
    expect(thread.emails.map((e) => e.id)).toEqual(['a', 'b']);
    expect(thread.lastMessageAt).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(thread.participants.sort()).toEqual(['alice@x', 'bob@x']);
    expect(thread.subject).toBe('Hi');
  });

  it('returns an empty array for no emails', () => {
    expect(groupIntoThreads([])).toEqual([]);
  });
});
