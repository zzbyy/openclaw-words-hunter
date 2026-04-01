/**
 * Leitner SRS scheduler — 5 boxes with fixed intervals.
 * Pure functions, no I/O. Exhaustively testable.
 */
import type { WordEntry } from '../types.js';
export declare const BOX_INTERVALS: Record<1 | 2 | 3 | 4 | 5, number>;
export declare const MASTERY_THRESHOLD = 85;
export declare function todayString(): string;
export declare function addDays(dateStr: string, days: number): string;
export declare function deriveStatus(box: 1 | 2 | 3 | 4 | 5): WordEntry['status'];
export interface ScheduleResult {
    box: 1 | 2 | 3 | 4 | 5;
    status: WordEntry['status'];
    next_review: string;
    graduated: boolean;
}
/**
 * Advance the SRS schedule after a session.
 *
 * @param currentBox  The word's current Leitner box (1–5).
 * @param score       Composite score 0–100.
 * @param today       YYYY-MM-DD string for "today" (injected for testability).
 * @returns           New box, status, next_review date, and graduation flag.
 */
export declare function advance(currentBox: 1 | 2 | 3 | 4 | 5, score: number, today?: string): ScheduleResult;
/** Returns true if the word is due for review on or before today. */
export declare function isDue(entry: WordEntry, today?: string): boolean;
//# sourceMappingURL=scheduler.d.ts.map