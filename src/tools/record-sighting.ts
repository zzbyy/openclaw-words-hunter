import { ToolResult, VaultConfig, ok } from '../types.js';
import { sightingsJsonPath, readSightingsStore, writeSightingsStore, withSightingsLock } from '../vault.js';

export interface RecordSightingBatchInput {
  hits: Array<{ word: string; sentence: string }>;
  channel?: string;
}

export interface RecordSightingInput {
  word: string;
  sentence: string;
  channel?: string;
}

const PRUNE_DAYS = 30;

/**
 * Record a batch of sightings from a single message as one event.
 * Auto-prunes days older than 30 days.
 */
export async function recordSightingBatch(
  config: VaultConfig,
  input: RecordSightingBatchInput,
): Promise<ToolResult<void>> {
  if (input.hits.length === 0) return ok(undefined);

  const jsonPath = sightingsJsonPath(config);
  return withSightingsLock(jsonPath, async () => {
    const storeResult = await readSightingsStore(jsonPath);
    if (!storeResult.ok) return storeResult;
    const store = storeResult.data;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const timestamp = now.toISOString().slice(0, 16); // "2026-04-04T21:15"

    const words: Record<string, string> = {};
    for (const hit of input.hits) {
      words[hit.word] = hit.sentence;
    }

    if (!store.days[today]) store.days[today] = [];
    store.days[today].push({ timestamp, channel: input.channel, words });

    // Auto-prune days older than 30 days
    const cutoff = new Date(now.getTime() - PRUNE_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const day of Object.keys(store.days)) {
      if (day < cutoff) delete store.days[day];
    }

    return writeSightingsStore(jsonPath, store);
  });
}

/** Single-word wrapper for backward compatibility (tool registration). */
export async function recordSighting(
  config: VaultConfig,
  input: RecordSightingInput,
): Promise<ToolResult<void>> {
  return recordSightingBatch(config, {
    hits: [{ word: input.word, sentence: input.sentence }],
    channel: input.channel,
  });
}
