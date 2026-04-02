import { VaultConfig } from '../types.js';
import { readMasteryStore, masteryJsonPath } from '../vault.js';
import { recordSighting } from '../tools/record-sighting.js';

/**
 * sighting-hook — outgoing message hook for in-the-wild detection.
 *
 * Scans outgoing messages for captured words using word-boundary regex.
 * On match: calls record_sighting. Does NOT update SRS score (visibility only).
 * Only fires on user outgoing messages, not agent responses.
 */
export async function onOutgoingMessage(
  config: VaultConfig,
  messageText: string,
  channelLabel?: string,
): Promise<void> {
  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return;  // no mastery data yet — nothing to match against
  const store = storeResult.data;

  const words = Object.keys(store.words);
  if (words.length === 0) return;

  const matches: Array<{ word: string; sentence: string }> = [];
  for (const word of words) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
    if (!regex.test(messageText)) continue;
    const sentence = extractSentence(messageText, word) ?? messageText.trim();
    matches.push({ word, sentence });
  }

  const settled = await Promise.allSettled(
    matches.map(m => recordSighting(config, { word: m.word, sentence: m.sentence, channel: channelLabel })),
  );
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'rejected') {
      console.warn(`[words-hunter] record_sighting failed for '${matches[i]!.word}': ${String(r.reason)}`);
    }
  }
}

/** Escape special regex chars in a word (words rarely have them, but be safe). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the sentence containing the word from a longer text.
 * Returns null if the text is already short enough to use directly.
 */
function extractSentence(text: string, word: string): string | null {
  if (text.length <= 200) return null;  // short enough, use as-is

  const regex = new RegExp(`[^.!?]*\\b${escapeRegex(word)}\\b[^.!?]*[.!?]?`, 'i');
  const match = regex.exec(text);
  return match ? match[0].trim() : null;
}
