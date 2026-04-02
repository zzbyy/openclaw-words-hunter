/**
 * One-time importer: on plugin load, if mastery.json is absent or a word page
 * exists in the words folder with no mastery.json entry, create an entry at
 * box=1, status=learning, so the word shows up in scan_vault results.
 *
 * Runs at startup. Safe to run repeatedly — only fills missing entries.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { VaultConfig, WordEntry, MasteryStore } from './types.js';
import { masteryJsonPath, wordsFolderPath, readMasteryStore, writeMasteryStore, withMasteryLock } from './vault.js';
import { todayString } from './srs/scheduler.js';

async function readFileHead(filePath: string, maxBytes: number): Promise<string> {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fh.close();
  }
}

/**
 * True if the file looks like a Words Hunter word page: not a template/MOC
 * (skip `_` prefix) and contains the standard > [!info] callout.
 */
export async function isWordPage(filePath: string): Promise<boolean> {
  const base = path.basename(filePath);
  if (base.startsWith('_')) return false;
  try {
    const head = await readFileHead(filePath, 400);
    return head.includes('> [!info]');
  } catch {
    return false;
  }
}

export async function importUntracked(config: VaultConfig): Promise<{ imported: string[] }> {
  const wordsDir = wordsFolderPath(config);
  const jsonPath = masteryJsonPath(config);

  return withMasteryLock(jsonPath, async () => {
    const storeResult = await readMasteryStore(jsonPath);
    if (!storeResult.ok) return { imported: [] };
    const store: MasteryStore = storeResult.data;

    let entries: string[];
    try {
      entries = await fs.readdir(wordsDir);
    } catch {
      return { imported: [] };
    }

    const mdFiles = entries.filter(f => f.endsWith('.md'));
    const imported: string[] = [];

    for (const file of mdFiles) {
      const fullPath = path.join(wordsDir, file);
      if (!(await isWordPage(fullPath))) continue;

      const word = path.basename(file, '.md').toLowerCase();
      if (store.words[word]) continue;

      const today = todayString();
      const entry: WordEntry = {
        word,
        box: 1,
        status: 'learning',
        score: 0,
        last_practiced: '',
        next_review: today,
        sessions: 0,
        failures: [],
        best_sentences: [],
      };
      store.words[word] = entry;
      imported.push(word);
    }

    if (imported.length > 0) {
      await writeMasteryStore(jsonPath, store);
    }

    return { imported };
  });
}
