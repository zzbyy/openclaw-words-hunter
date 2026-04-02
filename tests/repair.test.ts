import { describe, it, expect } from 'vitest';
import { repairVault } from '../src/cli/repair.js';
import type { VaultConfig, MasteryStore, WordEntry } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURES = join(import.meta.dirname, 'fixtures');

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

describe('repairVault', () => {
  it('regenerates stale mastery callout from JSON', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      let md = readFileSync(join(FIXTURES, 'posit-full-mastery.md'), 'utf8');
      md = md.replace(
        /^> \[!mastery\](?:\n> [^\n]*)*\n?/m,
        '> [!mastery]\n> **Status:** learning\n> **Stale:** yes\n',
      );
      await writeFile(join(vaultPath, 'Words', 'posit.md'), md, 'utf8');

      const entry: WordEntry = {
        word: 'posit',
        box: 2,
        status: 'reviewing',
        score: 88,
        last_practiced: '2026-04-01',
        next_review: '2026-04-05',
        sessions: 2,
        failures: [],
        best_sentences: [],
      };
      const store: MasteryStore = { version: 1, words: { posit: entry } };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

      const { repaired } = await repairVault(config);
      expect(repaired).toBe(1);

      const out = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(out).toContain('**Box:** 2');
      expect(out).not.toContain('**Stale:**');
    } finally {
      await cleanup();
    }
  });

  it('inserts callout when missing', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const md = readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8');
      const withoutMastery = md.replace(/^> \[!mastery\](?:\n> [^\n]*)*\n?/m, '');
      await writeFile(join(vaultPath, 'Words', 'posit.md'), withoutMastery, 'utf8');

      const entry: WordEntry = {
        word: 'posit',
        box: 1,
        status: 'learning',
        score: 0,
        last_practiced: '',
        next_review: '2026-04-01',
        sessions: 0,
        failures: [],
        best_sentences: [],
      };
      const store: MasteryStore = { version: 1, words: { posit: entry } };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

      const { repaired } = await repairVault(config);
      expect(repaired).toBe(1);
      const out = await readFile(join(vaultPath, 'Words', 'posit.md'), 'utf8');
      expect(out).toContain('> [!mastery]');
      expect(out).toContain('**Box:** 1');
    } finally {
      await cleanup();
    }
  });

  it('skips when no .md file for word', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const entry: WordEntry = {
        word: 'ghost',
        box: 1,
        status: 'learning',
        score: 0,
        last_practiced: '',
        next_review: '2026-04-01',
        sessions: 0,
        failures: [],
        best_sentences: [],
      };
      const store: MasteryStore = { version: 1, words: { ghost: entry } };
      await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');

      const { repaired, skipped } = await repairVault(config);
      expect(repaired).toBe(0);
      expect(skipped).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });
});
