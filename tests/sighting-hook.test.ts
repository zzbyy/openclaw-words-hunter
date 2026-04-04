import { describe, it, expect } from 'vitest';
import { onOutgoingMessage } from '../src/hooks/sighting-hook.js';
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

  it('outgoing message containing "positive" → no sighting for "posit" (word-boundary)', async () => {
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

  it('message matching no words → no sightings', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const originalContent = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      await onOutgoingMessage(config, 'This message has no captured words.');
      const updated = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(updated).toBe(originalContent);
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

  // --- Sightings recorded regardless of coaching_mode or box ---

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
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
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
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
    } finally {
      await cleanup();
    }
  });

  it('no channel: sighting still recorded', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I posit this is true.');
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
    } finally {
      await cleanup();
    }
  });

  // --- Inflection-aware matching ---

  it('inflected form "posited" matches vault word "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I posited that this is correct.', 'ch-1');
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posited that this is correct.');
    } finally {
      await cleanup();
    }
  });

  it('inflected form "positing" matches vault word "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      await onOutgoingMessage(config, 'I am positing a theory.', 'ch-1');
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I am positing a theory.');
    } finally {
      await cleanup();
    }
  });

  it('"deposit" does NOT match vault word "posit"', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const originalContent = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      await onOutgoingMessage(config, 'Please deposit the check.');
      const updated = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(updated).toBe(originalContent);
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
      for (const word of ['alpha', 'beta', 'gamma']) {
        const content = await readFile(join(vaultPath, 'Words', `${word}.md`), 'utf8');
        expect(content).toContain('Alpha beta gamma');
      }
    } finally {
      await cleanup();
    }
  });
});
