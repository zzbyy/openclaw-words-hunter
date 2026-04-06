import { describe, it, expect } from 'vitest';
import { repairVault } from '../src/cli/repair.js';
import type { VaultConfig, MasteryStore, WordEntry } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-repair-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  await writeFile(
    join(vaultPath, '.wordshunter', 'config.json'),
    JSON.stringify({ vault_path: vaultPath, words_folder: 'Words' }),
    'utf8',
  );
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

function makeEntry(word: string): WordEntry {
  return {
    word, box: 1, status: 'learning', score: 0,
    last_practiced: '', next_review: '2026-04-01',
    sessions: 0, failures: [], best_sentences: [],
  };
}

describe('repairVault', () => {
  it('adds frontmatter to page without it', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const content = '# posit\n\n**Pronunciation:** 🇬🇧 /pɒz.ɪt/\n\n## Sightings\n';
      await writeFile(join(vaultPath, 'Words', 'posit.md'), content, 'utf8');

      const store: MasteryStore = { version: 1, words: { posit: makeEntry('posit') } };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

      const { repaired } = await repairVault(config);
      expect(repaired).toBe(1);

      const out = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(out).toMatch(/^---\ntype: word-page\n---\n/);
      expect(out).toContain('# posit');
    } finally {
      await cleanup();
    }
  });

  it('skips page that already has frontmatter', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const content = '---\ntype: word-page\n---\n# posit\n\n**Pronunciation:** 🇬🇧 /pɒz.ɪt/\n';
      await writeFile(join(vaultPath, 'Words', 'posit.md'), content, 'utf8');

      const store: MasteryStore = { version: 1, words: { posit: makeEntry('posit') } };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

      const { repaired, skipped } = await repairVault(config);
      expect(repaired).toBe(0);
      expect(skipped).toBe(1);

      const out = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(out).toBe(content);
    } finally {
      await cleanup();
    }
  });

  it('skips when no .md file for word', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const store: MasteryStore = { version: 1, words: { ghost: makeEntry('ghost') } };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

      const { repaired, skipped } = await repairVault(config);
      expect(repaired).toBe(0);
      expect(skipped).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });
});
