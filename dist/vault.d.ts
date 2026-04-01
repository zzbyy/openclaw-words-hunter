import { ToolResult, ToolError, VaultConfig, MasteryStore, NudgeQueue } from './types.js';
export declare function loadVaultConfig(vaultRoot: string): Promise<ToolResult<VaultConfig>>;
/**
 * Validate that a word string from LLM tool input is safe to use as a file
 * name and mastery.json key. Rejects path traversal, empty strings, and
 * excessively long values before any I/O occurs.
 */
export declare function validateWord(word: string): ToolError | null;
export declare function wordsFolderPath(config: VaultConfig): string;
export declare function masteryJsonPath(config: VaultConfig): string;
export declare function nudgeQueuePath(config: VaultConfig): string;
/** Returns VAULT_ESCAPE if resolvedPath is not inside vaultRoot. */
export declare function assertInVault(vaultRoot: string, resolvedPath: string): ToolError | null;
export declare function readMasteryStore(jsonPath: string): Promise<ToolResult<MasteryStore>>;
export declare function writeMasteryStore(jsonPath: string, store: MasteryStore): Promise<ToolResult<void>>;
export declare function readNudgeQueue(queuePath: string): Promise<NudgeQueue>;
export declare function writeNudgeQueue(queuePath: string, queue: NudgeQueue): Promise<ToolResult<void>>;
//# sourceMappingURL=vault.d.ts.map