/**
 * Tokenize text into lowercase word tokens.
 * Preserves hyphens and apostrophes within words (e.g. "don't", "co-opt").
 * Strips surrounding punctuation.
 */
const TOKEN_RE = /[a-z0-9]+(?:['\u2019\-][a-z0-9]+)*/gi;

export function tokenize(text: string): string[] {
  const matches = text.match(TOKEN_RE);
  if (!matches) return [];
  return matches.map(t => t.toLowerCase());
}
