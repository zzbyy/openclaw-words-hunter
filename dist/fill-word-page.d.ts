/**
 * fill-word-page.ts
 *
 * Fills lookup-time template variables in a word page after Cambridge lookup.
 * Ported from WordPageUpdater.swift.
 *
 * Variables filled:
 *   {{syllables}}     — headword (Cambridge shows dot-separated syllables in .headword)
 *   {{pronunciation}} — "BrE /x/ · AmE /y/" or whichever is available
 *   {{meanings}}      — numbered sense blocks with grammar, patterns, examples
 *   {{when-to-use}}   — register/domain labels per sense
 *   {{word-family}}   — related word forms from the Cambridge word family box
 *   {{see-also}}      — [[wikilinks]] for known vault words appearing in definitions
 *
 * Safety: aborts silently if the file is gone or has no lookup-time vars.
 * Writes atomically via tmp file + rename.
 */
import type { CambridgeContent } from './cambridge-lookup.js';
import type { VaultConfig } from './types.js';
/**
 * Fill template variables in a word's .md page with Cambridge lookup data.
 * Returns 'ok' | 'not_found' | 'no_vars' | 'write_failed'.
 */
export declare function fillWordPage(config: VaultConfig, word: string, content: CambridgeContent): Promise<'ok' | 'no_vars' | 'write_failed'>;
//# sourceMappingURL=fill-word-page.d.ts.map