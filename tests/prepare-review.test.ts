import { describe, it, expect } from 'vitest';
import { prepareReview, parseSightings } from '../src/tools/prepare-review.js';
import type { VaultConfig, MasteryStore } from '../src/types.js';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function wordPage(word: string, sightings: string = ''): string {
  return `> [!info] ${word}\n> //\n\n## Sightings\n${sightings}\n---\n\n## Definitions\n\nSome definition.\n`;
}

async function makeReviewVault(
  store: MasteryStore,
  pages: Record<string, string>,
): Promise<{ config: VaultConfig; cleanup: () => Promise<void> }> {
  const vaultPath = await mkdtemp(join(tmpdir(), 'wh-review-'));
  await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
  await mkdir(join(vaultPath, 'Words'), { recursive: true });
  const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };

  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');
  for (const [word, content] of Object.entries(pages)) {
    await writeFile(join(vaultPath, 'Words', `${word}.md`), content, 'utf8');
  }

  return { config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
}

describe('parseSightings', () => {
  it('parses sighting with channel', () => {
    const content = `## Sightings\n- 2026-04-04 — "I posit that." *(telegram)*\n`;
    const sightings = parseSightings(content);
    expect(sightings).toEqual([{ date: '2026-04-04', sentence: 'I posit that.', channel: 'telegram' }]);
  });

  it('parses sighting without channel', () => {
    const content = `## Sightings\n- 2026-04-04 — "I posit that."\n`;
    const sightings = parseSightings(content);
    expect(sightings).toEqual([{ date: '2026-04-04', sentence: 'I posit that.', channel: undefined }]);
  });

  it('parses multiple sightings', () => {
    const content = `## Sightings\n- 2026-04-04 — "First."\n- 2026-04-03 — "Second." *(discord)*\n`;
    const sightings = parseSightings(content);
    expect(sightings).toHaveLength(2);
    expect(sightings[0].date).toBe('2026-04-04');
    expect(sightings[1].date).toBe('2026-04-03');
  });

  it('returns empty for no sightings section', () => {
    const content = `# posit\n\nSome content.`;
    expect(parseSightings(content)).toEqual([]);
  });
});

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
      expect(result.data.due_not_used).toHaveLength(0);
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
      expect(result.data.due_not_used[0].days_overdue).toBe(0);
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
    const sighting = `- ${TODAY} — "I posit that this works." *(telegram)*`;
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit', sighting) });
    try {
      const result = await prepareReview(config, TODAY);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.used_today).toHaveLength(1);
      expect(result.data.used_today[0].word).toBe('posit');
      expect(result.data.used_today[0].sightings).toHaveLength(1);
      expect(result.data.used_today[0].sightings[0].sentence).toBe('I posit that this works.');
      expect(result.data.due_not_used).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('new word with today sighting → promoted from bucket 1 to bucket 2', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
      },
    };
    const sighting = `- ${TODAY} — "I posit something."`;
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit', sighting) });
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

  it('not-due word → dormant (counted)', async () => {
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
      expect(result.data.new_arrivals).toHaveLength(0);
      expect(result.data.due_not_used).toHaveLength(0);
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
    const sighting = `- ${TODAY} — "I posit that."`;
    const { config, cleanup } = await makeReviewVault(store, { posit: wordPage('posit', sighting) });
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

  it('total_sightings_today counts all sightings across words', async () => {
    const store: MasteryStore = {
      version: 1,
      words: {
        posit: { word: 'posit', box: 1, status: 'learning', score: 0, last_practiced: '', next_review: TODAY, sessions: 0, failures: [], best_sentences: [] },
        liminal: { word: 'liminal', box: 2, status: 'learning', score: 50, last_practiced: YESTERDAY, next_review: TODAY, sessions: 1, failures: [], best_sentences: [] },
      },
    };
    const { config, cleanup } = await makeReviewVault(store, {
      posit: wordPage('posit', `- ${TODAY} — "I posit A."\n- ${TODAY} — "I posit B."`),
      liminal: wordPage('liminal', `- ${TODAY} — "A liminal space."`),
    });
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
});
