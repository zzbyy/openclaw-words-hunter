import fs from 'node:fs/promises';
import path from 'node:path';
import { VaultConfig, MasteryStore, WordEntry } from './types.js';
import { masteryJsonPath, wordsFolderPath, readMasteryStore } from './vault.js';
import { writeTextFileAtomic } from './io-utils.js';
import { isDue, todayString } from './srs/scheduler.js';

/**
 * Regenerate __index__.md at vault root — a glanceable vocabulary dashboard.
 *
 * Format: Obsidian callout with emoji stats + status-grouped word lists.
 * Called after record_mastery, create_word, and plugin startup.
 * Failures are swallowed (non-critical).
 */
export async function regenerateWordIndex(config: VaultConfig): Promise<void> {
  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return;

  const store = storeResult.data;
  const wordsDir = wordsFolderPath(config);

  // Only include words whose .md page exists on disk
  let existingFiles: Set<string>;
  try {
    const files = await fs.readdir(wordsDir);
    existingFiles = new Set(
      files.filter(f => f.endsWith('.md')).map(f => f.toLowerCase()),
    );
  } catch {
    existingFiles = new Set();
  }

  const today = todayString();
  const mastered: string[] = [];
  const reviewing: string[] = [];
  const learning: string[] = [];
  let dueCount = 0;

  for (const entry of Object.values(store.words)) {
    if (!existingFiles.has(`${entry.word.toLowerCase()}.md`)) continue;

    const display = entry.word;
    if (entry.status === 'mastered') mastered.push(display);
    else if (entry.status === 'reviewing') reviewing.push(display);
    else learning.push(display);

    if (isDue(entry, today)) dueCount++;
  }

  // Second pass: words with .md pages but no mastery entry (captured by app, not yet imported)
  const trackedWords = new Set(Object.keys(store.words));
  for (const file of existingFiles) {
    const stem = file.replace(/\.md$/, '');
    if (!trackedWords.has(stem)) {
      learning.push(stem);
    }
  }

  // Sort each group alphabetically
  mastered.sort();
  reviewing.sort();
  learning.sort();

  const total = mastered.length + reviewing.length + learning.length;
  const lines: string[] = [];

  lines.push('> [!summary] 📚 Vocabulary Dashboard');
  lines.push(`> **${total}** words · ✅ **${mastered.length}** mastered · 🔄 **${reviewing.length}** reviewing · 🌱 **${learning.length}** learning · 📋 **${dueCount}** due today`);
  lines.push('');

  if (mastered.length > 0) {
    lines.push(`## ✅ Mastered (${mastered.length})`);
    lines.push(mastered.map(w => `[[${w}]]`).join(' · '));
    lines.push('');
  }

  if (reviewing.length > 0) {
    lines.push(`## 🔄 Reviewing (${reviewing.length})`);
    lines.push(reviewing.map(w => `[[${w}]]`).join(' · '));
    lines.push('');
  }

  if (learning.length > 0) {
    lines.push(`## 🌱 Learning (${learning.length})`);
    lines.push(learning.map(w => `[[${w}]]`).join(' · '));
    lines.push('');
  }

  const indexPath = path.join(config.vault_path, '__index__.md');
  await writeTextFileAtomic(indexPath, lines.join('\n'), 'wh-index');
}
