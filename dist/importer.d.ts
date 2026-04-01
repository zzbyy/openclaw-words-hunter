/**
 * One-time importer: on plugin load, if mastery.json is absent or a word page
 * exists in the words folder with no mastery.json entry, create an entry at
 * box=1, status=learning, so the word shows up in scan_vault results.
 *
 * Runs at startup. Safe to run repeatedly — only fills missing entries.
 */
import { VaultConfig } from './types.js';
export declare function importUntracked(config: VaultConfig): Promise<{
    imported: string[];
}>;
//# sourceMappingURL=importer.d.ts.map