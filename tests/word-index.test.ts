import { describe, it, expect } from 'vitest';
import { regenerateWordIndex } from '../src/word-index.js';
import type { VaultConfig, MasteryStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-idx-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

async function writeStore(vaultPath: string, store: MasteryStore): Promise<void> {
  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');
}

async function writeWordPage(vaultPath: string, word: string): Promise<void> {
  await writeFile(join(vaultPath, 'Words', `${word}.md`), `# ${word}`, 'utf8');
}

async function readIndex(vaultPath: string): Promise<string> {
  return readFile(join(vaultPath, 'Words', 'index.md'), 'utf8');
}

describe('regenerateWordIndex', () => {
  it('empty vault → zero stats, no sections', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await writeStore(vaultPath, { version: 1, words: {} });
      await regenerateWordIndex(config);
      const content = await readIndex(vaultPath);
      expect(content).toContain('0 words');
      expect(content).not.toContain('## Mastered');
      expect(content).not.toContain('## Reviewing');
      expect(content).not.toContain('## Learning');
    } finally {
      await cleanup();
    }
  });

  it('groups words by status with correct counts', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const store: MasteryStore = {
        version: 1,
        words: {
          posit:     { word: 'posit',     box: 4, status: 'mastered',  score: 90, last_practiced: '2026-03-29', next_review: '2026-04-12', sessions: 5, failures: [], best_sentences: [] },
          ephemeral: { word: 'ephemeral', box: 3, status: 'reviewing', score: 85, last_practiced: '2026-03-28', next_review: '2026-04-05', sessions: 3, failures: [], best_sentences: [] },
          liminal:   { word: 'liminal',   box: 1, status: 'learning',  score: 55, last_practiced: '2026-03-27', next_review: '2026-03-28', sessions: 1, failures: [], best_sentences: [] },
          nascent:   { word: 'nascent',   box: 2, status: 'learning',  score: 60, last_practiced: '2026-03-26', next_review: '2026-03-29', sessions: 2, failures: [], best_sentences: [] },
        },
      };
      await writeStore(vaultPath, store);
      for (const word of Object.keys(store.words)) {
        await writeWordPage(vaultPath, word);
      }

      await regenerateWordIndex(config);
      const content = await readIndex(vaultPath);

      expect(content).toContain('4 words');
      expect(content).toContain('1 mastered');
      expect(content).toContain('1 reviewing');
      expect(content).toContain('2 learning');
      expect(content).toContain('## Mastered (1)');
      expect(content).toContain('[[posit]]');
      expect(content).toContain('## Reviewing (1)');
      expect(content).toContain('[[ephemeral]]');
      expect(content).toContain('## Learning (2)');
      expect(content).toContain('[[liminal]]');
      expect(content).toContain('[[nascent]]');
    } finally {
      await cleanup();
    }
  });

  it('skips words without .md pages on disk', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const store: MasteryStore = {
        version: 1,
        words: {
          posit:   { word: 'posit',   box: 4, status: 'mastered', score: 90, last_practiced: '2026-03-29', next_review: '2026-04-12', sessions: 5, failures: [], best_sentences: [] },
          deleted: { word: 'deleted', box: 2, status: 'learning', score: 50, last_practiced: '2026-03-29', next_review: '2026-04-01', sessions: 1, failures: [], best_sentences: [] },
        },
      };
      await writeStore(vaultPath, store);
      await writeWordPage(vaultPath, 'posit');
      // 'deleted' has no .md page

      await regenerateWordIndex(config);
      const content = await readIndex(vaultPath);

      expect(content).toContain('1 words');
      expect(content).toContain('[[posit]]');
      expect(content).not.toContain('[[deleted]]');
    } finally {
      await cleanup();
    }
  });

  it('sorts words alphabetically within groups', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const store: MasteryStore = {
        version: 1,
        words: {
          zeal:    { word: 'zeal',    box: 1, status: 'learning', score: 50, last_practiced: '2026-03-29', next_review: '2026-03-30', sessions: 1, failures: [], best_sentences: [] },
          alpha:   { word: 'alpha',   box: 1, status: 'learning', score: 50, last_practiced: '2026-03-29', next_review: '2026-03-30', sessions: 1, failures: [], best_sentences: [] },
          mellow:  { word: 'mellow',  box: 2, status: 'learning', score: 60, last_practiced: '2026-03-29', next_review: '2026-04-01', sessions: 2, failures: [], best_sentences: [] },
        },
      };
      await writeStore(vaultPath, store);
      for (const word of Object.keys(store.words)) {
        await writeWordPage(vaultPath, word);
      }

      await regenerateWordIndex(config);
      const content = await readIndex(vaultPath);

      const learningSection = content.split('## Learning')[1];
      const alphaPos = learningSection.indexOf('[[alpha]]');
      const mellowPos = learningSection.indexOf('[[mellow]]');
      const zealPos = learningSection.indexOf('[[zeal]]');
      expect(alphaPos).toBeLessThan(mellowPos);
      expect(mellowPos).toBeLessThan(zealPos);
    } finally {
      await cleanup();
    }
  });
});
