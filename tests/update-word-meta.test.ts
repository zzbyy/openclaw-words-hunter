import { describe, it, expect } from 'vitest';
import { updateWordMeta } from '../src/tools/update-word-meta.js';
import type { VaultConfig, MasteryStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

async function writeStore(vaultPath: string, store: MasteryStore): Promise<void> {
  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');
}

async function readStore(vaultPath: string): Promise<MasteryStore> {
  const raw = await readFile(join(vaultPath, '.wordshunter', 'mastery.json'), 'utf8');
  return JSON.parse(raw) as MasteryStore;
}

const BASE_ENTRY: MasteryStore['words']['posit'] = {
  word: 'posit',
  box: 3,
  status: 'reviewing',
  score: 78,
  last_practiced: '2026-03-28',
  next_review: '2026-04-04',
  sessions: 3,
  failures: [],
  best_sentences: [],
};

describe('update_word_meta', () => {
  it('round-trip: set coaching_mode=inline; SRS fields unchanged', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await writeStore(vaultPath, { version: 1, words: { posit: { ...BASE_ENTRY } } });

      const result = await updateWordMeta(config, { word: 'posit', coaching_mode: 'inline' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.word).toBe('posit');
      expect(result.data.coaching_mode).toBe('inline');

      const store = await readStore(vaultPath);
      const entry = store.words['posit']!;
      expect(entry.coaching_mode).toBe('inline');
      // SRS fields must be unchanged
      expect(entry.box).toBe(3);
      expect(entry.status).toBe('reviewing');
      expect(entry.score).toBe(78);
      expect(entry.sessions).toBe(3);
      expect(entry.next_review).toBe('2026-04-04');
    } finally {
      await cleanup();
    }
  });

  it('normalize synonyms: uppercase trimmed to lowercase, max 5 enforced', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await writeStore(vaultPath, { version: 1, words: { posit: { ...BASE_ENTRY } } });

      const result = await updateWordMeta(config, {
        word: 'posit',
        synonyms: ['Suggest', ' PROPOSE ', 'Assert', 'Posit', 'posit', 'claim', 'maintain'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // deduped: suggest, propose, assert, posit, claim (first 5 after dedup)
      expect(result.data.synonyms).toHaveLength(5);
      expect(result.data.synonyms).toContain('suggest');
      expect(result.data.synonyms).toContain('propose');
      expect(result.data.synonyms).toContain('assert');
      expect(result.data.synonyms).toContain('posit');
      expect(result.data.synonyms).toContain('claim');
      // 'maintain' is 6th — should be excluded
      expect(result.data.synonyms).not.toContain('maintain');
    } finally {
      await cleanup();
    }
  });

  it('both fields omitted: returns success, stored entry unchanged', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const originalEntry = { ...BASE_ENTRY };
      await writeStore(vaultPath, { version: 1, words: { posit: originalEntry } });

      const result = await updateWordMeta(config, { word: 'posit' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.word).toBe('posit');

      const store = await readStore(vaultPath);
      const entry = store.words['posit']!;
      expect(entry.box).toBe(originalEntry.box);
      expect(entry.score).toBe(originalEntry.score);
      expect(entry.sessions).toBe(originalEntry.sessions);
    } finally {
      await cleanup();
    }
  });

  it('unknown word returns FILE_NOT_FOUND', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await writeStore(vaultPath, { version: 1, words: {} });

      const result = await updateWordMeta(config, { word: 'unknown', coaching_mode: 'inline' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('FILE_NOT_FOUND');
    } finally {
      await cleanup();
    }
  });

  it('invalid word returns INVALID_INPUT', async () => {
    const { config, cleanup } = await makeVault();
    try {
      const result = await updateWordMeta(config, { word: '../../etc/passwd', coaching_mode: 'inline' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_INPUT');
    } finally {
      await cleanup();
    }
  });
});
