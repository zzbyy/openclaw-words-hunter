import { describe, it, expect, vi, afterEach } from 'vitest';
import { onOutgoingMessage } from '../src/hooks/sighting-hook.js';
import type { VaultConfig, MasteryStore, PluginRuntime } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(words: string[]): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };

  // Write .md files for each word
  for (const word of words) {
    await writeFile(join(vaultPath, 'Words', `${word}.md`), `> [!info] ${word}\n> //\n\n## Sightings\n`, 'utf8');
  }

  // Write mastery.json
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

function makeRuntime(): { runtime: PluginRuntime; messages: Array<{ channelId: string; message: string }> } {
  const messages: Array<{ channelId: string; message: string }> = [];
  const runtime: PluginRuntime = {
    logger: { info: () => {} },
    sendMessage: async (channelId: string, message: string) => {
      messages.push({ channelId, message });
    },
  };
  return { runtime, messages };
}

describe('sighting-hook', () => {
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
      // File should be unchanged — no sighting recorded
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

  it('message matching no words → no-op (no errors)', async () => {
    const { config, cleanup } = await makeVault(['posit']);
    try {
      // Should not throw
      await expect(onOutgoingMessage(config, 'This message has no captured words.')).resolves.toBeUndefined();
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

  // --- Coaching engine tests ---

  it('direct hit: sighting logged + inline feedback when coaching_mode=inline', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 3, status: 'reviewing', score: 80, last_practiced: '', next_review: '2026-04-01', sessions: 3, failures: [], best_sentences: [], coaching_mode: 'inline' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      await onOutgoingMessage(config, 'I posit this is true.', 'ch-1', runtime);

      // Sighting logged
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');

      // Inline feedback sent
      expect(messages).toHaveLength(1);
      expect(messages[0]!.message).toContain('posit');
      expect(messages[0]!.message).toContain('Box 3');
    } finally {
      await cleanup();
    }
  });

  it('direct hit: sighting logged, no feedback when coaching_mode absent', async () => {
    const { vaultPath, config, cleanup } = await makeVault(['posit']);
    try {
      const { runtime, messages } = makeRuntime();
      await onOutgoingMessage(config, 'I posit this is true.', 'ch-1', runtime);

      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
      expect(messages).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('synonym hit: upgrade sent when vault word has coaching_mode=inline', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      await onOutgoingMessage(config, 'I suggest we go ahead.', 'ch-1', runtime);

      expect(messages).toHaveLength(1);
      expect(messages[0]!.message).toContain('suggest');
      expect(messages[0]!.message).toContain('posit');
    } finally {
      await cleanup();
    }
  });

  it('synonym hit: no upgrade when vault word has coaching_mode absent', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], synonyms: ['suggest'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      await onOutgoingMessage(config, 'I suggest we go ahead.', 'ch-1', runtime);

      expect(messages).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('direct hit suppresses synonym hit for same vault word in same message', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      // Message contains both "posit" (direct) and "suggest" (synonym)
      await onOutgoingMessage(config, 'I posit and suggest we go ahead.', 'ch-1', runtime);

      // Should get direct feedback only (not synonym upgrade)
      expect(messages).toHaveLength(1);
      expect(messages[0]!.message).toContain('naturally used');

      // Sighting logged for direct hit
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit and suggest we go ahead.');
    } finally {
      await cleanup();
    }
  });

  it('3+ inline matches: only top-2 by box send; all sightings logged', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        alpha: { word: 'alpha', box: 1, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline' },
        beta:  { word: 'beta',  box: 3, status: 'reviewing', score: 70, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'inline' },
        gamma: { word: 'gamma', box: 5, status: 'mastered', score: 90, last_practiced: '', next_review: '2026-04-01', sessions: 5, failures: [], best_sentences: [], coaching_mode: 'inline' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      await onOutgoingMessage(config, 'Alpha beta gamma in one message.', 'ch-1', runtime);

      // Only top-2 by box (gamma box5, beta box3) get notifications
      expect(messages).toHaveLength(2);
      const texts = messages.map(m => m.message);
      expect(texts.some(t => t.includes('gamma'))).toBe(true);
      expect(texts.some(t => t.includes('beta'))).toBe(true);
      expect(texts.some(t => t.includes('alpha'))).toBe(false);

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
        posit:    { word: 'posit',    box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        assert:   { word: 'assert',   box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        propose:  { word: 'propose',  box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        maintain: { word: 'maintain', box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      // "suggest" is shared by 4 vault words → excluded; no synonym upgrade sent
      await onOutgoingMessage(config, 'I suggest we reconsider.', 'ch-1', runtime);
      expect(messages).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('synonym that is itself a vault word: excluded from cache', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit:  { word: 'posit',  box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['assert'] },
        assert: { word: 'assert', box: 3, status: 'reviewing', score: 70, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'inline' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      // "assert" is both a synonym of "posit" and a vault word — it's a direct hit for "assert"
      // The synonym rule excludes it from the synonym cache entirely.
      await onOutgoingMessage(config, 'I assert this is true.', 'ch-1', runtime);

      // Direct hit for "assert" → inline feedback for assert (not synonym upgrade)
      expect(messages).toHaveLength(1);
      expect(messages[0]!.message).toContain('assert');
      expect(messages[0]!.message).toContain('naturally used');

      // Sighting logged for assert
      const content = await readFile(join(vaultPath, 'Words', 'assert.md'), 'utf8');
      expect(content).toContain('I assert this is true.');
    } finally {
      await cleanup();
    }
  });

  it('synonym satisfies both exclusion rules simultaneously: excluded, no crash', async () => {
    // "suggest" appears in >3 words AND is itself a vault word
    const store: MasteryStore = {
      version: 1,
      words: {
        posit:   { word: 'posit',   box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        assert:  { word: 'assert',  box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        propose: { word: 'propose', box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        claim:   { word: 'claim',   box: 2, status: 'learning', score: 50, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest'] },
        suggest: { word: 'suggest', box: 1, status: 'learning', score: 40, last_practiced: '', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [], coaching_mode: 'inline' },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      // "suggest" used — direct hit for "suggest" vault word, no synonym upgrade for posit/assert/etc
      await expect(onOutgoingMessage(config, 'I suggest we proceed.', 'ch-1', runtime)).resolves.toBeUndefined();
      // Only direct hit feedback for "suggest"
      expect(messages).toHaveLength(1);
      expect(messages[0]!.message).toContain('suggest');
      expect(messages[0]!.message).toContain('naturally used');
    } finally {
      await cleanup();
    }
  });

  it('two synonyms for same vault word in one message: only one upgrade sent', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: '', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [], coaching_mode: 'inline', synonyms: ['suggest', 'propose'] },
      },
    };
    const { config, cleanup } = await makeVaultWithStore(store);
    try {
      const { runtime, messages } = makeRuntime();
      // Both "suggest" and "propose" are synonyms of "posit" — only one nudge should fire
      await onOutgoingMessage(config, 'I suggest and propose we move forward.', 'ch-1', runtime);

      expect(messages).toHaveLength(1);
      expect(messages[0]!.message).toContain('posit');
    } finally {
      await cleanup();
    }
  });

  it('missing runtime: sightings logged, no notifications sent', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 3, status: 'reviewing', score: 80, last_practiced: '', next_review: '2026-04-01', sessions: 3, failures: [], best_sentences: [], coaching_mode: 'inline' },
      },
    };
    const { vaultPath, config, cleanup } = await makeVaultWithStore(store);
    try {
      // No runtime passed
      await onOutgoingMessage(config, 'I posit this is true.', 'ch-1');

      // Sighting still logged
      const content = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(content).toContain('I posit this is true.');
    } finally {
      await cleanup();
    }
  });
});
