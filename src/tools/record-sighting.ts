import { ToolResult, VaultConfig, ok, err } from '../types.js';
import { readWordPage, writeWordPageAtomic, prependLineToSection, insertSectionAfterInfoBlock } from '../page-utils.js';

export interface RecordSightingInput {
  word: string;
  sentence: string;
  channel?: string;   // optional channel label, e.g. "Telegram — work chat"
}

/**
 * record_sighting — append a sighting to ## Sightings in the word page.
 *
 * Sightings are logged for visibility only — SRS score is still controlled
 * by explicit record_mastery calls. A duplicate sighting is benign.
 */
export async function recordSighting(
  config: VaultConfig,
  input: RecordSightingInput,
): Promise<ToolResult<void>> {
  const pageResult = await readWordPage(config, input.word);
  if (!pageResult.ok) return { ok: false, error: pageResult.error };
  const { wordLower, mdPath, content } = pageResult.data;

  const today = new Date().toISOString().slice(0, 10);
  const channelNote = input.channel ? ` *(${input.channel})*` : '';
  const line = `- ${today} — "${input.sentence}"${channelNote}`;

  // Append to ## Sightings section (creates it if absent)
  let updated = content;
  if (/^## Sightings\n/m.test(content)) {
    updated = prependLineToSection(content, '## Sightings', line);
  } else {
    updated = insertSectionAfterInfoBlock(content, '## Sightings', line);
  }

  // Use same directory as target to guarantee same-filesystem rename.
  // Random suffix prevents concurrent-test tmp filename collisions.
  return writeWordPageAtomic(mdPath, updated, `wh-sighting-${wordLower}`);
}
