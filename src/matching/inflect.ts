import { Inflectors } from 'en-inflectors';

/**
 * Generate inflected forms of an English word.
 * Uses forward expansion (canonical → forms), not backward stemming.
 * Multi-word phrases return only the canonical form.
 */
export function generateForms(word: string): string[] {
  // Multi-word phrases: don't inflect (too ambiguous)
  if (word.includes(' ')) return [word];

  const forms = new Set<string>([word]);

  try {
    const inf = new Inflectors(word);
    // Verb conjugations
    for (const tag of ['VBZ', 'VBD', 'VBG', 'VBN'] as const) {
      const form = inf.conjugate(tag);
      if (form && form !== word) forms.add(form.toLowerCase());
    }
    // Noun plural
    const plural = inf.toPlural();
    if (plural && plural !== word) forms.add(plural.toLowerCase());
  } catch {
    // If inflection fails, return just the canonical form
  }

  return [...forms];
}
