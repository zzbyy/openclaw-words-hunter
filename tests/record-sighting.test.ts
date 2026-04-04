import { describe, it, expect } from 'vitest';
import { recordSighting } from '../src/tools/record-sighting.js';
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

async function readSightings(vaultPath: string): Promise<SightingsStore> {
  const raw = await readFile(join(vaultPath, '.wordshunter', 'sightings.json'), 'utf8');
  return JSON.parse(raw);
}

describe('record_sighting', () => {
  it('writes sighting to sightings.json', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSighting(config, { word: 'posit', sentence: 'I posit that this works.', channel: 'Telegram' });
      const store = await readSightings(vaultPath);
      const today = new Date().toISOString().slice(0, 10);
      expect(store.days[today]?.['posit']).toHaveLength(1);
      expect(store.days[today]['posit'][0].sentence).toBe('I posit that this works.');
      expect(store.days[today]['posit'][0].channel).toBe('Telegram');
    } finally {
      await cleanup();
    }
  });

  it('appends multiple sightings under same day and word', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSighting(config, { word: 'posit', sentence: 'First use.' });
      await recordSighting(config, { word: 'posit', sentence: 'Second use.' });
      const store = await readSightings(vaultPath);
      const today = new Date().toISOString().slice(0, 10);
      expect(store.days[today]?.['posit']).toHaveLength(2);
      expect(store.days[today]['posit'][0].sentence).toBe('First use.');
      expect(store.days[today]['posit'][1].sentence).toBe('Second use.');
    } finally {
      await cleanup();
    }
  });

  it('stores sightings for different words separately', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSighting(config, { word: 'posit', sentence: 'I posit.' });
      await recordSighting(config, { word: 'ephemeral', sentence: 'Ephemeral fame.' });
      const store = await readSightings(vaultPath);
      const today = new Date().toISOString().slice(0, 10);
      expect(store.days[today]?.['posit']).toHaveLength(1);
      expect(store.days[today]?.['ephemeral']).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('sighting without channel omits channel field', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      await recordSighting(config, { word: 'posit', sentence: 'No channel.' });
      const store = await readSightings(vaultPath);
      const today = new Date().toISOString().slice(0, 10);
      expect(store.days[today]['posit'][0].channel).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});
