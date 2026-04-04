import { describe, it, expect } from 'vitest';
import { onOutgoingMessage } from '../src/hooks/sighting-hook.js';
import type { CoachingNote } from '../src/hooks/sighting-hook.js';
import type { VaultConfig, MasteryStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(words: string[]): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };

  for (const word of words) {
    await writeFile(join(vaultPath, 'Words', `${word}.md`), `> [!info] ${word}\n> //\n\n## Sightings\n`, 'utf8');
  }

  const storeWords: MasteryStore['words'] = {};
  for (const word of words) {
    storeWords[word] = { word, box: 1, status: 'learning', score: 0, last_practiced: '', next_review: '2026-03-29', sessions: 0, failures: [], best_sentences: [] };
  }
  const store: MasteryStore = { version: 1, words: storeWords };
  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

async function makeVaultWithStore(store: MasteryStore): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };

  for (const word of Object.keys(store.words)) {
    await writeFile(join(vaultPath, 'Words', `${word}.md`), `> [!info] ${word}\n> //\n\n## Sightings\n`, 'utf8');
  }
  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

describe('sighting-hook', () => {
  // --- Core sighting tests ---

  it('outgoing message containing "posit" → sighting recorded', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I posit that this is correct.', 'Telegram');
      const updated = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(updated).toContain('I posit that this is correct.');
    } finally {
      await cleanup();
    }
  });

  it('outgoing message containing "positive" → no sighting for "posit" (word-boundary regex)', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const originalContent = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      await onOutgoingMessage(config, 'That is a positive outcome!');
      const updated = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(updated).toBe(originalContent);
    } finally {
      await cleanup();
    }
  });

  it('message containing both "posit" and "ephemeral" → two sightings recorded', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit', 'ephemeral']);
    try {
      await onOutgoingMessage(config, 'I posit that ephemeral fame is overrated.', 'WeChat');
      const positContent = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      const ephemeralContent = await readFile(join(vaultPath, 'Words', 'ephemeral.md'), 'utf8');
      expect(positContent).toContain('I posit that ephemeral fame is overrated.');
      expect(ephemeralContent).toContain('I posit that ephemeral fame is overrated.');
    } finally {
      await cleanup();
    }
  });

  it('message matching no words → returns empty array', async () => {
    const { config, cleanup } = await makeVault(['posit']);
    try {
      const notes = await onOutgoingMessage(config, 'This message has no captured words.');
      expect(notes).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('refreshes cached matchers after mastery.json changes', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const updatedStore: MasteryStore = {
        version: 1,
        words: {
          posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: '2026-03-29', sessions: 0, failures: [], best_sentences: [] },
          liminal: { word: 'liminal', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: '2026-03-29', sessions: 0, failures: [], best_sentences: [] },
        },
      };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(updatedStore), 'utf8');
      await writeFile(join(vaultPath, 'Words', 'liminal.md'), '> [!info] liminal\n> //\n\n## Sightings\n', 'utf8');

      await onOutgoingMessage(config, 'The liminal hallway felt surreal.');
      const updated = await readFile(join(vaultPath, 'Words', 'liminal.md'), 'utf8');
      expect(updated).toContain('The liminal hallway felt surreal.');
    } finally {
      await cleanup();
    }
  });

  it('records the extracted sentence for long messages', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const longMessage = [
        'This introduction is intentionally long and says nothing important at all.',
        'A second sentence keeps stretching the message far beyond the short-message threshold.',
        'I posit that the final sentence should be the one we keep.',
      ].join(' ');

      await onOutgoingMessage(config, longMessage);
      const updated = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(updated).toContain('I posit that the final sentence should be the one we keep.');
      expect(updated).not.toContain('This introduction is intentionally long');
    } finally {
      await cleanup();
    }
  });

  // --- Coaching notes: default on ---

  it('coaching_mode absent (default=on): returns coaching note', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const notes = await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('direct');
      expect(notes[0]!.word).toBe('posit');
      expect(notes[0]!.box).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('coaching_mode=inline: returns coaching note (explicit on)', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 3, status: 'reviewing', score: 80, last_practiced: '', next_review: '2026-04-01', sessions: 3, failures: [], best_sentences: [], coaching_mode: 'inline' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
      expect(notes).toHaveLength(1);
      expect(notes[0]!.word).toBe('posit');
      expect(notes[0]!.box).toBe(3);
    } finally {
      await cleanup();
    }
  });

  it('coaching_mode=silent: sighting logged but no coaching note', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'silent' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
      expect(notes).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('Box 4+ (mastered): sighting logged but no coaching note', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 4, status: 'mastered', score: 95, last_practiced: '', next_review: '2026-05-01', sessions: 10, failures: [], best_sentences: [] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
      expect(notes).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('short_definition included in coaching note when present', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], short_definition: 'to suggest as fact' },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');
      expect(notes).toHaveLength(1);
      expect(notes[0]!.shortDef).toBe('to suggest as fact');
    } finally {
      await cleanup();
    }
  });

  // --- Synonym coaching ---

  it('synonym hit: returns synonym coaching note (default on)', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], synonyms: ['suggest'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I suggest we go ahead.', 'ch-1');
      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('synonym');
      expect(notes[0]!.word).toBe('posit');
      expect(notes[0]!.synonym).toBe('suggest');
    } finally {
      await cleanup();
    }
  });

  it('synonym hit: no note when vault word has coaching_mode=silent', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'silent', synonyms: ['suggest'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I suggest we go ahead.', 'ch-1');
      expect(notes).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('direct hit suppresses synonym hit for same vault word', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], synonyms: ['suggest'] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I posit and suggest we go ahead.', 'ch-1');

      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('direct');
      expect(notes[0]!.word).toBe('posit');

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit and suggest we go ahead.');
    } finally {
      await cleanup();
    }
  });

  it('3 matches: all returned, sorted by box desc', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        alpha: { word: 'alpha', box: 1, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [] },
        beta:  { word: 'beta',  box: 3, status: 'reviewing', score: 70, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [] },
        gamma: { word: 'gamma', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'Alpha beta gamma in one message.', 'ch-1');

      // All 3 returned, sorted by box descending
      expect(notes).toHaveLength(3);
      expect(notes[0]!.word).toBe('beta');   // box 3
      expect(notes[1]!.word).toBe('gamma');  // box 2
      expect(notes[2]!.word).toBe('alpha');  // box 1

      // All 3 sightings logged
      for (const word of ['alpha', 'beta', 'gamma']) {
        const content = await readFile(join(vaultPath, 'Words', `${word}.md`), 'utf8');
        expect(content).toContain('Alpha beta gamma');
      }
    } finally {
      await cleanup();
    }
  });

  it('synonym with >3 vault word mappings: excluded from cache', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit:    { word: 'posit',    box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], synonyms: ['suggest'] },
        assert:   { word: 'assert',   box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], synonyms: ['suggest'] },
        propose:  { word: 'propose',  box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], synonyms: ['suggest'] },
        maintain: { word: 'maintain', box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], synonyms: ['suggest'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I suggest we reconsider.', 'ch-1');
      expect(notes).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('synonym that is itself a vault word: direct hit, not synonym nudge', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit:  { word: 'posit',  box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], synonyms: ['assert'] },
        assert: { word: 'assert', box: 3, status: 'reviewing', score: 70, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I assert this is true.', 'ch-1');

      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('direct');
      expect(notes[0]!.word).toBe('assert');

      const content = await readFile(join(vaultPath, 'Words', 'assert.md'), 'utf8');
      expect(content).toContain('I assert this is true.');
    } finally {
      await cleanup();
    }
  });

  it('two synonyms for same vault word: only one synonym note', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], synonyms: ['suggest', 'propose'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I suggest and propose we move forward.', 'ch-1');

      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('synonym');
      expect(notes[0]!.word).toBe('posit');
    } finally {
      await cleanup();
    }
  });

  // --- Inflection-aware matching ---

  it('inflected form "posited" matches vault word "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const notes = await onOutgoingMessage(config, 'I posited that this is correct.', 'ch-1');
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posited that this is correct.');
      expect(notes).toHaveLength(1);
      expect(notes[0]!.word).toBe('posit');
    } finally {
      await cleanup();
    }
  });

  it('inflected form "positing" matches vault word "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const notes = await onOutgoingMessage(config, 'I am positing a theory.', 'ch-1');
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I am positing a theory.');
      expect(notes).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('"deposit" does NOT match vault word "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const originalContent = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      const notes = await onOutgoingMessage(config, 'Please deposit the check.');
      const updated = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(updated).toBe(originalContent);
      expect(notes).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('no channel: sightings logged, notes still returned', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 3, status: 'reviewing', score: 80, last_practiced: '', next_review: '2026-04-01', sessions: 3, failures: [], best_sentences: [] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const notes = await onOutgoingMessage(config, 'I posit this is true.');

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
      expect(notes).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
