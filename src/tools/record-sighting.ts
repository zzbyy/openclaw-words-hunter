import { ToolResult, VaultConfig, ok } from '../types.js';
import { sightingsJsonPath, readSightingsStore, writeSightingsStore, withSightingsLock } from '../vault.js';

export interface RecordSightingInput {
  word: string;
  sentence: string;
  channel?: string;
}

/**
 * record_sighting — append a sighting to sightings.json.
 *
 * Sightings are logged for visibility only — SRS score is still controlled
 * by explicit record_mastery calls. Word .md pages are not touched.
 */
export async function recordSighting(
  config: VaultConfig,
  input: RecordSightingInput,
): Promise<ToolResult<void>> {
  const jsonPath = sightingsJsonPath(config);
  return withSightingsLock(jsonPath, async () => {
    const storeResult = await readSightingsStore(jsonPath);
    if (!storeResult.ok) return storeResult;
    const store = storeResult.data;

    const today = new Date().toISOString().slice(0, 10);
    if (!store.days[today]) store.days[today] = {};
    if (!store.days[today][input.word]) store.days[today][input.word] = [];
    store.days[today][input.word].push({
      date: today,
      sentence: input.sentence,
      channel: input.channel,
    });

    return writeSightingsStore(jsonPath, store);
  });
}
