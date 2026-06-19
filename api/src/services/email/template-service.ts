/**
 * Email Template Service
 *
 * Reusable email templates with `{{variable}}` substitution. Values are
 * HTML-escaped by default to avoid accidental markup/script injection when a
 * template is rendered into an HTML body.
 *
 * The rendering helpers (`renderTemplate`, `extractVariables`) are pure and
 * unit-testable. The service class manages an in-memory registry of templates
 * and can be backed by persistence at the route layer.
 */

export interface EmailTemplate {
  id: string;
  /** Owner user id (templates are scoped per user). */
  userId: number;
  name: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RenderResult {
  output: string;
  /** Variable names referenced by the template but absent from the values. */
  missing: string[];
}

export interface RenderOptions {
  /** Escape HTML entities in substituted values (default true). */
  escapeHtml?: boolean;
  /**
   * When a variable has no value, keep the `{{placeholder}}` (default true).
   * If false, missing variables render as empty strings.
   */
  keepMissingPlaceholders?: boolean;
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Extract the unique variable names referenced by a template string,
 * in first-seen order.
 */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    seen.add(match[1]!);
  }
  return [...seen];
}

function escapeHtmlEntities(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a template by substituting `{{variable}}` tokens with values.
 */
export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
  options: RenderOptions = {}
): RenderResult {
  const escape = options.escapeHtml !== false;
  const keepMissing = options.keepMissingPlaceholders !== false;
  const missing = new Set<string>();

  const output = template.replace(VARIABLE_PATTERN, (full, name: string) => {
    if (!(name in values) || values[name] === undefined || values[name] === null) {
      missing.add(name);
      return keepMissing ? full : '';
    }
    const raw = String(values[name]);
    return escape ? escapeHtmlEntities(raw) : raw;
  });

  return { output, missing: [...missing] };
}

export interface CreateTemplateInput {
  userId: number;
  name: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}

export interface RenderedTemplate {
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  missing: string[];
}

/**
 * In-memory template registry. Provides CRUD + render helpers. The store is
 * keyed by template id; callers scope access by `userId`.
 */
export class EmailTemplateService {
  private templates = new Map<string, EmailTemplate>();
  private seq = 0;

  create(input: CreateTemplateInput, now: Date = new Date()): EmailTemplate {
    if (!input.name || !input.name.trim()) {
      throw new Error('Template name is required');
    }
    if (!input.subject || !input.subject.trim()) {
      throw new Error('Template subject is required');
    }
    if (!input.bodyText && !input.bodyHtml) {
      throw new Error('Template must have a text or HTML body');
    }

    this.seq += 1;
    const template: EmailTemplate = {
      id: `tmpl_${this.seq}`,
      userId: input.userId,
      name: input.name.trim(),
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(template.id, template);
    return template;
  }

  get(id: string, userId: number): EmailTemplate | null {
    const template = this.templates.get(id);
    if (!template || template.userId !== userId) return null;
    return template;
  }

  list(userId: number): EmailTemplate[] {
    return [...this.templates.values()].filter((t) => t.userId === userId);
  }

  delete(id: string, userId: number): boolean {
    const template = this.templates.get(id);
    if (!template || template.userId !== userId) return false;
    return this.templates.delete(id);
  }

  /** Render a stored template with the given variable values. */
  render(
    id: string,
    userId: number,
    values: Record<string, unknown>
  ): RenderedTemplate | null {
    const template = this.get(id, userId);
    if (!template) return null;

    const subject = renderTemplate(template.subject, values, { escapeHtml: false });
    const text = template.bodyText
      ? renderTemplate(template.bodyText, values, { escapeHtml: false })
      : null;
    const html = template.bodyHtml
      ? renderTemplate(template.bodyHtml, values, { escapeHtml: true })
      : null;

    const missing = new Set<string>([
      ...subject.missing,
      ...(text?.missing ?? []),
      ...(html?.missing ?? []),
    ]);

    return {
      subject: subject.output,
      bodyText: text?.output,
      bodyHtml: html?.output,
      missing: [...missing],
    };
  }
}

export const emailTemplateService = new EmailTemplateService();
