/**
 * Shared discovery file for bidirectional config between the Words Hunter
 * macOS app and the OpenClaw plugin.
 *
 * Path: ~/Library/Application Support/WordsHunter/discovery.json
 *
 * Both the Swift app and this plugin read and write the same file.
 * Atomic temp+rename on both sides prevents partial reads.
 * Last writer wins — single-user desktop tool, no locking needed.
 */
export interface DiscoveryConfig {
    version: number;
    words_directory: string;
    words_folder: string;
    updated_by: string;
    updated_at: string;
}
export declare const DISCOVERY_PATH: string;
/**
 * Read the shared discovery file.
 * Returns null if the file is missing, invalid, or the directory no longer exists on disk.
 */
export declare function readDiscovery(): Promise<DiscoveryConfig | null>;
/**
 * Write the shared discovery file atomically.
 * Called when the plugin resolves a vault path so the macOS app can find it.
 */
export declare function writeDiscovery(wordsDirectory: string, wordsFolder: string): Promise<void>;
//# sourceMappingURL=discovery.d.ts.map