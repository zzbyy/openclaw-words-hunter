import { describe, it, expect } from 'vitest';
import { updatePage, validateGraduationSentence } from '../src/tools/update-page.js';
import type { VaultConfig } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURES = join(import.meta.dirname, 'fixtures');

async function makeVault(): Promise<{ vaultPath: string; config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-grad-test-'));
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
  return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

describe('validateGraduationSentence', () => {
  it('accepts valid sentence with word', () => {
    expect(validateGraduationSentence('posit', 'Scientists posit that dark matter exists.')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validateGraduationSentence('posit', '')).toBe('empty');
    expect(validateGraduationSentence('posit', '   ')).toBe('empty');
  });

  it('rejects when word missing', () => {
    expect(validateGraduationSentence('posit', 'Dark matter is interesting.')).toBe('missing_word');
  });

  it('rejects over 200 chars', () => {
    const long = 'x'.repeat(201);
    expect(validateGraduationSentence('posit', `posit ${long}`)).toBe('too_long');
  });

  it('word boundary: posit inside positive does not count', () => {
    expect(validateGraduationSentence('posit', 'The positive outcome was good.')).toBe('missing_word');
  });
});

describe('updatePage graduation guard', () => {
  it('INVALID_GRADUATION when sentence empty', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const initial = readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8');
      await writeFile(join(vaultPath, 'Words', 'posit.md'), initial, 'utf8');

      const result = await updatePage(config, { word: 'posit', graduation_sentence: '   ' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_GRADUATION');
    } finally {
      await cleanup();
    }
  });

  it('INVALID_GRADUATION when over 200 chars', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const initial = readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8');
      await writeFile(join(vaultPath, 'Words', 'posit.md'), initial, 'utf8');

      const long = 'posit ' + 'y'.repeat(200);
      const result = await updatePage(config, { word: 'posit', graduation_sentence: long });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_GRADUATION');
    } finally {
      await cleanup();
    }
  });

  it('valid graduation still writes section', async () => {
    const { vaultPath, config, cleanup } = await makeVault();
    try {
      const initial = readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8');
      await writeFile(join(vaultPath, 'Words', 'posit.md'), initial, 'utf8');

      const result = await updatePage(config, { word: 'posit', graduation_sentence: 'I posit we ship today.' });
      expect(result.ok).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
