/**
 * Leitner SRS scheduler — 5 boxes with fixed intervals.
 * Pure functions, no I/O. Exhaustively testable.
 */
// Box intervals in days
export const BOX_INTERVALS = {
    1: 1,
    2: 3,
    3: 7,
    4: 14,
    5: 30,
};
export const MASTERY_THRESHOLD = 85; // score >= 85 = success
export function todayString() {
    return new Date().toISOString().slice(0, 10);
}
export function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/** Clamp box to valid range 1–5. */
function clampBox(n) {
    return Math.max(1, Math.min(5, n));
}
export function deriveStatus(box) {
    if (box <= 2)
        return 'learning';
    if (box === 3)
        return 'reviewing';
    return 'mastered';
}
/**
 * Advance the SRS schedule after a session.
 *
 * @param currentBox  The word's current Leitner box (1–5).
 * @param score       Composite score 0–100.
 * @param today       YYYY-MM-DD string for "today" (injected for testability).
 * @returns           New box, status, next_review date, and graduation flag.
 */
export function advance(currentBox, score, today = todayString()) {
    const success = score >= MASTERY_THRESHOLD;
    const prevStatus = deriveStatus(currentBox);
    const newBox = success
        ? clampBox(currentBox + 1)
        : clampBox(currentBox - 1);
    const newStatus = deriveStatus(newBox);
    const interval = BOX_INTERVALS[newBox];
    const next_review = addDays(today, interval);
    // Graduated = just reached mastered status for the first time in this session
    const graduated = prevStatus !== 'mastered' && newStatus === 'mastered';
    return { box: newBox, status: newStatus, next_review, graduated };
}
/** Returns true if the word is due for review on or before today. */
export function isDue(entry, today = todayString()) {
    return entry.next_review <= today;
}
//# sourceMappingURL=scheduler.js.map