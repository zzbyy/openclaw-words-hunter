import { ToolResult, VaultConfig, SightingEntry, ReviewData, ok } from '../types.js';
import { readMasteryStore, masteryJsonPath, readSightingsStore, sightingsJsonPath } from '../vault.js';
import { todayString } from '../srs/scheduler.js';

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
 * Reads sightings from sightings.json (not from .md pages).
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

  // Read sightings store and fan out events to per-word arrays
  const sightingsPath = sightingsJsonPath(config);
  const sightingsResult = await readSightingsStore(sightingsPath);
  const daySightings: Record<string, SightingEntry[]> = {};
  if (sightingsResult.ok) {
    const dayEvents = sightingsResult.data.days[targetDate] ?? [];
    for (const event of dayEvents) {
      for (const [word, sentence] of Object.entries(event.words)) {
        if (!daySightings[word]) daySightings[word] = [];
        daySightings[word].push({ timestamp: event.timestamp, sentence, channel: event.channel });
      }
    }
  }

  const store = storeResult.data;
  const entries = Object.values(store.words);

  // Classify each word
  const newArrivals: Array<{ word: string; short_definition?: string }> = [];
  const usedToday: Array<{ word: string; box: number; short_definition?: string; sightings: SightingEntry[] }> = [];
  const dueNotUsed: Array<{ word: string; box: number; status: string; short_definition?: string; days_overdue: number; sessions: number }> = [];
  let dormantCount = 0;
  let totalSightings = 0;

  for (const entry of entries) {
    const wordSightings = daySightings[entry.word] ?? [];
    const hasSightings = wordSightings.length > 0;
    totalSightings += wordSightings.length;

    const isNew = entry.sessions === 0 && entry.last_practiced === '' && entry.next_review === targetDate;
    const isDue = entry.next_review <= targetDate;

    if (hasSightings) {
      // Bucket 2: used today — agent can load_word() for full page
      usedToday.push({
        word: entry.word,
        box: entry.box,
        short_definition: entry.short_definition,
        sightings: wordSightings,
      });
    } else if (isNew) {
      // Bucket 1: new arrivals — agent can load_word() for full page
      newArrivals.push({
        word: entry.word,
        short_definition: entry.short_definition,
      });
    } else if (isDue) {
      // Bucket 3: due but not used
      dueNotUsed.push({
        word: entry.word,
        box: entry.box,
        status: entry.status,
        short_definition: entry.short_definition,
        days_overdue: daysBetween(entry.next_review, targetDate),
        sessions: entry.sessions,
      });
    } else {
      dormantCount++;
    }
  }

  return ok({
    review_date: targetDate,
    new_arrivals: newArrivals,
    used_today: usedToday,
    due_not_used: dueNotUsed,
    dormant_count: dormantCount,
    total_words: entries.length,
    total_sightings_today: totalSightings,
  });
}
