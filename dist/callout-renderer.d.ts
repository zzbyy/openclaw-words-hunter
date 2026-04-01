import type { WordEntry } from './types.js';
/**
 * callout-renderer — generates the > [!mastery] callout block
 * from a WordEntry. This is a pure function with no I/O.
 *
 * The callout is a derived display view. It is always regenerated
 * from mastery.json — never parsed back into state.
 */
export declare function renderMasteryCallout(entry: WordEntry): string;
/**
 * Replace the existing > [!mastery] callout block in page content,
 * or append it after the > [!info] header if none exists yet.
 *
 * Returns the updated page content.
 */
export declare function upsertCallout(pageContent: string, entry: WordEntry): string;
//# sourceMappingURL=callout-renderer.d.ts.map