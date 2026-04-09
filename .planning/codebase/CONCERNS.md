# Codebase Concerns

**Analysis Date:** 2026-04-07

## Data Integrity & Concurrency

**Silent file deletion during word creation:**
- Issue: `fillWordPage()` in `src/fill-word-page.ts` (line 65-69) gracefully skips if the .md file is deleted between word creation and Cambridge lookup. This can lose lookup data if a file is deleted at precisely the right moment.
- Files: `src/fill-word-page.ts`, `src/tools/create-word.ts`
- Impact: User captures a word, file is deleted, word page created without definitions. Lookup was already done (network cost) but results discarded. User sees blank word page.
- Fix approach: Either (1) ensure word file exists atomically with mastery.json entry before starting lookup, or (2) persist lookup results to mastery.json before writing to .md, so re-lookup can happen on next session.

**Lost updates in concurrent I/O without proper transaction ordering:**
- Issue: Multiple writes to JSON files (mastery.json, sightings.json, pending-nudges.json) use file locking (`withMasteryLock`, `withSightingsLock`), but operations like `registerWord()` in `src/watcher.ts` (line 102-123) perform read-modify-write without ensuring the .md file write succeeds. If file write fails mid-stream, mastery entry exists but .md is missing.
- Files: `src/watcher.ts:registerWord()`, `src/vault.ts:withMasteryLock()`
- Impact: Mastery.json says word exists but word file missing. Plugin will try to load non-existent file on next tool call. User must manually run `words-hunter repair` to recover.
- Fix approach: Wrap `registerWord()` and `.md` file creation in same transaction, or ensure both succeed atomically before commit to mastery.json.

**Sidecar config mutation without atomicity guarantees:**
- Issue: `mutatePluginSidecarConfig()` in `src/vault.ts` (line 93-104) uses file locking but doesn't validate that all required fields exist before returning. If .json is corrupted or partially written, parsePluginSidecarConfig() returns null gracefully, but downstream code in `src/index.ts` (line 418-435) may have stale config references.
- Files: `src/vault.ts:parsePluginSidecarConfig()`, `src/index.ts:fireWeeklyRecapIfDue()`
- Impact: Primary channel or recap timestamps could be stale or missing. Weekly/daily recap crons fire at wrong time or to wrong channel after config corruption.
- Fix approach: Validate schema strictly before returning from mutatePluginSidecarConfig(). Use TypeBox or runtime schema validation to catch parsing gaps.

## External Service Fragility

**Cambridge Dictionary blocking on rate limit (HTTP 429):**
- Issue: `cambridgeLookup()` in `src/cambridge-lookup.ts` (line 73) adds random jitter (0.5-2.0s) between requests. For bulk word imports or concurrent lookups, this may be insufficient. Cambridge has no documented rate limit but anecdotally blocks at ~5-10 requests/min.
- Files: `src/cambridge-lookup.ts:fetchPage()`, `src/tools/create-word.ts`
- Impact: When user imports 20+ words, subsequent lookups get HTTP 429 errors. No retry logic exists — word pages created blank. User must manually re-run lookups later.
- Fix approach: (1) Add exponential backoff + retry for 429, (2) Implement request queuing for bulk operations, (3) Cache lookups in mastery.json so re-capture of same word uses cached lookup.

**HTML scraping fragility on DOM changes:**
- Issue: `parseContent()` in `src/cambridge-lookup.ts` uses hard-coded CSS selectors (e.g., `.headword`, `.entry-body`, `.ddef_block`) that depend on Cambridge's DOM structure. If Cambridge updates their site layout (which they do periodically), all selectors could fail silently.
- Files: `src/cambridge-lookup.ts:extractHeadword()`, `:extractEntries()`, `:extractWordFamily()`
- Impact: All new word lookups fail silently (no definitions extracted). Existing words unaffected. Could go unnoticed for weeks until user creates a new word and sees blank page.
- Fix approach: (1) Add version metadata to lookups to detect scraper drift, (2) Implement fallback to a secondary dictionary API (Oxford, Merriam-Webster), (3) Monitor GitHub issues for DOM changes, (4) Add integration tests that run weekly against live Cambridge site.

