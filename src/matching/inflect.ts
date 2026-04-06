/**
 * Generate inflected forms of an English word.
 * Rule-based forward expansion (canonical → forms), not backward stemming.
 * Multi-word phrases return only the canonical form.
 *
 * Covers: verb -s/-ed/-ing, noun -s/-es, common suffix rules.
 * No external dependencies — avoids CJS interop issues with Node 24.
 */
export function generateForms(word: string): string[] {
  if (word.includes(' ')) return [word];

  const forms = new Set<string>([word]);

  // Verb/noun: 3rd person singular / plural (-s, -es)
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('sh') || word.endsWith('ch')) {
    forms.add(word + 'es');
  } else if (word.endsWith('y') && !isVowel(word[word.length - 2])) {
    forms.add(word.slice(0, -1) + 'ies');
  } else {
    forms.add(word + 's');
  }

  // Past tense / past participle (-ed)
  if (word.endsWith('e')) {
    forms.add(word + 'd');
  } else if (word.endsWith('y') && !isVowel(word[word.length - 2])) {
    forms.add(word.slice(0, -1) + 'ied');
  } else if (shouldDouble(word)) {
    forms.add(word + word[word.length - 1] + 'ed');
  } else {
    forms.add(word + 'ed');
  }

  // Present participle (-ing)
  if (word.endsWith('ie')) {
    forms.add(word.slice(0, -2) + 'ying');
  } else if (word.endsWith('e') && !word.endsWith('ee') && !word.endsWith('ye')) {
    forms.add(word.slice(0, -1) + 'ing');
  } else if (shouldDouble(word)) {
    forms.add(word + word[word.length - 1] + 'ing');
  } else {
    forms.add(word + 'ing');
  }

  // Handle hyphenated words: also inflect last segment
  if (word.includes('-')) {
    const parts = word.split('-');
    const lastPart = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join('-') + '-';
    const lastForms = generateForms(lastPart);
    for (const f of lastForms) {
      if (f !== lastPart) forms.add(prefix + f);
    }
  }

  return [...forms];
}

function isVowel(ch: string | undefined): boolean {
  return ch !== undefined && 'aeiou'.includes(ch);
}

/**
 * Should the final consonant be doubled before -ed/-ing?
 * Conservative: only double for known short CVC monosyllables (e.g. "stop", "plan", "rob").
 * For vocabulary words (typically multi-syllable), doubling is rare and risky — skip it.
 */
function shouldDouble(word: string): boolean {
  if (word.length < 3 || word.length > 4) return false;
  const last = word[word.length - 1];
  const secondLast = word[word.length - 2];
  const thirdLast = word[word.length - 3];
  if (!last || !secondLast || !thirdLast) return false;
  return !isVowel(last) && isVowel(secondLast) && !isVowel(thirdLast)
    && !'wxy'.includes(last);
}
