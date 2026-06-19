/**
 * Email Search
 *
 * A small query language for searching a user's mailbox:
 *   - free text terms       → must all appear in subject or body
 *   - "quoted phrases"      → matched as contiguous substrings
 *   - from:<addr>           → sender substring match
 *   - subject:<text>        → subject substring match
 *   - has:attachment        → only emails with attachments
 *
 * The parser and matcher are pure and unit-testable. `searchEmails` is a
 * convenience over an in-memory list; the route layer can also translate a
 * ParsedQuery into a SQL WHERE clause for large mailboxes.
 */

export interface SearchableEmail {
  id: string;
  subject: string | null;
  senderAddress: string;
  bodyText: string | null;
  bodyHtml: string | null;
  hasAttachments: boolean;
  receivedAt: Date;
}

export interface ParsedQuery {
  /** Free-text terms / quoted phrases that must all be present. */
  terms: string[];
  from?: string;
  subject?: string;
  hasAttachment?: boolean;
}

/**
 * Tokenize a raw query string, respecting "quoted phrases".
 */
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(query)) !== null) {
    if (match[1] !== undefined) {
      // Quoted phrase (may be empty) — keep as a single phrase token.
      const phrase = match[1].trim();
      if (phrase) tokens.push(phrase);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    }
  }
  return tokens;
}

/**
 * Parse a raw search string into structured filters.
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = { terms: [] };
  if (!query || !query.trim()) return parsed;

  for (const token of tokenize(query)) {
    const opMatch = /^([a-zA-Z]+):(.*)$/.exec(token);
    if (opMatch && !token.includes(' ')) {
      const key = opMatch[1]!.toLowerCase();
      const value = opMatch[2]!.toLowerCase();
      switch (key) {
        case 'from':
          parsed.from = value;
          continue;
        case 'subject':
          parsed.subject = value;
          continue;
        case 'has':
          if (value === 'attachment' || value === 'attachments') {
            parsed.hasAttachment = true;
          }
          continue;
        default:
          break;
      }
    }
    parsed.terms.push(token.toLowerCase());
  }

  return parsed;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/**
 * Test whether an email matches a parsed query.
 */
export function matchesQuery(email: SearchableEmail, query: ParsedQuery): boolean {
  if (query.from && !email.senderAddress.toLowerCase().includes(query.from)) {
    return false;
  }

  if (query.subject) {
    const subject = (email.subject ?? '').toLowerCase();
    if (!subject.includes(query.subject)) return false;
  }

  if (query.hasAttachment && !email.hasAttachments) {
    return false;
  }

  if (query.terms.length > 0) {
    const body = email.bodyText ?? stripHtml(email.bodyHtml ?? '');
    const haystack = `${email.subject ?? ''}\n${body}`.toLowerCase();
    for (const term of query.terms) {
      if (!haystack.includes(term)) return false;
    }
  }

  return true;
}

/**
 * Search an in-memory list of emails, returning matches newest-first.
 */
export function searchEmails(
  emails: SearchableEmail[],
  query: string
): SearchableEmail[] {
  const parsed = parseSearchQuery(query);
  return emails
    .filter((e) => matchesQuery(e, parsed))
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}
