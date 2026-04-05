import { describe, it, expect } from 'vitest';
import { recordSighting, recordSightingBatch } from '../src/tools/record-sighting.js';
import type { VaultConfig, SightingsStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-test-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

async function readStore(vaultPath: string): Promise<SightingsStore> {
  const raw = await readFile(join(vaultPath, '.wordshunter', 'sightings.json'), 'utf8');
  return JSON.parse(raw);
}

const TODAY = new Date().toISOString().slice(0, 10);

describe('recordSightingBatch', () => {
  it('writes one event with multiple words', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSightingBatch(config, {
        hits: [
          { word: 'deliberate', sentence: 'The deliberate attempt.' },
          { word: 'suppress', sentence: 'The deliberate attempt.' },
        ],
        channel: 'telegram',
      });
      const store = await readStore(vaultPath);
      expect(store.version).toBe(2);
      expect(store.days[TODAY]).toHaveLength(1);
      expect(store.days[TODAY][0].words).toEqual({
        deliberate: 'The deliberate attempt.',
        suppress: 'The deliberate attempt.',
      });
      expect(store.days[TODAY][0].channel).toBe('telegram');
      expect(store.days[TODAY][0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    } finally {
      await cleanup();
    }
  });

  it('appends multiple events on same day', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSightingBatch(config, { hits: [{ word: 'posit', sentence: 'First.' }] });
      await recordSightingBatch(config, { hits: [{ word: 'posit', sentence: 'Second.' }] });
      const store = await readStore(vaultPath);
      expect(store.days[TODAY]).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it('empty hits → no write', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSightingBatch(config, { hits: [] });
      // sightings.json should not exist
      await expect(readFile(join(vaultPath, '.wordshunter', 'sightings.json'), 'utf8')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('auto-prunes days older than 30 days', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      // Write a sighting first so the file exists
      await recordSightingBatch(config, { hits: [{ word: 'posit', sentence: 'Today.' }] });

      // Manually inject an old day
      const store = await readStore(vaultPath);
      store.days['2020-01-01'] = [{ timestamp: '2020-01-01T10:00', words: { old: 'Old sentence.' } }];
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(join(vaultPath, '.wordshunter', 'sightings.json'), JSON.stringify(store), 'utf8');

      // Write another sighting to trigger prune
      await recordSightingBatch(config, { hits: [{ word: 'posit', sentence: 'Trigger prune.' }] });
      const pruned = await readStore(vaultPath);
      expect(pruned.days['2020-01-01']).toBeUndefined();
      expect(pruned.days[TODAY]).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe('recordSighting (single-word wrapper)', () => {
  it('writes one event with one word', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSighting(config, { word: 'posit', sentence: 'I posit that.', channel: 'telegram' });
      const store = await readStore(vaultPath);
      expect(store.days[TODAY]).toHaveLength(1);
      expect(store.days[TODAY][0].words).toEqual({ posit: 'I posit that.' });
    } finally {
      await cleanup();
    }
  });
});
