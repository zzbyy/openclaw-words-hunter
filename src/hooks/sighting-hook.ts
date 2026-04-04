import fs from 'node:fs/promises';
import type { VaultConfig, WordEntry } from '../types.js';
import { readMasteryStore, masteryJsonPath } from '../vault.js';
import { recordSighting } from '../tools/record-sighting.js';
import { escapeRegex } from '../page-utils.js';
import { tokenize, generateForms, MatchTrie } from '../matching/index.js';
import type { TrieMatch } from '../matching/index.js';

export interface CoachingNote {
  type: 'direct' | 'synonym';
  word: string;
  box: number;
  shortDef?: string;
  synonym?: string;
}

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
 *
 * Returns coaching notes for words that are not silenced and below Box 4.
 * Sightings are always recorded regardless of coaching mode or box.
 */
export async function onOutgoingMessage(
  config: VaultConfig,
  messageText: string,
  channelId?: string,
): Promise<CoachingNote[]> {
  const jsonPath = masteryJsonPath(config);
  const cache = await getCaches(jsonPath);
  if (!cache) return [];

  const tokens = tokenize(messageText);
  if (tokens.length === 0) return [];

  const matches = cache.trie.search(tokens);

  // Step 1: split into direct hits and synonym hits, dedup by canonical word
  const directHits = new Map<string, { entry: WordEntry; matchedForm: string }>();
  const synonymHits = new Map<string, { vaultWord: string; synonym: string; entry: WordEntry }>();

  for (const m of matches) {
    const entry = cache.matcherByWord.get(m.canonical);
    if (!entry) continue;

    if (m.type === 'direct') {
      if (!directHits.has(m.canonical)) {
        directHits.set(m.canonical, { entry, matchedForm: m.matchedForm });
      }
    } else if (m.type === 'synonym') {
      // Skip synonym if we already have a direct hit for this vault word
      if (!directHits.has(m.canonical) && !synonymHits.has(m.canonical)) {
        synonymHits.set(m.canonical, { vaultWord: m.canonical, synonym: m.synonym!, entry });
      }
    }
  }

  // Step 2: log sightings — direct hits only (all words, regardless of coaching mode or box)
  await Promise.allSettled(
    [...directHits.values()].map(({ entry, matchedForm }) => {
      const sentence = extractSentence(messageText, matchedForm) ?? messageText.trim();
      return recordSighting(config, { word: entry.word, sentence, channel: channelId });
    })
  );

  // Step 3: build coaching notes — on by default, suppress for silent or Box 4+
  const notes: CoachingNote[] = [];

  const eligibleDirectHits = [...directHits.values()]
    .filter(({ entry: e }) => e.coaching_mode !== 'silent' && e.box < 4)
    .sort((a, b) => b.entry.box - a.entry.box || a.entry.word.localeCompare(b.entry.word))
    .slice(0, 2);

  for (const { entry: e } of eligibleDirectHits) {
    notes.push({ type: 'direct', word: e.word, box: e.box, shortDef: e.short_definition });
  }

  const remainingSlots = 2 - notes.length;
  if (remainingSlots > 0) {
    const eligibleSynonymHits = [...synonymHits.values()]
      .filter(h => h.entry.coaching_mode !== 'silent' && h.entry.box < 4)
      .sort((a, b) => b.entry.box - a.entry.box || a.vaultWord.localeCompare(b.vaultWord))
      .slice(0, remainingSlots);

    for (const h of eligibleSynonymHits) {
      notes.push({ type: 'synonym', word: h.vaultWord, box: h.entry.box, shortDef: h.entry.short_definition, synonym: h.synonym });
    }
  }

  return notes;
}

/**
 * Extract the sentence containing the word from a longer text.
 * Returns null if the text is already short enough to use directly.
 */
function extractSentence(text: string, matchedForm: string): string | null {
  if (text.length <= 200) return null;  // short enough, use as-is

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

  // Count synonym occurrences for ambiguity filtering
  const synonymCount = new Map<string, number>();
  for (const entry of Object.values(store.words)) {
    for (const syn of entry.synonyms ?? []) {
      synonymCount.set(syn, (synonymCount.get(syn) ?? 0) + 1);
    }
  }
  const vaultWordSet = new Set(Object.keys(store.words));

  // Insert direct word forms into trie
  for (const entry of Object.values(store.words)) {
    matcherByWord.set(entry.word, entry);
    const forms = generateForms(entry.word);
    trie.insert(entry.word, forms, 'direct');
  }

  // Insert synonym forms into trie
  for (const entry of Object.values(store.words)) {
    for (const syn of entry.synonyms ?? []) {
      if ((synonymCount.get(syn) ?? 0) > 3) continue;
      if (vaultWordSet.has(syn)) continue;
      const synForms = generateForms(syn);
      trie.insert(entry.word, synForms, 'synonym', syn);
    }
  }

  return { jsonPath, mtimeMs, trie, matcherByWord };
}
