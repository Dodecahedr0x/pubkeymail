/**
 * Spam Filter Service
 *
 * Lightweight, dependency-free spam classification for inbound email.
 * Combines two mechanisms:
 *   1. Allowlist / blocklist matching (exact address or `*@domain` wildcard)
 *   2. Heuristic content scoring (caps, trigger phrases, link density, etc.)
 *
 * The service is pure logic and side-effect free so it can be unit tested
 * without a database. Per-user allowlists/blocklists can be persisted by the
 * caller and supplied through the constructor or the runtime helpers.
 *
 * NOTE: Sender matching for allow/block lists is case-insensitive (email
 * addresses are routed case-insensitively at the SMTP layer), while the
 * blockchain address case-sensitivity rules apply elsewhere in the system.
 */

export interface SpamFilterInput {
  /** Sender email address (e.g. "alice@example.com") */
  from: string;
  /** Email subject line */
  subject?: string;
  /** Plain-text body */
  bodyText?: string;
  /** HTML body (used only for link counting if bodyText absent) */
  bodyHtml?: string;
}

export type SpamReason = 'allowlisted' | 'blocklisted' | 'heuristic' | 'clean';

export interface SpamFilterResult {
  /** Whether the email should be delivered */
  allowed: boolean;
  /** Whether the email is classified as spam */
  isSpam: boolean;
  /** Numeric spam score (0 = clean, 100 = certain spam) */
  score: number;
  /** Primary reason for the decision */
  reason: SpamReason;
  /** Heuristic signals that fired */
  signals: string[];
}

export interface SpamFilterOptions {
  allowlist?: string[];
  blocklist?: string[];
  /** Score at or above which an email is considered spam (default 50) */
  threshold?: number;
}

interface Signal {
  name: string;
  score: number;
}

const DEFAULT_THRESHOLD = 50;

/** Common spam trigger phrases (lowercased, matched as substrings). */
const SPAM_PHRASES = [
  'you won',
  'you have won',
  'won the lottery',
  'claim your prize',
  'free prize',
  'risk free',
  'risk-free',
  'congratulations',
  'cash prize',
  'click here',
  'act now',
  'limited time offer',
  'viagra',
  'cheap meds',
  'work from home',
  'make money fast',
  'wire transfer',
  'nigerian prince',
  'bitcoin doubler',
];

export class SpamFilterService {
  private allowlist: Set<string>;
  private blocklist: Set<string>;
  private threshold: number;

  constructor(options: SpamFilterOptions = {}) {
    this.allowlist = new Set((options.allowlist ?? []).map(normalizeEntry).filter(Boolean));
    this.blocklist = new Set((options.blocklist ?? []).map(normalizeEntry).filter(Boolean));
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
  }

  /**
   * Evaluate an email and decide whether it should be delivered.
   */
  evaluate(input: SpamFilterInput): SpamFilterResult {
    const sender = normalizeEntry(input.from);

    // Allowlist always wins.
    if (this.matchesList(sender, this.allowlist)) {
      return {
        allowed: true,
        isSpam: false,
        score: 0,
        reason: 'allowlisted',
        signals: [],
      };
    }

    // Blocklist short-circuits to spam.
    if (this.matchesList(sender, this.blocklist)) {
      return {
        allowed: false,
        isSpam: true,
        score: 100,
        reason: 'blocklisted',
        signals: ['blocklisted'],
      };
    }

    // Heuristic scoring.
    const signals = this.scoreContent(input);
    const score = Math.min(
      100,
      signals.reduce((sum, s) => sum + s.score, 0)
    );
    const isSpam = score >= this.threshold;

    return {
      allowed: !isSpam,
      isSpam,
      score,
      reason: isSpam ? 'heuristic' : 'clean',
      signals: signals.map((s) => s.name),
    };
  }

  private scoreContent(input: SpamFilterInput): Signal[] {
    const signals: Signal[] = [];
    const subject = (input.subject ?? '').trim();
    const body = input.bodyText ?? stripHtml(input.bodyHtml ?? '');
    const haystack = `${subject}\n${body}`.toLowerCase();

    // Empty subject is a weak spam signal.
    if (subject.length === 0) {
      signals.push({ name: 'empty_subject', score: 15 });
    }

    // Excessive capitalization in subject (ignoring short subjects).
    if (subject.length >= 8 && capsRatio(subject) > 0.6) {
      signals.push({ name: 'excessive_caps', score: 25 });
    }

    // Excessive exclamation marks.
    const exclamations = (haystack.match(/!/g) ?? []).length;
    if (exclamations >= 4) {
      signals.push({ name: 'excessive_exclamations', score: 15 });
    }

    // Known spam trigger phrases.
    const matchedPhrases = SPAM_PHRASES.filter((phrase) => haystack.includes(phrase));
    if (matchedPhrases.length > 0) {
      signals.push({
        name: 'spam_phrases',
        score: Math.min(40, 15 + (matchedPhrases.length - 1) * 10),
      });
    }

    // Excessive links.
    const linkCount = countLinks(`${input.bodyText ?? ''} ${input.bodyHtml ?? ''}`);
    if (linkCount >= 10) {
      signals.push({ name: 'excessive_links', score: 25 });
    } else if (linkCount >= 5) {
      signals.push({ name: 'many_links', score: 10 });
    }

    // Money / currency spam markers.
    if (/\${2,}|\$\d{3,}|\d+\s?(usd|btc|eth)\b/i.test(haystack)) {
      signals.push({ name: 'money_markers', score: 15 });
    }

    return signals;
  }

  private matchesList(sender: string, list: Set<string>): boolean {
    if (list.has(sender)) {
      return true;
    }
    const domain = sender.split('@')[1];
    if (domain && list.has(`*@${domain}`)) {
      return true;
    }
    return false;
  }

  // --- List management helpers -------------------------------------------

  addToAllowlist(entry: string): void {
    const normalized = normalizeEntry(entry);
    if (normalized) this.allowlist.add(normalized);
  }

  removeFromAllowlist(entry: string): void {
    this.allowlist.delete(normalizeEntry(entry));
  }

  addToBlocklist(entry: string): void {
    const normalized = normalizeEntry(entry);
    if (normalized) this.blocklist.add(normalized);
  }

  removeFromBlocklist(entry: string): void {
    this.blocklist.delete(normalizeEntry(entry));
  }

  getAllowlist(): string[] {
    return [...this.allowlist];
  }

  getBlocklist(): string[] {
    return [...this.blocklist];
  }
}

// --- Helpers --------------------------------------------------------------

function normalizeEntry(entry: string): string {
  return (entry ?? '').trim().toLowerCase();
}

function capsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  return uppercase / letters.length;
}

function countLinks(text: string): number {
  return (text.match(/https?:\/\/[^\s"'<>]+/gi) ?? []).length;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/** Default singleton with empty lists; per-user lists are supplied per call. */
export const spamFilterService = new SpamFilterService();
