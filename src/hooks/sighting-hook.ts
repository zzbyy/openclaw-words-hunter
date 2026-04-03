import fs from 'node:fs/promises';
import type { VaultConfig, WordEntry, PluginRuntime } from '../types.js';
import { readMasteryStore, masteryJsonPath } from '../vault.js';
import { recordSighting } from '../tools/record-sighting.js';
import { escapeRegex, wordBoundaryRegex } from '../page-utils.js';
import { emitPluginNotification } from '../notify-utils.js';

interface SynonymCacheEntry { synonym: string; vaultWord: string; regex: RegExp }
interface HookCache {
  jsonPath: string;
  mtimeMs: number;
  matchers: Array<{ word: string; entry: WordEntry; regex: RegExp }>;
  matcherByWord: Map<string, WordEntry>;
  synonymCache: SynonymCacheEntry[];
}
let hookCache: HookCache | null = null;

/**
 * sighting-hook — outgoing message hook for in-the-wild detection.
 *
 * Scans outgoing messages for captured words using word-boundary regex.
 * On match: calls record_sighting. Does NOT update SRS score (visibility only).
 * Only fires on user outgoing messages, not agent responses.
 * When runtime is provided and a word has coaching_mode='inline', sends inline feedback.
 */
export async function onOutgoingMessage(
  config: VaultConfig,
  messageText: string,
  channelId?: string,
  runtime?: PluginRuntime,
): Promise<void> {
  const jsonPath = masteryJsonPath(config);
  const cache = await getCaches(jsonPath);
  if (!cache || cache.matchers.length === 0) return;

  // Step 1: direct hits
  const directHits = new Map<string, WordEntry>();
  for (const m of cache.matchers) {
    if (m.regex.test(messageText)) directHits.set(m.word, m.entry);
  }

  // Step 2: synonym hits (skip vault words with a direct hit this message)
  const synonymHits = new Map<string, { vaultWord: string; synonym: string; entry: WordEntry }>();
  for (const s of cache.synonymCache) {
    if (directHits.has(s.vaultWord)) continue;
    if (s.regex.test(messageText)) {
      const entry = cache.matcherByWord.get(s.vaultWord);
      if (!entry) continue;
      synonymHits.set(s.vaultWord, { vaultWord: s.vaultWord, synonym: s.synonym, entry });
    }
  }

  // Step 3: log sightings — direct hits only
  await Promise.allSettled(
    [...directHits.values()].map(entry => {
      const sentence = extractSentence(messageText, entry.word) ?? messageText.trim();
      return recordSighting(config, { word: entry.word, sentence, channel: channelId });
    })
  );

  // Step 4: inline notifications — cap 2 per message, direct wins slots first
  if (runtime) {
    const inlineDirectHits = [...directHits.values()]
      .filter(e => e.coaching_mode === 'inline')
      .sort((a, b) => b.box - a.box || a.word.localeCompare(b.word))
      .slice(0, 2);

    const remainingSlots = 2 - inlineDirectHits.length;
    const inlineSynonymHits = remainingSlots > 0
      ? [...synonymHits.values()]
          .filter(h => h.entry.coaching_mode === 'inline')
          .sort((a, b) => b.entry.box - a.entry.box || a.vaultWord.localeCompare(b.vaultWord))
          .slice(0, remainingSlots)
      : [];

    await Promise.allSettled([
      ...inlineDirectHits.map(e => sendInlineFeedback(runtime, channelId, e)),
      ...inlineSynonymHits.map(h => sendSynonymUpgrade(runtime, channelId, h.synonym, h.entry)),
    ]);
  }
}

async function sendInlineFeedback(
  runtime: PluginRuntime,
  channelId: string | undefined,
  entry: WordEntry,
): Promise<void> {
  await emitPluginNotification(
    runtime, 'inline', channelId ?? null,
    `${entry.word} -- naturally used. Box ${entry.box}. [#vocab to practice]`
  );
}

async function sendSynonymUpgrade(
  runtime: PluginRuntime,
  channelId: string | undefined,
  synonym: string,
  vaultEntry: WordEntry,
): Promise<void> {
  await emitPluginNotification(
    runtime, 'inline', channelId ?? null,
    `You wrote "${synonym}" -- but you've been studying "${vaultEntry.word}" (similar meaning). Consider swapping? [#vocab to practice]`
  );
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
  const synonymCount = new Map<string, number>();
  for (const entry of Object.values(store.words)) {
    for (const syn of entry.synonyms ?? []) {
      synonymCount.set(syn, (synonymCount.get(syn) ?? 0) + 1);
    }
  }
  const vaultWordSet = new Set(Object.keys(store.words));

  const matchers = Object.values(store.words).map(entry => ({
    entry,
    word: entry.word,
    regex: wordBoundaryRegex(entry.word),
  }));

  const matcherByWord = new Map<string, WordEntry>(matchers.map(m => [m.word, m.entry]));

  const synonymCache: SynonymCacheEntry[] = [];
  for (const entry of Object.values(store.words)) {
    for (const syn of entry.synonyms ?? []) {
      if ((synonymCount.get(syn) ?? 0) > 3) continue;
      if (vaultWordSet.has(syn)) continue;
      synonymCache.push({ synonym: syn, vaultWord: entry.word, regex: wordBoundaryRegex(syn) });
    }
  }

  return { jsonPath, mtimeMs, matchers, matcherByWord, synonymCache };
}
