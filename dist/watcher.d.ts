/**
 * watcher.ts — fs.watch on the words folder using chokidar.
 *
 * On new .md file creation: enqueues a nudge in pending-nudges.json
 * (nudge_due_at = now + 24h). A separate 15-min cron fires overdue nudges.
 *
 * Error handling:
 * - chokidar errors → logged, restart attempted with exponential backoff
 * - 3 consecutive restart failures → persistent warning logged to channel
 *
 * One nudge per file. No deduplication needed (two captures of the same
 * word create two files with different paths — two nudges is expected behavior).
 */
import { VaultConfig } from './types.js';
type WatcherLogger = {
    warn: (msg: string) => void;
    error: (msg: string) => void;
};
type ChannelNotifier = {
    sendWarning: (msg: string) => void;
};
export declare function startWatcher(config: VaultConfig, logger: WatcherLogger, channel: ChannelNotifier): Promise<() => void>;
export {};
//# sourceMappingURL=watcher.d.ts.map