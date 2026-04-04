import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolResult, VaultConfig, SightingEntry, ReviewData, ok, err } from '../types.js';
import { readMasteryStore, masteryJsonPath } from '../vault.js';
import { wordsFolderPath } from '../vault.js';
import { todayString } from '../srs/scheduler.js';

const SIGHTING_RE = /^- (\d{4}-\d{2}-\d{2}) — "(.+?)"(?:\s*\*\((.+?)\)\*)?$/gm;

/**
 * Parse sighting entries from a word page's ## Sightings section.
 */
export function parseSightings(content: string): SightingEntry[] {
  // Extract ## Sightings section: everything after the heading until next ## or ---
  const idx = content.indexOf('## Sightings\n');
  if (idx === -1) return [];
  const afterHeading = content.slice(idx + '## Sightings\n'.length);
  const endMatch = afterHeading.match(/\n## |\n---\n/);
  const section = endMatch ? afterHeading.slice(0, endMatch.index) : afterHeading;

  const sightings: SightingEntry[] = [];
  let match;
  SIGHTING_RE.lastIndex = 0;
  while ((match = SIGHTING_RE.exec(section)) !== null) {
    sightings.push({
      date: match[1],
      sentence: match[2],
      channel: match[3] || undefined,
    });
  }
  return sightings;
}

/**
 * Compute days between two YYYY-MM-DD date strings.
 */
function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * prepare_review — bucket words for a daily review session.
 *
 * Buckets:
 *   1. New arrivals: sessions===0, next_review===date (just captured, never practiced)
 *   2. Used today: has sightings on target date (moved here from any other bucket)
 *   3. Due but not used: next_review <= date, no sightings on target date
 *   4. Dormant: everything else (count only)
 */
export async function prepareReview(
  config: VaultConfig,
  date?: string,
): Promise<ToolResult<ReviewData>> {
  const targetDate = date ?? todayString();
  const jsonPath = masteryJsonPath(config);
  const storeResult = await readMasteryStore(jsonPath);
  if (!storeResult.ok) return { ok: false, error: storeResult.error };

  const store = storeResult.data;
  const wordsDir = wordsFolderPath(config);
  const entries = Object.values(store.words);

  // Classify into initial buckets
  const bucket1: typeof entries = [];  // new arrivals
  const bucket3: typeof entries = [];  // due, not used (initial)
  const bucket4: typeof entries = [];  // dormant

  for (const entry of entries) {
    const isNew = entry.sessions === 0 && entry.last_practiced === '' && entry.next_review === targetDate;
    const isDue = entry.next_review <= targetDate;

    if (isNew) {
      bucket1.push(entry);
    } else if (isDue) {
      bucket3.push(entry);
    } else {
      bucket4.push(entry);
    }
  }

  // Read word pages and parse sightings for target date
  // Any word with sightings on target date → bucket 2
  const bucket2: Array<{ entry: typeof entries[0]; sightings: SightingEntry[]; content: string }> = [];
  const finalBucket1: Array<{ entry: typeof entries[0]; content: string }> = [];
  const finalBucket3: typeof entries = [];

  // Process bucket 1 (new arrivals) — check for sightings
  for (const entry of bucket1) {
    const mdPath = path.join(wordsDir, `${entry.word}.md`);
    let content = '';
    try { content = await fs.readFile(mdPath, 'utf8'); } catch { /* page missing */ }
    const sightings = parseSightings(content).filter(s => s.date === targetDate);
    if (sightings.length > 0) {
      bucket2.push({ entry, sightings, content });
    } else {
      finalBucket1.push({ entry, content });
    }
  }

  // Process bucket 3 (due) — check for sightings
  for (const entry of bucket3) {
    const mdPath = path.join(wordsDir, `${entry.word}.md`);
    let content = '';
    try { content = await fs.readFile(mdPath, 'utf8'); } catch { /* page missing */ }
    const sightings = parseSightings(content).filter(s => s.date === targetDate);
    if (sightings.length > 0) {
      bucket2.push({ entry, sightings, content });
    } else {
      finalBucket3.push(entry);
    }
  }

  // Also check bucket 4 (dormant) for sightings — a word not due can still be used
  for (const entry of bucket4) {
    const mdPath = path.join(wordsDir, `${entry.word}.md`);
    let content = '';
    try { content = await fs.readFile(mdPath, 'utf8'); } catch { continue; }
    const sightings = parseSightings(content).filter(s => s.date === targetDate);
    if (sightings.length > 0) {
      bucket2.push({ entry, sightings, content });
    }
  }

  const dormantCount = bucket4.length - bucket2.filter(b => bucket4.includes(b.entry)).length;
  const totalSightings = bucket2.reduce((sum, b) => sum + b.sightings.length, 0);

  const result: ReviewData = {
    review_date: targetDate,
    new_arrivals: finalBucket1.map(({ entry, content }) => ({
      word: entry.word,
      short_definition: entry.short_definition,
      content,
    })),
    used_today: bucket2.map(({ entry, sightings, content }) => ({
      word: entry.word,
      box: entry.box,
      short_definition: entry.short_definition,
      sightings,
      content,
    })),
    due_not_used: finalBucket3.map(entry => ({
      word: entry.word,
      box: entry.box,
      status: entry.status,
      short_definition: entry.short_definition,
      days_overdue: daysBetween(entry.next_review, targetDate),
      sessions: entry.sessions,
    })),
    dormant_count: dormantCount,
    total_words: entries.length,
    total_sightings_today: totalSightings,
  };

  return ok(result);
}
