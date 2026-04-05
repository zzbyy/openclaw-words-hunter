import { describe, it, expect } from 'vitest';
import { prepareReview } from '../src/tools/prepare-review.js';
import type { VaultConfig, MasteryStore, SightingsStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function wordPage(word: string): string {
  return `> [!info] ${word}\n> //\n\n## Definitions\n\nSome definition.\n`;
}

async function makeReviewVault(
  store: MasteryStore,
  pages: Record<string, string>,
  sightings?: SightingsStore,
): Promise<{ config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-review-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };

  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');
  if (sightings) {
    await writeFile(join(vaultPath, '.wordshunter', 'sightings.json'), JSON.stringify(sightings), 'utf8');
  }
  for (const [word, content] of Object.entries(pages)) {
    await writeFile(join(vaultPath, 'Words', `${word}.md`), content, 'utf8');
  }

  return { config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

describe('prepareReview', () => {
  it('new word → bucket 1', async () => {
    const store: MasteryStore = {
      version: 1,
      words: { posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] } },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.new_arrivals).toHaveLength(1);
      expect(result.data.used_today).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('due word with sighting → bucket 2 (v2 events)', async () => {
    const store: MasteryStore = {
      version: 1,
      words: { posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: YESTERDAY, next_review: TODAY, sessions: 2, failures: [], best_sentences: [] } },
    };
    const sightings: SightingsStore = {
      version: 2,
      days: { [TODAY]: [{ timestamp: `${TODAY}T21:15`, channel: 'telegram', words: { posit: 'I posit that this works.' } }] },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(1);
      expect(result.data.used_today[0].sightings).toHaveLength(1);
      expect(result.data.used_today[0].sightings[0].timestamp).toBe(`${TODAY}T21:15`);
      expect(result.data.used_today[0].sightings[0].sentence).toBe('I posit that this works.');
      expect(result.data.due_not_used).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('one event with 2 words → both in bucket 2', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        deliberate: { word: 'deliberate', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
        suppress: { word: 'suppress', box: 2, status: 'learning', score: 50, last_practiced: YESTERDAY, next_review: TODAY, sessions: 1, failures: [], best_sentences: [] },
      },
    };
    const sightings: SightingsStore = {
      version: 2,
      days: { [TODAY]: [{ timestamp: `${TODAY}T10:00`, words: { deliberate: 'The deliberate attempt to suppress.', suppress: 'The deliberate attempt to suppress.' } }] },
    };
    const { config, cleanup } = await makeReviewVault(store, { deliberate: wordPage('deliberate'), suppress: wordPage('suppress') }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(2);
      expect(result.data.used_today.map(w => w.word).sort()).toEqual(['deliberate', 'suppress']);
      expect(result.data.new_arrivals).toHaveLength(0); // deliberate promoted from B1 to B2
    } finally {
      await cleanup();
    }
  });

  it('due word without sighting → bucket 3', async () => {
    const store: MasteryStore = {
      version: 1,
      words: { posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: YESTERDAY, next_review: TODAY, sessions: 2, failures: [], best_sentences: [] } },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.due_not_used).toHaveLength(1);
      expect(result.data.used_today).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('dormant word → counted', async () => {
    const store: MasteryStore = {
      version: 1,
      words: { posit: { word: 'posit', box: 3, status: 'reviewing', score: 85, last_practiced: YESTERDAY, next_review: '2026-12-31', sessions: 5, failures: [], best_sentences: [] } },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.dormant_count).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('dormant word with sighting → promoted to bucket 2', async () => {
    const store: MasteryStore = {
      version: 1,
      words: { posit: { word: 'posit', box: 3, status: 'reviewing', score: 85, last_practiced: YESTERDAY, next_review: '2026-12-31', sessions: 5, failures: [], best_sentences: [] } },
    };
    const sightings: SightingsStore = {
      version: 2,
      days: { [TODAY]: [{ timestamp: `${TODAY}T14:00`, words: { posit: 'I posit that.' } }] },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(1);
      expect(result.data.dormant_count).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it('total_sightings_today counts all events', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
        liminal: { word: 'liminal', box: 2, status: 'learning', score: 50, last_practiced: YESTERDAY, next_review: TODAY, sessions: 1, failures: [], best_sentences: [] },
      },
    };
    const sightings: SightingsStore = {
      version: 2,
      days: { [TODAY]: [
        { timestamp: `${TODAY}T10:00`, words: { posit: 'I posit A.', liminal: 'A liminal space.' } },
        { timestamp: `${TODAY}T11:00`, words: { posit: 'I posit B.' } },
      ] },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit'), liminal: wordPage('liminal') }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // posit: 2 sightings, liminal: 1 sighting = 3 total
      expect(result.data.total_sightings_today).toBe(3);
    } finally {
      await cleanup();
    }
  });
});
