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
  it('new word (sessions=0, next_review=today) → bucket 1', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.new_arrivals).toHaveLength(1);
      expect(result.data.new_arrivals[0].word).toBe('posit');
      expect(result.data.used_today).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('due word with no sightings → bucket 3', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: YESTERDAY, next_review: TODAY, sessions: 2, failures: [], best_sentences: [] },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.due_not_used).toHaveLength(1);
      expect(result.data.due_not_used[0].word).toBe('posit');
      expect(result.data.used_today).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('due word with today sighting → promoted to bucket 2', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: YESTERDAY, next_review: TODAY, sessions: 2, failures: [], best_sentences: [] },
      },
    };
    const sightings: SightingsStore = {
      version: 1,
      days: {
        [TODAY]: {
          posit: [{ date: TODAY, sentence: 'I posit that this works.', channel: 'telegram' }],
        },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(1);
      expect(result.data.used_today[0].word).toBe('posit');
      expect(result.data.used_today[0].sightings).toHaveLength(1);
      expect(result.data.due_not_used).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('new word with today sighting → promoted to bucket 2', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
      },
    };
    const sightings: SightingsStore = {
      version: 1,
      days: { [TODAY]: { posit: [{ date: TODAY, sentence: 'I posit something.' }] } },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(1);
      expect(result.data.new_arrivals).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('not-due word → dormant', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 3, status: 'reviewing', score: 85, last_practiced: YESTERDAY, next_review: '2026-12-31', sessions: 5, failures: [], best_sentences: [] },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.dormant_count).toBe(1);
      expect(result.data.used_today).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('dormant word with today sighting → promoted to bucket 2', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 3, status: 'reviewing', score: 85, last_practiced: YESTERDAY, next_review: '2026-12-31', sessions: 5, failures: [], best_sentences: [] },
      },
    };
    const sightings: SightingsStore = {
      version: 1,
      days: { [TODAY]: { posit: [{ date: TODAY, sentence: 'I posit that.' }] } },
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

  it('counts total sightings across words', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
        liminal: { word: 'liminal', box: 2, status: 'learning', score: 50, last_practiced: YESTERDAY, next_review: TODAY, sessions: 1, failures: [], best_sentences: [] },
      },
    };
    const sightings: SightingsStore = {
      version: 1,
      days: {
        [TODAY]: {
          posit: [
            { date: TODAY, sentence: 'I posit A.' },
            { date: TODAY, sentence: 'I posit B.' },
          ],
          liminal: [
            { date: TODAY, sentence: 'A liminal space.' },
          ],
        },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, {
      posit: wordPage('posit'),
      liminal: wordPage('liminal'),
    }, sightings);
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.total_sightings_today).toBe(3);
      expect(result.data.total_words).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it('no sightings.json → all words in non-used buckets', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 2, status: 'learning', score: 60, last_practiced: YESTERDAY, next_review: TODAY, sessions: 2, failures: [], best_sentences: [] },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit') });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(0);
      expect(result.data.due_not_used).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
