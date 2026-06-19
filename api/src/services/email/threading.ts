/**
 * Email Threading
 *
 * Groups a flat list of emails into conversation threads using two signals,
 * in priority order:
 *   1. RFC 5322 message identity headers (Message-ID / In-Reply-To / References)
 *   2. Normalized subject (after stripping Re:/Fwd: prefixes)
 *
 * Pure logic, side-effect free — the caller supplies the emails (e.g. a page
 * of a mailbox) and receives ordered threads back.
 */

import { EmailHeaders } from '../../types/email.js';

export interface ThreadableEmail {
  id: string;
  subject: string | null;
  senderAddress: string;
  receivedAt: Date;
  headers: EmailHeaders;
}

export interface EmailThread {
  /** Stable id for the thread (id of the earliest message). */
  id: string;
  /** Subject of the earliest message in the thread. */
  subject: string | null;
  /** Emails ordered oldest → newest. */
  emails: ThreadableEmail[];
  messageCount: number;
  lastMessageAt: Date;
  /** Distinct sender addresses participating in the thread. */
  participants: string[];
}

/**
 * Normalize a subject for thread matching: strip reply/forward prefixes
 * (including stacked and `Re[2]:` style ones), lowercase, collapse whitespace.
 */
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return '';
  let s = subject.trim();
  // Repeatedly strip leading Re:/Fwd:/Fw: prefixes, optionally with [n].
  const prefix = /^\s*(re|fwd?|aw|sv|wg)(\[\d+\])?\s*:\s*/i;
  let previous: string;
  do {
    previous = s;
    s = s.replace(prefix, '');
  } while (s !== previous);
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Extract message-id tokens (e.g. "<a@x> <b@x>") into a normalized array. */
function parseMessageIds(value: string | undefined): string[] {
  if (!value) return [];
  return (value.match(/<[^>]+>/g) ?? []).map((id) => id.trim().toLowerCase());
}

/**
 * Simple union-find for clustering emails into threads.
 */
class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression.
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(ra, rb);
    }
  }
}

/**
 * Group emails into conversation threads.
 *
 * Threads are returned ordered by most-recent activity first. Emails within
 * a thread are ordered oldest → newest.
 */
export function groupIntoThreads(emails: ThreadableEmail[]): EmailThread[] {
  if (emails.length === 0) return [];

  const uf = new UnionFind();
  // Map a message-id token -> owning email id, so replies can link to parents.
  const messageIdOwner = new Map<string, string>();
  // Map a normalized subject -> representative email id.
  const subjectOwner = new Map<string, string>();

  // First pass: register each email's own message id and ensure node exists.
  for (const e of emails) {
    uf.find(e.id);
    for (const mid of parseMessageIds(e.headers.messageId)) {
      if (!messageIdOwner.has(mid)) {
        messageIdOwner.set(mid, e.id);
      }
    }
  }

  // Second pass: union by reference headers, then by subject.
  for (const e of emails) {
    const referenced = [
      ...parseMessageIds(e.headers.inReplyTo),
      ...parseMessageIds(e.headers.references),
    ];
    let linkedByHeader = false;
    for (const ref of referenced) {
      const owner = messageIdOwner.get(ref);
      if (owner) {
        uf.union(e.id, owner);
        linkedByHeader = true;
      }
    }

    if (!linkedByHeader) {
      const subjectKey = normalizeSubject(e.subject);
      if (subjectKey) {
        const owner = subjectOwner.get(subjectKey);
        if (owner) {
          uf.union(e.id, owner);
        } else {
          subjectOwner.set(subjectKey, e.id);
        }
      }
    }
  }

  // Cluster emails by their root.
  const clusters = new Map<string, ThreadableEmail[]>();
  for (const e of emails) {
    const root = uf.find(e.id);
    const list = clusters.get(root) ?? [];
    list.push(e);
    clusters.set(root, list);
  }

  const threads: EmailThread[] = [];
  for (const list of clusters.values()) {
    const sorted = [...list].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
    );
    const earliest = sorted[0]!;
    const latest = sorted[sorted.length - 1]!;
    const participants = [...new Set(sorted.map((e) => e.senderAddress))];

    threads.push({
      id: earliest.id,
      subject: earliest.subject,
      emails: sorted,
      messageCount: sorted.length,
      lastMessageAt: latest.receivedAt,
      participants,
    });
  }

  // Most recently active threads first.
  threads.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  return threads;
}
