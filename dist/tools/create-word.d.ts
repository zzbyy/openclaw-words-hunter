import { ToolResult, VaultConfig } from '../types.js';
export type LookupStatus = 'ok' | 'not_found' | 'blocked' | 'failed';
/**
 * create_word — create a new word page, register it for study, and auto-fill
 * dictionary data from Cambridge Dictionary.
 *
 * The page is created and returned immediately. Cambridge lookup runs in the
 * same call (best-effort, 8s timeout). On lookup failure the page is still
 * created with template placeholders — the agent can fill them later via
 * the Enrich step in SKILL.md.
 */
export declare function createWord(config: VaultConfig, params: {
    word: string;
}): Promise<ToolResult<{
    word: string;
    path: string;
    lookup: LookupStatus;
}>>;
//# sourceMappingURL=create-word.d.ts.map