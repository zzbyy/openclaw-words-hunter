import { ToolResult, VaultConfig, WordEntry, ok, err } from '../types.js';
import { masteryJsonPath, readMasteryStore } from '../vault.js';
import { readWordPage } from '../page-utils.js';

export interface LoadWordResult {
  word: string;
  content: string;            // raw .md file content
  mastery: WordEntry | null;  // null = word exists but has never been practiced
}

/**
 * load_word — load a word page + its mastery state.
 *
 * Returns FILE_NOT_FOUND if the .md page doesn't exist.
 * Returns mastery=null if the word has no mastery.json entry (new word).
 */
export async function loadWord(
  config: VaultConfig,
  word: string,
): Promise<ToolResult<LoadWordResult>> {
  const pageResult = await readWordPage(config, word);
  if (!pageResult.ok) {
    if (pageResult.error.code === 'WRITE_FAILED') {
      return err({ code: 'FILE_NOT_FOUND', message: pageResult.error.message, word: word.toLowerCase() });
    }
    return pageResult;
  }

  const { wordLower, content } = pageResult.data;

  // Read mastery state
  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return storeResult;
  const mastery = storeResult.data.words[wordLower] ?? null;

  return ok({ word: wordLower, content, mastery });
}