## Inflection Matching

**Brittle verb conjugation rules for non-standard forms:**
- Issue: `generateForms()` in `src/matching/inflect.ts` uses conservative rules: e.g., only doubles final consonant for 3-4 letter words (line 69). Longer words like "benefit" are not recognized as "benefitting" (should double 't'). Irregular verbs like "go/goes" are not handled.
- Files: `src/matching/inflect.ts:shouldDouble()`, `src/matching/inflect.ts:generateForms()`
- Impact: Word "benefit" appears in user message as "benefitting" but is not detected as a sighting. User won't see the coaching notification.
- Fix approach: (1) Expand `shouldDouble()` logic to handle more cases (check vowel count heuristic), (2) Add explicit irregular verb list, (3) Use trie-based backward stemming for detection (harder to implement but more robust).

**Multi-word phrases only match exactly, no partial inflection:**
- Issue: `generateForms()` in `src/matching/inflect.ts` (line 10) returns only the canonical form for phrases with spaces. If phrase is "get up", it won't match "getting up" or "gets up".
- Files: `src/matching/inflect.ts:generateForms()`, `src/hooks/sighting-hook.ts:onOutgoingMessage()`
- Impact: Phrasal verbs and compound words won't be detected when inflected in user messages. User manually uses "get up" in message as "getting up" — no sighting recorded.
- Fix approach: Inflect individual tokens in phrases and regenerate combinations (e.g., "get up" → "get up", "gets up", "getting up", "got up"). Coordinate with MatchTrie for multi-token lookup.

## Performance & Scaling

**Hook cache invalidation only on file mtime change:**
- Issue: `getCaches()` in `src/hooks/sighting-hook.ts` (line 71-84) checks only file modification time. If mastery.json is replaced with identical content via atomic rename, mtime may be same and stale cache persists.
- Files: `src/hooks/sighting-hook.ts:getCaches()`
- Impact: New words added via other channels won't be detected in sightings. User message contains recently-added word but isn't recorded as sighting.
- Fix approach: Include file size or content hash in cache key, or use content-addressed cache invalidation.

**Trie search is O(n*m) where n=tokens, m=trie depth:**
- Issue: `MatchTrie.search()` in `src/matching/trie.ts` (line 54-86) uses greedy longest-match but doesn't break early. For very large vaults (1000+ words with many inflections), scanning all tokens against all trie paths could be slow.
- Files: `src/matching/trie.ts:MatchTrie.search()`, `src/hooks/sighting-hook.ts:onOutgoingMessage()`
- Impact: For large vaults, processing every outgoing message to scan for sightings could cause noticeable UI lag in the plugin.
- Fix approach: Add benchmarks for 1000+ word vaults. Consider optimizations: (1) early termination when no children exist, (2) prefix filtering before trie traversal, (3) async sighting detection so message delivery isn't blocked.

**Sightings auto-prune (90 days) may thrash on large vaults:**
- Issue: `recordSightingBatch()` in `src/tools/record-sighting.ts` (line 54-58) iterates all days in sightings.json on every sighting to prune. For a vault with 2+ years of data, this loop is O(730).
- Files: `src/tools/record-sighting.ts:recordSightingBatch()`, `src/vault.ts:writeSightingsStore()`
- Impact: Each sighting append now scans and deletes 730+ old days. File grows unbounded until prune happens, then shrinks. On some systems this could cause minor slowdown.
- Fix approach: Move pruning to a separate scheduled cron task (nightly), or use a more efficient data structure (keep pruning cutoff timestamp in sightings.json root).

## Testing Coverage Gaps

**No integration tests for concurrent tool calls:**
- Issue: All concurrency testing uses unit-level mocks. Real scenario: user calls `record_mastery` while sighting hook fires simultaneously. Locks are tested individually but not under realistic contention.
- Files: `tests/record-mastery.test.ts`, `tests/sighting-hook.test.ts`, `src/vault.ts`
- Impact: Race conditions in production that don't appear in test suite. Data loss or stale state under real load.
- Fix approach: Add integration test with async calls to multiple tools in parallel, verify mastery.json consistency after all resolve.

