import type { CoachingNote } from './hooks/sighting-hook.js';

/**
 * Format coaching notes as blockquote footnotes.
 *
 * 1–3 notes: full individual footnotes.
 * 4+ notes:  collapsed into a single summary line.
 */
export function formatCoachingFootnotes(notes: CoachingNote[]): string {
  if (notes.length === 0) return '';
  if (notes.length <= 3) return notes.map(formatOne).join('\n');
  return formatCollapsed(notes);
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

function formatCollapsed(notes: CoachingNote[]): string {
  const words = notes.map(n => {
    if (n.type === 'synonym') return `${n.synonym} → ${n.word}`;
    return n.word;
  });
  return `> #vocab Spotted ${notes.length} vault words: ${words.join(', ')}. Nice density!`;
}
