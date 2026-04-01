import { ToolResult, VaultConfig } from '../types.js';
export interface RecordSightingInput {
    word: string;
    sentence: string;
    channel?: string;
}
/**
 * record_sighting — append a sighting to ## Sightings in the word page.
 *
 * Sightings are logged for visibility only — SRS score is still controlled
 * by explicit record_mastery calls. A duplicate sighting is benign.
 */
export declare function recordSighting(config: VaultConfig, input: RecordSightingInput): Promise<ToolResult<void>>;
//# sourceMappingURL=record-sighting.d.ts.map