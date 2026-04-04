import { describe, it, expect } from 'vitest';
import { generateForms } from '../../src/matching/inflect.js';

describe('inflect', () => {
  it('generates verb forms for "posit"', () => {
    const forms = generateForms('posit');
    expect(forms).toContain('posit');
    expect(forms).toContain('posits');
    expect(forms).toContain('posited');
    expect(forms).toContain('positing');
  });

  it('generates forms for "misrepresent"', () => {
    const forms = generateForms('misrepresent');
    expect(forms).toContain('misrepresent');
    expect(forms).toContain('misrepresents');
    expect(forms).toContain('misrepresented');
    expect(forms).toContain('misrepresenting');
  });

  it('generates regular forms for longer words', () => {
    const forms = generateForms('hypothesis');
    expect(forms).toContain('hypothesis');
    // Rule-based: no irregular noun handling, but regular -s/-ed/-ing forms generated
    expect(forms.length).toBeGreaterThan(1);
  });

  it('handles hyphenated words', () => {
    const forms = generateForms('co-opt');
    expect(forms).toContain('co-opt');
    expect(forms).toContain('co-opts');
    expect(forms).toContain('co-opted');
    expect(forms).toContain('co-opting');
  });

  it('returns only canonical for multi-word phrases', () => {
    const forms = generateForms('take for granted');
    expect(forms).toEqual(['take for granted']);
  });

  it('canonical form is always first', () => {
    const forms = generateForms('posit');
    expect(forms[0]).toBe('posit');
  });

  it('no duplicates in output', () => {
    const forms = generateForms('posit');
    expect(new Set(forms).size).toBe(forms.length);
  });
});
