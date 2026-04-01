import { VaultConfig } from '../types.js';
/**
 * sighting-hook — outgoing message hook for in-the-wild detection.
 *
 * Scans outgoing messages for captured words using word-boundary regex.
 * On match: calls record_sighting. Does NOT update SRS score (visibility only).
 * Only fires on user outgoing messages, not agent responses.
 */
export declare function onOutgoingMessage(config: VaultConfig, messageText: string, channelLabel?: string): Promise<void>;
//# sourceMappingURL=sighting-hook.d.ts.map