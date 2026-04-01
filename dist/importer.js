/**
 * One-time importer: on plugin load, if mastery.json is absent or a word page
 * exists in the words folder with no mastery.json entry, create an entry at
 * box=1, status=learning, so the word shows up in scan_vault results.
 *
 * Runs at startup. Safe to run repeatedly — only fills missing entries.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { masteryJsonPath, wordsFolderPath, readMasteryStore, writeMasteryStore } from './vault.js';
import { todayString } from './srs/scheduler.js';
export async function importUntracked(config) {
    const wordsDir = wordsFolderPath(config);
    const jsonPath = masteryJsonPath(config);
    // Read existing store (empty on first run)
    const storeResult = await readMasteryStore(jsonPath);
    if (!storeResult.ok)
        return { imported: [] };
    const store = storeResult.data;
    // Scan words folder for .md files
    let entries;
    try {
        entries = await fs.readdir(wordsDir);
    }
    catch {
        return { imported: [] }; // words folder doesn't exist yet
    }
    const mdFiles = entries.filter(f => f.endsWith('.md'));
    const imported = [];
    for (const file of mdFiles) {
        const word = path.basename(file, '.md').toLowerCase();
        if (store.words[word])
            continue; // already tracked
        const today = todayString();
        const entry = {
            word,
            box: 1,
            status: 'learning',
            score: 0,
            last_practiced: '',
            next_review: today, // due immediately — never been practiced
            sessions: 0,
            failures: [],
            best_sentences: [],
        };
        store.words[word] = entry;
        imported.push(word);
    }
    if (imported.length > 0) {
        await writeMasteryStore(jsonPath, store);
    }
    return { imported };
}
//# sourceMappingURL=importer.js.map