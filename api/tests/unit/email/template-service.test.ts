/**
 * Email Template Service Tests
 * Tests variable extraction and {{var}} substitution for reusable templates.
 */

import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  extractVariables,
} from '../../../src/services/email/template-service.js';

describe('extractVariables', () => {
  it('extracts unique variable names from a template', () => {
    expect(extractVariables('Hi {{name}}, your code is {{code}}')).toEqual([
      'name',
      'code',
    ]);
  });

  it('deduplicates repeated variables', () => {
    expect(extractVariables('{{a}} and {{a}} and {{b}}')).toEqual(['a', 'b']);
  });

  it('tolerates whitespace inside braces', () => {
    expect(extractVariables('Hello {{ name }}')).toEqual(['name']);
  });

  it('returns empty array when no variables present', () => {
    expect(extractVariables('No variables here')).toEqual([]);
  });
});

describe('renderTemplate', () => {
  it('substitutes provided variables', () => {
    const result = renderTemplate('Hi {{name}}!', { name: 'Alice' });
    expect(result.output).toBe('Hi Alice!');
    expect(result.missing).toEqual([]);
  });

  it('handles whitespace inside braces', () => {
    const result = renderTemplate('Hi {{ name }}!', { name: 'Bob' });
    expect(result.output).toBe('Hi Bob!');
  });

  it('reports missing variables and leaves placeholders intact by default', () => {
    const result = renderTemplate('Hi {{name}}, code {{code}}', { name: 'Alice' });
    expect(result.missing).toEqual(['code']);
    expect(result.output).toBe('Hi Alice, code {{code}}');
  });

  it('replaces missing variables with empty string when strict=false option set', () => {
    const result = renderTemplate(
      'Hi {{name}}, code {{code}}',
      { name: 'Alice' },
      { keepMissingPlaceholders: false }
    );
    expect(result.output).toBe('Hi Alice, code ');
  });

  it('escapes HTML in values by default to prevent injection', () => {
    const result = renderTemplate('Hello {{name}}', {
      name: '<script>alert(1)</script>',
    });
    expect(result.output).toBe('Hello &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('does not escape when escapeHtml=false', () => {
    const result = renderTemplate(
      'Hello {{name}}',
      { name: '<b>Bold</b>' },
      { escapeHtml: false }
    );
    expect(result.output).toBe('Hello <b>Bold</b>');
  });

  it('coerces non-string values to strings', () => {
    const result = renderTemplate('Count: {{n}}', { n: 42 });
    expect(result.output).toBe('Count: 42');
  });
});
