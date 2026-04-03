import { describe, it, expect } from 'vitest';
import { enqueueNudge } from '../src/watcher.js';
import type { VaultConfig } from '../src/types.js';
import { readNudgeQueue } from '../src/vault.js';
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
