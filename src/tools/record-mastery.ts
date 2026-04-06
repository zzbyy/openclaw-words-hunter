import { ToolResult, ToolError, VaultConfig, WordEntry, BestSentence, ok, err } from '../types.js';
import {
  masteryJsonPath,
  readMasteryStore,
  writeMasteryStore,
  validateWord,
  withMasteryLock,
} from '../vault.js';
import { advance, todayString, MASTERY_THRESHOLD } from '../srs/scheduler.js';

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
  | { ok: true; updatedEntry: WordEntry; graduated: boolean }
  | { ok: false; error: ToolError };

/**
 * record_mastery — record a practice session result.
 *
 * 1. Validates score (NaN_SCORE if invalid).
 * 2. Reads mastery.json.
 * 3. Advances SRS schedule.
 * 4. Writes mastery.json atomically.
 * 5. Returns new schedule + graduated flag.
 *
 * mastery.json is the single source of truth. Word .md pages are not modified.
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
      coaching_mode: existing?.coaching_mode,
      synonyms: existing?.synonyms,
    };
    store.words[wordLower] = updatedEntry;

    const writeResult = await writeMasteryStore(jsonPath, store);
    if (!writeResult.ok) return { ok: false, error: writeResult.error };

    return { ok: true, updatedEntry, graduated };
  });

  if (!masteryOutcome.ok) return { ok: false, error: masteryOutcome.error };

  const { updatedEntry, graduated } = masteryOutcome;
  const { box, status, next_review } = updatedEntry;

  return ok({ word: wordLower, box, status, next_review, graduated });
}
