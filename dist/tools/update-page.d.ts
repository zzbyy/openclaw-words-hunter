import { ToolResult, VaultConfig } from '../types.js';
export interface UpdatePageInput {
    word: string;
    best_sentence?: string;
    graduation_sentence?: string;
    content_hash?: string;
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
export declare function updatePage(config: VaultConfig, input: UpdatePageInput): Promise<ToolResult<void>>;
/** MD5 hash of a string — used for ALREADY_EDITED guard. */
export declare function md5(content: string): string;
//# sourceMappingURL=update-page.d.ts.map