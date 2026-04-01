import { ToolResult, VaultConfig, WordEntry } from '../types.js';
export interface RecordMasteryInput {
    word: string;
    score: number;
    best_sentence?: string;
    failure_note?: string;
}
export interface RecordMasteryResult {
    word: string;
    box: WordEntry['box'];
    status: WordEntry['status'];
    next_review: string;
    graduated: boolean;
}
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
export declare function recordMastery(config: VaultConfig, input: RecordMasteryInput): Promise<ToolResult<RecordMasteryResult>>;
//# sourceMappingURL=record-mastery.d.ts.map