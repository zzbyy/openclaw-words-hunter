#!/usr/bin/env node
/**
 * CLI: regenerate `> [!mastery]` callouts in word .md pages from mastery.json.
 *
 * Usage: words-hunter repair [--vault <path>]
 * Default `--vault` is the current working directory (must contain `.wordshunter/config.json`).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VaultConfig } from '../types.js';
import { loadVaultConfig, wordsFolderPath, masteryJsonPath, readMasteryStore, assertInVault } from '../vault.js';
import { upsertCallout } from '../callout-renderer.js';
import { writeWordPageAtomic } from '../page-utils.js';

export async function repairVault(config: VaultConfig): Promise<{ repaired: number; skipped: number }> {
  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) {
    throw new Error(storeResult.error.message);
  }
  const store = storeResult.data;

  const wordsDir = wordsFolderPath(config);
  let repaired = 0;
  let skipped = 0;

  for (const [word, entry] of Object.entries(store.words)) {
    const mdPath = path.join(wordsDir, `${word}.md`);
    const esc = assertInVault(config.vault_path, mdPath);
    if (esc) {
      skipped++;
      continue;
    }
    let content: string;
    try {
      content = await fs.readFile(mdPath, 'utf8');
    } catch {
      skipped++;
      continue;
    }
    const updated = upsertCallout(content, entry);
    if (updated === content) {
      skipped++;
      continue;
    }
    const writeResult = await writeWordPageAtomic(mdPath, updated, `wh-repair-${word}`);
    if (writeResult.ok) {
      repaired++;
    } else {
      skipped++;
    }
  }

  return { repaired, skipped };
}

function parseArgs(argv: string[]): { vaultRoot: string; help: boolean } {
  let vaultRoot = process.cwd();
  let help = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      help = true;
    } else if (a === '--vault' && argv[i + 1]) {
      vaultRoot = argv[++i]!;
    }
  }
  return { vaultRoot, help };
}

async function main(): Promise<void> {
  const { vaultRoot, help } = parseArgs(process.argv);
  if (help) {
    console.log(
      'Usage: words-hunter repair [--vault <path>]\n' +
        '  Regenerates > [!mastery] callouts from .wordshunter/mastery.json.\n' +
        '  Default vault directory is the current working directory.',
    );
    process.exit(0);
  }

  const cfgResult = await loadVaultConfig(vaultRoot);
  if (!cfgResult.ok) {
    console.error(cfgResult.error.message);
    process.exit(1);
  }

  const { repaired, skipped } = await repairVault(cfgResult.data);
  console.log(`Repaired ${repaired} word page(s). Skipped ${skipped}.`);
}

const isCli =
  typeof process.argv[1] === 'string' &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isCli) {
  void main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
