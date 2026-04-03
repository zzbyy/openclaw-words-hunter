import type { CoachingNote } from './hooks/sighting-hook.js';

/**
 * Format coaching notes as Telegram blockquote footnotes.
 *
 * Direct hit (with definition):  > #vocab word — definition. Nice use, keep it up.
 * Direct hit (no definition):    > #vocab word — nice use. Box N.
 * Synonym nudge:                 > #vocab you wrote "synonym" — consider "word" (definition). Box N.
 * Synonym nudge (no definition): > #vocab you wrote "synonym" — consider "word". Box N.
 */
export function formatCoachingFootnotes(notes: CoachingNote[]): string {
  if (notes.length === 0) return '';
  return notes.map(formatOne).join('\n');
}

function formatOne(note: CoachingNote): string {
  if (note.type === 'synonym') {
    const defPart = note.shortDef ? ` (${note.shortDef})` : '';
    return `> #vocab you wrote "${note.synonym}" — consider "${note.word}"${defPart}. Box ${note.box}.`;
  }
  // direct
  if (note.shortDef) {
    return `> #vocab ${note.word} — ${note.shortDef}. Nice use, keep it up.`;
  }
  return `> #vocab ${note.word} — nice use. Box ${note.box}.`;
}
