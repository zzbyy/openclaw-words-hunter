import fs from 'node:fs/promises';
import type { VaultConfig, WordEntry } from '../types.js';
import { readMasteryStore, masteryJsonPath } from '../vault.js';
import { recordSightingBatch } from '../tools/record-sighting.js';
import { escapeRegex } from '../page-utils.js';
import { tokenize, generateForms, MatchTrie } from '../matching/index.js';

interface HookCache {
  jsonPath: string;
  mtimeMs: number;
  trie: MatchTrie;
  matcherByWord: Map<string, WordEntry>;
}
let hookCache: HookCache | null = null;

/**
 * sighting-hook — outgoing message hook for in-the-wild detection.
 *
 * Scans outgoing messages for captured words using a trie-based matcher
 * with inflection-aware forward expansion.
 * On match: calls record_sighting. Does NOT update SRS score (visibility only).
 * Only fires on user outgoing messages, not agent responses.
 */
export async function onOutgoingMessage(
  config: VaultConfig,
  messageText: string,
  channelId?: string,
): Promise<void> {
  const jsonPath = masteryJsonPath(config);
  const cache = await getCaches(jsonPath);
  if (!cache) return;

  const tokens = tokenize(messageText);
  if (tokens.length === 0) return;

  const matches = cache.trie.search(tokens);

  // Dedup direct hits by canonical word
  const directHits = new Map<string, { entry: WordEntry; matchedForm: string }>();
  for (const m of matches) {
    if (m.type !== 'direct') continue;
    const entry = cache.matcherByWord.get(m.canonical);
    if (!entry) continue;
    if (!directHits.has(m.canonical)) {
      directHits.set(m.canonical, { entry, matchedForm: m.matchedForm });
    }
  }

  // Log sightings — all direct hits in one batch write
  const hits = [...directHits.values()].map(({ entry, matchedForm }) => ({
    word: entry.word,
    sentence: extractSentence(messageText, matchedForm) ?? messageText.trim(),
  }));
  if (hits.length > 0) {
    await recordSightingBatch(config, { hits, channel: channelId });
  }
}

/**
 * Extract the sentence containing the word from a longer text.
 * Returns null if the text is already short enough to use directly.
 */
function extractSentence(text: string, matchedForm: string): string | null {
  if (text.length <= 200) return null;

  const regex = new RegExp(`[^.!?]*\\b${escapeRegex(matchedForm)}\\b[^.!?]*[.!?]?`, 'i');
  const match = regex.exec(text);
  return match ? match[0].trim() : null;
}

async function getCaches(jsonPath: string): Promise<HookCache | null> {
  let stat;
  try { stat = await fs.stat(jsonPath); } catch { hookCache = null; return null; }

  if (hookCache && hookCache.jsonPath === jsonPath && hookCache.mtimeMs === stat.mtimeMs) {
    return hookCache;
  }

  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return null;

  hookCache = buildCaches(storeResult.data, jsonPath, stat.mtimeMs);
  return hookCache;
}

function buildCaches(store: { version: 1; words: Record<string, WordEntry> }, jsonPath: string, mtimeMs: number): HookCache {
  const trie = new MatchTrie();
  const matcherByWord = new Map<string, WordEntry>();

  for (const entry of Object.values(store.words)) {
    matcherByWord.set(entry.word, entry);
    const forms = generateForms(entry.word);
    trie.insert(entry.word, forms, 'direct');
  }

  return { jsonPath, mtimeMs, trie, matcherByWord };
}
