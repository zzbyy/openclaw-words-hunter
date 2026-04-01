import { ToolResult, VaultConfig, VaultSummary } from '../types.js';
/**
 * vault_summary — aggregate stats across the vault.
 *
 * Reads mastery.json only (fast). Used for weekly recap and on-demand /vocab command.
 */
export declare function vaultSummary(config: VaultConfig, today?: string): Promise<ToolResult<VaultSummary>>;
//# sourceMappingURL=vault-summary.d.ts.map