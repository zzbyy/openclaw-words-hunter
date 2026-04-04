import { describe, it, expect } from 'vitest';
import { onOutgoingMessage } from '../src/hooks/sighting-hook.js';
import type { VaultConfig, MasteryStore, SightingsStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TODAY = new Date().toISOString().slice(0, 10);

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

async function readSightings(vaultPath: string): Promise<SightingsStore> {
  try {
    const raw = await readFile(join(vaultPath, '.wordshunter', 'sightings.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: 1, days: {} };
  }
}

function getSightingsForWord(store: SightingsStore, word: string): string[] {
  const daySightings = store.days[TODAY] ?? {};
  return (daySightings[word] ?? []).map(s => s.sentence);
}

describe('sighting-hook', () => {
  it('outgoing message containing "posit" → sighting recorded in sightings.json', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I posit that this is correct.', 'Telegram');
      const store = await readSightings(vaultPath);
      expect(getSightingsForWord(store, 'posit')).toContain('I posit that this is correct.');
    } finally {
      await cleanup();
    }
  });

  it('"positive" does NOT create sighting for "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'That is a positive outcome!');
      const store = await readSightings(vaultPath);
      expect(getSightingsForWord(store, 'posit')).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('message with both "posit" and "ephemeral" → two sightings', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit', 'ephemeral']);
    try {
      await onOutgoingMessage(config, 'I posit that ephemeral fame is overrated.', 'WeChat');
      const store = await readSightings(vaultPath);
      expect(getSightingsForWord(store, 'posit')).toHaveLength(1);
      expect(getSightingsForWord(store, 'ephemeral')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('no matching words → no sightings.json created', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'This message has no captured words.');
      const store = await readSightings(vaultPath);
      expect(Object.keys(store.days)).toHaveLength(0);
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

      await onOutgoingMessage(config, 'The liminal hallway felt surreal.');
      const store = await readSightings(vaultPath);
      expect(getSightingsForWord(store, 'liminal')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('extracts sentence for long messages', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const longMessage = [
        'This introduction is intentionally long and says nothing important at all.',
        'A second sentence keeps stretching the message far beyond the short-message threshold.',
        'I posit that the final sentence should be the one we keep.',
      ].join(' ');

      await onOutgoingMessage(config, longMessage);
      const store = await readSightings(vaultPath);
      const sentences = getSightingsForWord(store, 'posit');
      expect(sentences[0]).toContain('I posit that the final sentence should be the one we keep.');
      expect(sentences[0]).not.toContain('This introduction is intentionally long');
    } finally {
      await cleanup();
    }
  });

  it('coaching_mode=silent: sighting still recorded', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'silent' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');
      const sightings = await readSightings(vaultPath);
      expect(getSightingsForWord(sightings, 'posit')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('Box 4+ (mastered): sighting still recorded', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 4, status: 'mastered', score: 95, last_practiced: '', next_review: '2026-05-01', sessions: 10, failures: [], best_sentences: [] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');
      const sightings = await readSightings(vaultPath);
      expect(getSightingsForWord(sightings, 'posit')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('no channel: sighting still recorded', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I posit this is true.');
      const sightings = await readSightings(vaultPath);
      expect(getSightingsForWord(sightings, 'posit')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  // --- Inflection-aware matching ---

  it('inflected "posited" → sighting for "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I posited that this is correct.', 'ch-1');
      const sightings = await readSightings(vaultPath);
      expect(getSightingsForWord(sightings, 'posit')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('inflected "positing" → sighting for "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I am positing a theory.', 'ch-1');
      const sightings = await readSightings(vaultPath);
      expect(getSightingsForWord(sightings, 'posit')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('"deposit" does NOT match "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'Please deposit the check.');
      const sightings = await readSightings(vaultPath);
      expect(getSightingsForWord(sightings, 'posit')).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('3 words detected: all sightings recorded', async () => {
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
      await onOutgoingMessage(config, 'Alpha beta gamma in one message.', 'ch-1');
      const sightings = await readSightings(vaultPath);
      for (const word of ['alpha', 'beta', 'gamma']) {
        expect(getSightingsForWord(sightings, word)).toHaveLength(1);
      }
    } finally {
      await cleanup();
    }
  });
});
