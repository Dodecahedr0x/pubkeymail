/**
 * Forwarding Filter Tests
 * Tests the matchesFilter engine, including advanced conditions.
 */

import { describe, it, expect } from 'vitest';
import {
  forwardingService,
  type EmailForFiltering,
  type FilterConditions,
} from '../../../src/services/email/forwarding-service.js';

function email(overrides: Partial<EmailForFiltering> = {}): EmailForFiltering {
  return {
    from: 'alice@example.com',
    subject: 'Project update',
    ...overrides,
  };
}

function check(e: EmailForFiltering, conditions: FilterConditions | null): boolean {
  return forwardingService.matchesFilter(e, conditions);
}

describe('matchesFilter — basic conditions', () => {
  it('matches everything when conditions are null', () => {
    expect(check(email(), null)).toBe(true);
  });

  it('includes by fromContains', () => {
    expect(check(email(), { fromContains: ['alice'] })).toBe(true);
    expect(check(email(), { fromContains: ['bob'] })).toBe(false);
  });

  it('includes by subjectContains', () => {
    expect(check(email(), { subjectContains: ['project'] })).toBe(true);
    expect(check(email(), { subjectContains: ['invoice'] })).toBe(false);
  });

  it('excludes by excludeFrom', () => {
    expect(check(email(), { excludeFrom: ['alice'] })).toBe(false);
  });

  it('excludes by excludeSubject', () => {
    expect(check(email({ subject: 'SPAM offer' }), { excludeSubject: ['spam'] })).toBe(false);
  });
});

describe('matchesFilter — advanced conditions', () => {
  it('includes by bodyContains (text body)', () => {
    const e = email({ bodyText: 'please review the attached invoice' });
    expect(check(e, { bodyContains: ['invoice'] })).toBe(true);
    expect(check(e, { bodyContains: ['receipt'] })).toBe(false);
  });

  it('searches HTML body when text body is absent', () => {
    const e = email({ bodyHtml: '<p>quarterly <b>report</b></p>' });
    expect(check(e, { bodyContains: ['report'] })).toBe(true);
  });

  it('excludes by excludeBody', () => {
    const e = email({ bodyText: 'unsubscribe here to stop emails' });
    expect(check(e, { excludeBody: ['unsubscribe'] })).toBe(false);
  });

  it('filters by hasAttachment = true', () => {
    expect(check(email({ hasAttachments: true }), { hasAttachment: true })).toBe(true);
    expect(check(email({ hasAttachments: false }), { hasAttachment: true })).toBe(false);
  });

  it('filters by hasAttachment = false', () => {
    expect(check(email({ hasAttachments: false }), { hasAttachment: false })).toBe(true);
    expect(check(email({ hasAttachments: true }), { hasAttachment: false })).toBe(false);
  });

  it('defaults to OR semantics across inclusion filters', () => {
    const e = email({ from: 'alice@example.com', subject: 'unrelated' });
    expect(check(e, { fromContains: ['alice'], subjectContains: ['invoice'] })).toBe(true);
  });

  it('requires all inclusion filters when matchAll = true', () => {
    const e = email({ from: 'alice@example.com', subject: 'unrelated' });
    expect(
      check(e, { fromContains: ['alice'], subjectContains: ['invoice'], matchAll: true })
    ).toBe(false);
    expect(
      check(e, { fromContains: ['alice'], subjectContains: ['unrelated'], matchAll: true })
    ).toBe(true);
  });

  it('still applies exclusions before inclusions with matchAll', () => {
    const e = email({ from: 'alice@example.com', subject: 'invoice', bodyText: 'unsubscribe' });
    expect(
      check(e, {
        fromContains: ['alice'],
        subjectContains: ['invoice'],
        excludeBody: ['unsubscribe'],
        matchAll: true,
      })
    ).toBe(false);
  });
});
