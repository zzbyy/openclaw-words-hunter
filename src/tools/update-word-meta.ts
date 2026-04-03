import { ToolResult, VaultConfig, WordEntry, ok, err } from '../types.js';
import {
  masteryJsonPath,
  readMasteryStore,
  writeMasteryStore,
  validateWord,
  withMasteryLock,
} from '../vault.js';

export interface UpdateWordMetaInput {
  word: string;
  coaching_mode?: 'silent' | 'inline';
  synonyms?: string[];   // replaced when present; absent = no change
}

export interface UpdateWordMetaResult {
  word: string;
  coaching_mode: WordEntry['coaching_mode'];
  synonyms: string[];
}

export async function updateWordMeta(
  config: VaultConfig,
  input: UpdateWordMetaInput,
): Promise<ToolResult<UpdateWordMetaResult>> {
  const wordErr = validateWord(input.word);
  if (wordErr) return { ok: false, error: wordErr };

  const wordLower = input.word.toLowerCase();
  const jsonPath = masteryJsonPath(config);

  return withMasteryLock(jsonPath, async () => {
    const storeResult = await readMasteryStore(jsonPath);
    if (!storeResult.ok) return storeResult;
    const store = storeResult.data;

    const existing = store.words[wordLower];
    if (!existing) {
      return err({ code: 'FILE_NOT_FOUND', message: `Word not found: ${wordLower}`, word: wordLower });
    }

    const patched: WordEntry = { ...existing };
    if (input.coaching_mode !== undefined) {
      patched.coaching_mode = input.coaching_mode;
    }
    if (input.synonyms !== undefined) {
      patched.synonyms = [...new Set(input.synonyms.map(s => s.toLowerCase().trim()))].slice(0, 5);
    }
    store.words[wordLower] = patched;

    const writeResult = await writeMasteryStore(jsonPath, store);
    if (!writeResult.ok) return writeResult;

    const updated = store.words[wordLower]!;
    return ok({ word: wordLower, coaching_mode: updated.coaching_mode, synonyms: updated.synonyms ?? [] });
  });
}
