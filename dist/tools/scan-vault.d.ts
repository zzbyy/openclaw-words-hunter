import { ToolResult, VaultConfig, ScannedWord, ScanFilter } from '../types.js';
/**
 * scan_vault — list words matching a filter.
 *
 * Reads from mastery.json (O(1), not O(N .md files)).
 * filter=new: words with .md files NOT yet in mastery.json.
 * filter=due: words in mastery.json where next_review <= today.
 * filter=all: all words in mastery.json.
 */
export declare function scanVault(config: VaultConfig, filter: ScanFilter, today?: string): Promise<ToolResult<ScannedWord[]>>;
//# sourceMappingURL=scan-vault.d.ts.map