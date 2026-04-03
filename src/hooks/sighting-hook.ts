import fs from 'node:fs/promises';
import { VaultConfig } from '../types.js';
import { readMasteryStore, masteryJsonPath } from '../vault.js';
import { recordSighting } from '../tools/record-sighting.js';
import { escapeRegex, wordBoundaryRegex } from '../page-utils.js';

type WordMatcher = {
  word: string;
  regex: RegExp;
};

let matcherCache:
  | { jsonPath: string; mtimeMs: number; matchers: WordMatcher[] }
  | null = null;

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
  const matchers = await getWordMatchers(jsonPath);
  if (matchers.length === 0) return;

  const matches: Array<{ word: string; sentence: string }> = [];
  for (const matcher of matchers) {
    if (!matcher.regex.test(messageText)) continue;
    const sentence = extractSentence(messageText, matcher.word) ?? messageText.trim();
    matches.push({ word: matcher.word, sentence });
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

async function getWordMatchers(jsonPath: string): Promise<WordMatcher[]> {
  let stat;
  try {
    stat = await fs.stat(jsonPath);
  } catch {
    matcherCache = null;
    return [];
  }

  if (matcherCache && matcherCache.jsonPath === jsonPath && matcherCache.mtimeMs === stat.mtimeMs) {
    return matcherCache.matchers;
  }

  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return [];

  const matchers = Object.keys(storeResult.data.words).map((word) => ({
    word,
    regex: wordBoundaryRegex(word),
  }));

  matcherCache = {
    jsonPath,
    mtimeMs: stat.mtimeMs,
    matchers,
  };

  return matchers;
}