**No tests for Cambridge lookup failure scenarios beyond 404:**
- Issue: Tests mock happy path. Real failures: server 500, network timeout, malformed HTML with changed selectors.
- Files: `tests/cambridge-lookup.test.ts`
- Impact: Unknown recovery behavior. Does plugin retry? Fail gracefully? Log correctly?
- Fix approach: Add tests for HTTP 429, 500, timeout, and selector mismatch scenarios.

**Word page update race — no test for concurrent `update_page` calls:**
- Issue: `update_page` uses `content_hash` to detect concurrent edits (line 182 in `src/index.ts`), but no test verifies two agents can't both get the same hash and both update.
- Files: `src/tools/update-page.ts`, `tests/update-page.test.ts`
- Impact: If user manually edits word page while plugin tries to append best sentence, one update silently lost.
- Fix approach: Add test that opens word page twice (get hash both times), modifies both, verifies second write detects conflict and fails.

## Known Limitations

**Legacy placeholder variables in word pages:**
- Issue: `fillWordPage()` in `src/fill-word-page.ts` (lines 127-135) fills `{{collocations}}`, `{{nearby-words}}`, `{{syllables}}` with fallback text. These are legacy from earlier dict APIs and output "*(no X available)*" rather than real data.
- Files: `src/fill-word-page.ts:fillWordPage()`
- Impact: User sees empty placeholders in word pages. Not a bug, but confusing UX if user expects collocations.
- Fix approach: Remove legacy placeholders from template, or implement fallback collocations from Cambridge examples.

**Inflected form detection does not handle apostrophes in contractions:**
- Issue: `tokenize()` in `src/matching/tokenizer.ts` uses `\b` word boundary, which treats "don't" as one token. Forms like "don" + "'t" are not generated separately.
- Files: `src/matching/tokenizer.ts:tokenize()`
- Impact: If user adds word "don't", sighting detection won't find "dont" or "don t" variations.
- Fix approach: Preprocess tokens to handle contractions more flexibly (split on apostrophe, or add contraction forms to generateForms).

**No vault size limits or warnings:**
- Issue: No check on total words in vault. Very large vaults (10K+ words) will create large mastery.json (multi-MB) and slow down startup loads.
- Files: `src/tools/scan-vault.ts`, `src/vault.ts:readMasteryStore()`
- Impact: Plugin responsiveness degrades silently on large vaults. Users might not notice until scanning becomes noticeably slow.
- Fix approach: Add advisory logging when vault exceeds 5K words. Consider sharding mastery.json if threshold hit.

## Security & Validation

**Path traversal not validated on word filenames from mastery.json:**
- Issue: `wordsFolderPath()` in `src/vault.ts` (line 132-136) returns `words_folder` from config. If `words_folder` is set to `../../../etc`, path traversal is possible. Validated in `validateWord()` for LLM input, but not for existing entries loaded from mastery.json.
- Files: `src/vault.ts:wordsFolderPath()`, `src/vault.ts:validateWord()`
- Impact: If mastery.json is corrupted or manually edited with malicious words_folder path, file I/O could target outside vault.
- Fix approach: Validate `words_folder` on config load (ensure it's relative and doesn't escape root).

**Word input regex allows up to 50 chars but doesn't reject mixed-case well:**
- Issue: `WORD_PATTERN` in `src/vault.ts` (line 111) allows any case, but downstream code calls `.toLowerCase()` assuming lowercase. Input "POSIT" becomes "posit" fine, but regex doesn't enforce lowercase.
- Files: `src/vault.ts:validateWord()`
- Impact: Minor — not a real security issue, just inconsistent validation. Word normalized at use time anyway.
- Fix approach: Document that words are normalized to lowercase before storage, or enforce lowercase in regex.

---

*Concerns audit: 2026-04-07*
