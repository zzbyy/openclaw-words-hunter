import { describe, it, expect } from 'vitest';
import { recordMastery } from '../src/tools/record-mastery.js';
import type { VaultConfig, MasteryStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURES = join(import.meta.dirname, 'fixtures');

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-lock-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

describe('mastery.json lock', () => {
  it('concurrent record_mastery for different words — both persist', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const mdPosit = readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8');
      await writeFile(join(vaultPath, 'Words', 'posit.md'), mdPosit, 'utf8');
      await writeFile(join(vaultPath, 'Words', 'alpha.md'), mdPosit.replace(/posit/g, 'alpha'), 'utf8');

      const [a, b] = await Promise.all([
        recordMastery(config, { word: 'posit', score: 88 }),
        recordMastery(config, { word: 'alpha', score: 90 }),
      ]);

      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);

      const raw = await readFile(join(vaultPath, '.wordshunter', 'mastery.json'), 'utf8');
      const store: MasteryStore = JSON.parse(raw);
      expect(store.words['posit']).toBeDefined();
      expect(store.words['alpha']).toBeDefined();
      expect(store.words['posit'].sessions).toBe(1);
      expect(store.words['alpha'].sessions).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
