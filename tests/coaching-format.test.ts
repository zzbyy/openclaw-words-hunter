import { describe, it, expect } from 'vitest';
import { formatCoachingFootnotes } from '../src/coaching-format.js';
import type { CoachingNote } from '../src/hooks/sighting-hook.js';

describe('formatCoachingFootnotes', () => {
  it('empty array → empty string', () => {
    expect(formatCoachingFootnotes([])).toBe('');
  });

  it('direct hit with short_definition', () => {
    const notes: CoachingNote[] = [{ type: 'direct', word: 'deliberate', box: 2, shortDef: 'done on purpose' }];
    expect(formatCoachingFootnotes(notes)).toBe('> #vocab deliberate — done on purpose. Nice use, keep it up.');
  });

  it('direct hit without short_definition', () => {
    const notes: CoachingNote[] = [{ type: 'direct', word: 'deliberate', box: 2 }];
    expect(formatCoachingFootnotes(notes)).toBe('> #vocab deliberate — nice use. Box 2.');
  });

  it('synonym nudge with short_definition', () => {
    const notes: CoachingNote[] = [{ type: 'synonym', word: 'posit', box: 2, shortDef: 'to assert as fact', synonym: 'suggest' }];
    expect(formatCoachingFootnotes(notes)).toBe('> #vocab you wrote "suggest" — consider "posit" (to assert as fact). Box 2.');
  });

  it('synonym nudge without short_definition', () => {
    const notes: CoachingNote[] = [{ type: 'synonym', word: 'posit', box: 2, synonym: 'suggest' }];
    expect(formatCoachingFootnotes(notes)).toBe('> #vocab you wrote "suggest" — consider "posit". Box 2.');
  });

  it('2-3 notes: individual footnotes joined with newline', () => {
    const notes: CoachingNote[] = [
      { type: 'direct', word: 'deliberate', box: 2, shortDef: 'done on purpose' },
      { type: 'direct', word: 'ambient', box: 1 },
    ];
    const result = formatCoachingFootnotes(notes);
    expect(result).toBe(
      '> #vocab deliberate — done on purpose. Nice use, keep it up.\n' +
      '> #vocab ambient — nice use. Box 1.'
    );
  });

  it('4+ notes: collapsed into summary line', () => {
    const notes: CoachingNote[] = [
      { type: 'direct', word: 'deliberate', box: 2 },
      { type: 'direct', word: 'conflate', box: 1 },
      { type: 'direct', word: 'reputation', box: 1 },
      { type: 'direct', word: 'suppress', box: 1 },
    ];
    const result = formatCoachingFootnotes(notes);
    expect(result).toBe('> #vocab Spotted 4 vault words: deliberate, conflate, reputation, suppress. Nice density!');
  });

  it('4+ notes with synonym: collapsed with arrow notation', () => {
    const notes: CoachingNote[] = [
      { type: 'direct', word: 'deliberate', box: 2 },
      { type: 'direct', word: 'conflate', box: 1 },
      { type: 'direct', word: 'reputation', box: 1 },
      { type: 'synonym', word: 'posit', box: 1, synonym: 'suggest' },
    ];
    const result = formatCoachingFootnotes(notes);
    expect(result).toBe('> #vocab Spotted 4 vault words: deliberate, conflate, reputation, suggest → posit. Nice density!');
  });
});
