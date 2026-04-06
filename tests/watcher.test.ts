import { describe, it, expect } from 'vitest';
import { enqueueNudge, registerWord } from '../src/watcher.js';
import type { VaultConfig, MasteryStore } from '../src/types.js';
import { readNudgeQueue, masteryJsonPath, readMasteryStore } from '../src/vault.js';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-watcher-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

describe('watcher queueing', () => {
  it('preserves both nudges when enqueueing concurrently', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await Promise.all([
        enqueueNudge(config, 'posit', new Date('2026-04-03T10:00:00.000Z')),
        enqueueNudge(config, 'ephemeral', new Date('2026-04-03T10:00:00.000Z')),
      ]);

      const queue = await readNudgeQueue(join(vaultPath, '.wordshunter', 'pending-nudges.json'));
      expect(queue.nudges).toHaveLength(2);
      expect(queue.nudges.map((nudge) => nudge.word).sort()).toEqual(['ephemeral', 'posit']);
    } finally {
      await cleanup();
    }
  });
});

describe('registerWord', () => {
  it('creates mastery.json entry for new word', async () => {
    const { config, cleanup } = await makeVault();
    try {
      await registerWord(config, 'posit');

      const store = await readMasteryStore(masteryJsonPath(config));
      expect(store.ok).toBe(true);
      if (store.ok) {
        expect(store.data.words['posit']).toBeDefined();
        expect(store.data.words['posit'].box).toBe(1);
        expect(store.data.words['posit'].status).toBe('learning');
      }
    } finally {
      await cleanup();
    }
  });

  it('is idempotent — does not overwrite existing entry', async () => {
    const { config, cleanup } = await makeVault();
    try {
      await registerWord(config, 'posit');
      // Simulate practice advancing the word
      const jsonPath = masteryJsonPath(config);
      const store = await readMasteryStore(jsonPath);
      if (store.ok) {
        store.data.words['posit'].box = 3;
        const { writeMasteryStore } = await import('../src/vault.js');
        await writeMasteryStore(jsonPath, store.data);
      }

      // Re-register should not reset box
      await registerWord(config, 'posit');
      const after = await readMasteryStore(jsonPath);
      expect(after.ok).toBe(true);
      if (after.ok) {
        expect(after.data.words['posit'].box).toBe(3);
      }
    } finally {
      await cleanup();
    }
  });
});
