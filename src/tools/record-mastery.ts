import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolResult, ToolError, VaultConfig, WordEntry, BestSentence, ok, err } from '../types.js';
import {
  masteryJsonPath,
  readMasteryStore,
  writeMasteryStore,
  validateWord,
  withMasteryLock,
} from '../vault.js';
import { advance, todayString, MASTERY_THRESHOLD } from '../srs/scheduler.js';
import { upsertCallout } from '../callout-renderer.js';
import { readWordPage, writeWordPageAtomic, prependLineToSection, insertSectionAfterCallout } from '../page-utils.js';

export interface RecordMasteryInput {
  word: string;
  score: number;            // 0–100 composite score
  best_sentence?: string;   // optional sentence to save if score >= mastery threshold
  failure_note?: string;    // optional confusion note to append
}

export interface RecordMasteryResult {
  word: string;
  box: WordEntry['box'];
  status: WordEntry['status'];
  next_review: string;
  graduated: boolean;
}

type MasteryLockOutcome =
  | { ok: true; updatedEntry: WordEntry; currentBox: 1 | 2 | 3 | 4 | 5; graduated: boolean }
  | { ok: false; error: ToolError };

/**
 * record_mastery — record a practice session result.
 *
 * 1. Validates score (NaN_SCORE if invalid).
 * 2. Reads mastery.json.
 * 3. Advances SRS schedule.
 * 4. Appends to ### History in the .md page.
 * 5. Writes mastery.json atomically.
 * 6. Regenerates > [!mastery] callout in .md page.
 * 7. Returns new schedule + graduated flag.
 */
export async function recordMastery(
  config: VaultConfig,
  input: RecordMasteryInput,
): Promise<ToolResult<RecordMasteryResult>> {
  // Validate inputs
  const wordErr = validateWord(input.word);
  if (wordErr) return { ok: false, error: wordErr };

  if (typeof input.score !== 'number' || !isFinite(input.score)) {
    return err({ code: 'NaN_SCORE', message: `Invalid score: ${input.score}`, field: 'score' });
  }
  const score = Math.max(0, Math.min(100, input.score));

  const wordLower = input.word.toLowerCase();
  const jsonPath = masteryJsonPath(config);
  const today = todayString();

  const masteryOutcome = await withMasteryLock(jsonPath, async (): Promise<MasteryLockOutcome> => {
    const storeResult = await readMasteryStore(jsonPath);
    if (!storeResult.ok) return { ok: false, error: storeResult.error };

    const store = storeResult.data;
    const existing = store.words[wordLower];
    const currentBox: 1 | 2 | 3 | 4 | 5 = existing?.box ?? 1;

    const { box, status, next_review, graduated } = advance(currentBox, score, today);

    const bestSentences: BestSentence[] = existing?.best_sentences ?? [];
    if (input.best_sentence && score >= MASTERY_THRESHOLD) {
      bestSentences.push({ text: input.best_sentence, date: today, score });
    }

    const failures: string[] = existing?.failures ?? [];
    if (input.failure_note && score < MASTERY_THRESHOLD) {
      failures.push(input.failure_note);
    }

    const updatedEntry: WordEntry = {
      word: wordLower,
      box,
      status,
      score,
      last_practiced: today,
      next_review,
      sessions: (existing?.sessions ?? 0) + 1,
      failures,
      best_sentences: bestSentences,
    };
    store.words[wordLower] = updatedEntry;

    const writeResult = await writeMasteryStore(jsonPath, store);
    if (!writeResult.ok) return { ok: false, error: writeResult.error };

    return { ok: true, updatedEntry, currentBox, graduated };
  });

  if (!masteryOutcome.ok) return { ok: false, error: masteryOutcome.error };

  const { updatedEntry, currentBox, graduated } = masteryOutcome;
  const { box, status, next_review } = updatedEntry;

  // Update .md page: append History + regenerate callout
  try {
    const pageResult = await readWordPage(config, wordLower);
    if (!pageResult.ok) throw new Error(pageResult.error.message);
    const { mdPath, content: pageContent } = pageResult.data;
    let content = pageContent;

    // Append history line (sentences = 1 if a sentence was saved this session, 0 otherwise)
    const sentencesThisSession = (input.best_sentence && score >= MASTERY_THRESHOLD) ? 1 : 0;
    const historyLine = `- ${today}: box ${currentBox}→${box}, score ${score}, sentences: ${sentencesThisSession}`;
    if (/^### History\n/m.test(content)) {
      content = prependLineToSection(content, '### History', historyLine);
    } else {
      if (/^> \[!mastery\]/m.test(content)) {
        content = insertSectionAfterCallout(content, 'mastery', '### History', historyLine);
      } else {
        content += `\n\n### History\n${historyLine}\n`;
      }
    }

    // Regenerate callout
    content = upsertCallout(content, updatedEntry);

    // Write .md atomically
    const writeResult = await writeWordPageAtomic(mdPath, content, `wh-mastery-${wordLower}`);
    if (!writeResult.ok) throw new Error(writeResult.error.message);
  } catch {
    // .md write failure is non-fatal — mastery.json is already saved
    // The callout is a display view; a failed update won't corrupt state.
    // words-hunter repair can regenerate it.
  }

  return ok({ word: wordLower, box, status, next_review, graduated });
}
