import crypto from 'node:crypto';
import { ToolResult, VaultConfig, ok, err } from '../types.js';
import { readWordPage, writeWordPageAtomic, prependLineToSection, wordBoundaryRegex } from '../page-utils.js';

/**
 * Validate LLM-provided graduation sentence: non-empty, contains word, ≤200 chars.
 * Returns null if valid, or a short reason code for error messages.
 */
export function validateGraduationSentence(wordLower: string, sentence: string): string | null {
  if (!sentence || sentence.trim().length === 0) return 'empty';
  if (sentence.length > 200) return 'too_long';
  const regex = wordBoundaryRegex(wordLower);
  if (!regex.test(sentence)) return 'missing_word';
  return null;
}

export interface UpdatePageInput {
  word: string;
  best_sentence?: string;         // append to ### Best Sentences
  graduation_sentence?: string;   // write ## Graduation section (first time only)
  content_hash?: string;          // ALREADY_EDITED guard: MD5 of content when last read
}

/**
 * update_page — write agent-generated content back to a word .md page.
 *
 * Handles:
 * - Best Sentences: append to existing list (creates section if absent)
 * - Graduation: write ## Graduation section (no-op if already present)
 * - ALREADY_EDITED guard: if content_hash provided and page has changed, abort
 * - VAULT_ESCAPE: rejects paths outside vault root
 */
export async function updatePage(
  config: VaultConfig,
  input: UpdatePageInput,
): Promise<ToolResult<void>> {
  const pageResult = await readWordPage(config, input.word);
  if (!pageResult.ok) return { ok: false, error: pageResult.error };
  const { wordLower, mdPath, content } = pageResult.data;

  // ALREADY_EDITED guard
  if (input.content_hash) {
    const currentHash = md5(content);
    if (currentHash !== input.content_hash) {
      return err({ code: 'ALREADY_EDITED', message: `Page '${wordLower}.md' was modified externally. Skipped to avoid overwrite.`, word: wordLower });
    }
  }

  let updated = content;

  // Append Best Sentence
  if (input.best_sentence) {
    const today = new Date().toISOString().slice(0, 10);
    const line = `- ${today}: "${input.best_sentence}"`;
    updated = prependLineToSection(updated, '### Best Sentences', line);
  }

  // Write ## Graduation section (idempotent)
  if (input.graduation_sentence && !/^## Graduation/m.test(updated)) {
    const bad = validateGraduationSentence(wordLower, input.graduation_sentence);
    if (bad) {
      return err({
        code: 'INVALID_GRADUATION',
        message: `Invalid graduation sentence (${bad}). Provide a non-empty sentence under 200 characters that contains the word.`,
        word: wordLower,
      });
    }
    const today = new Date().toISOString().slice(0, 10);
    updated += `\n\n## Graduation\n> On ${today} you mastered this word. "${input.graduation_sentence}"\n`;
  }

  if (updated === content) return ok(undefined);  // nothing changed

  // Write atomically
  return writeWordPageAtomic(mdPath, updated, `wh-update-${wordLower}`);
}

/** MD5 hash of a string — used for ALREADY_EDITED guard. */
export function md5(content: string): string {
  return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}
