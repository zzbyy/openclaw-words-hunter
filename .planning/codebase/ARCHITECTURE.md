# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** OpenClaw Plugin with Tool-based Agent Integration

**Key Characteristics:**
- Plugin-based architecture for OpenClaw (messaging platform with AI agents)
- 8 agent-callable tools for vocabulary management and SRS state transitions
- File-system backed state: mastery.json (SRS state), sightings.json (usage tracking), config.json (bridge)
- Real-time message hook for passive sighting detection (word usage in conversations)
- Background cron jobs for nudges and review notifications (15-min polling intervals)
- Pure functional SRS scheduler (Leitner 5-box system)
- Trie-based inflection-aware word matching for sighting detection

## Layers

**Plugin Runtime (OpenClaw SDK):**
- Purpose: Interface with OpenClaw messaging platform and agent system
- Location: `src/index.ts`
- Contains: Tool registration, message hooks, gateway lifecycle management
- Depends on: All modules below (scan-vault, load-word, record-mastery, etc.)
- Used by: OpenClaw gateway (external)

**Tool Layer (Agent Commands):**
- Purpose: Execute LLM-callable operations on vault state
- Location: `src/tools/`
- Contains: 8 tools (scan-vault, load-word, record-mastery, update-page, record-sighting, create-word, update-word-meta, vault-summary, prepare-review)
- Depends on: Vault, Page, SRS modules
- Used by: Plugin runtime via tool registration

**Vault & Config Layer (State Management):**
- Purpose: Read/write vault configuration, mastery state, sightings, and nudge queues
- Location: `src/vault.ts`
- Contains: Config loading, atomic file operations, path validation, sidecar mutation patterns
- Depends on: io-utils, types
- Used by: All tools, plugin runtime

**SRS Scheduler (Mastery Logic):**
- Purpose: Pure functional scheduling of Leitner box progression
- Location: `src/srs/scheduler.ts`
- Contains: Box interval constants, mastery threshold (85), box advancement logic, status derivation
- Depends on: types
- Used by: record-mastery, prepare-review, scheduler-based features

**Word Pages (Markdown I/O):**
- Purpose: Read/write word .md files (display layer for human readers)
- Location: `src/word-pages.ts`, `src/page-utils.ts`
- Contains: YAML frontmatter detection, word page file enumeration, atomic writes
- Depends on: io-utils, types
- Used by: load-word, update-page, fill-word-page

**Matching & Sighting Detection (Hook Layer):**
- Purpose: Detect captured words in outgoing messages using trie-based inflection-aware search
- Location: `src/matching/` (trie.ts, tokenizer.ts, inflect.ts, index.ts), `src/hooks/sighting-hook.ts`
- Contains: Tokenization, verb/noun inflection generation, trie insertion/search, sentence extraction
- Depends on: types, vault, page-utils
- Used by: message_received hook in plugin runtime

**Notifications & Crons:**
- Purpose: Schedule and emit nudges, weekly recaps, daily reviews
- Location: `src/notifications.ts`, `src/notify-utils.ts`, `src/watcher.ts`
- Contains: Nudge timing logic, recap scheduling, file system watcher for 24h nudge triggers
- Depends on: vault, types
- Used by: gateway_start hook in plugin runtime

**Utility & I/O:**
- Purpose: Atomic file operations, file locking, discovery bridge
- Location: `src/io-utils.ts`, `src/discovery.ts`
- Contains: Atomic writes with temporary files, proper-lockfile integration, macOS app discovery bridge
- Depends on: fs/promises, proper-lockfile
- Used by: Vault layer, all state mutations

## Data Flow

**Word Capture & Initial SRS Entry:**

1. User captures word via macOS app or `/hunt word` command in chat
2. `createWord()` calls `fill-word-page.ts` to fetch Cambridge dictionary definition
3. Page .md file created in words folder
4. `masteryEntry` created in mastery.json with box=1, status=learning, next_review=today+1
5. Word now appears in `scan_vault(filter='new')`

**Sighting Detection (Passive Hook):**

1. User sends outgoing message
2. `onOutgoingMessage()` hook fires (message_received event)
3. `MatchTrie` searches tokenized message for captured words and inflections
4. Direct hits extracted as `TrieMatch` objects
5. For each match: `recordSightingBatch()` appends to sightings.json
6. Sighting recorded but SRS state NOT changed (observation only)

**Mastery Practice Session:**

1. Agent calls `record_mastery(word, score, best_sentence)`
2. `advance()` scheduler evaluates: score >= 85 → success, else failure
3. Success: box advances (with interval lookup), status updates
4. Failure: box decreases by 1 (min floor: box 1)
5. New next_review calculated as today + BOX_INTERVALS[newBox]
6. If graduating (first reach mastered): `graduated=true` signal
7. mastery.json updated atomically
8. Optional: `update_page()` writes best_sentence or graduation note to .md

**Word State Queries:**

1. `scan_vault(filter)` reads mastery.json once → O(1) response
2. For filter='new': lists .md files not in mastery.json
3. For filter='due': filters by next_review <= today
4. For filter='all': returns all mastery entries with valid .md files
5. Returns ScannedWord[] (word, status, next_review, optional coaching_mode)

**Daily Review Preparation:**

1. Agent calls `prepare_review(date?)`
2. Reads mastery.json and sightings.json for target date
3. Groups words: new_arrivals (captured today), used_today (with sightings), due_not_used, dormant
4. Returns ReviewData with aggregates (total_sightings_today, dormant_count, days_overdue per word)

**Background Crons (15-min polling):**

1. gateway_start: initialize 3 intervals (nudge, weekly recap, daily review)
2. **Nudge check**: File watcher detects new .md files → queues nudge with nudge_due_at=now+24h
   - At nudge_due_at: emit notification "captured 24h ago, say let's review words"
   - Only fires if word has 0 sessions (not yet practiced)
3. **Weekly recap**: Check isWeeklyRecapDue() → emit aggregates (mastered, reviewing, learning counts)
4. **Daily review**: Check isDailyReviewDue() → emit "X words due for review, say daily review"
5. gateway_stop: clear all intervals and file watcher

**State Mutation Guarantees:**

- Atomic writes use temporary file + rename (os-level atomicity)
- File locks protect concurrent mutations to mastery.json, sightings.json, config.json
- Sidecar mutation pattern: read → fn() → write → unlock
- Content hash on update_page prevents concurrent overwrites of word pages

## Key Abstractions

**ToolResult<T>:**
- Purpose: Discriminated union (ok/error) for all tool returns
- Examples: `{ ok: true, data: T }` or `{ ok: false, error: ToolError }`
- Pattern: Used consistently across all tools for error propagation and agent feedback

**VaultConfig:**
- Purpose: Vault path and words folder location
- Fields: vault_path, words_folder (empty string for vault root)
- Pattern: Lazy-loaded once in plugin register(), reused in all tool calls

**WordEntry:**
- Purpose: Single-word SRS state in mastery.json
- Fields: box, status, score, last_practiced, next_review, sessions, failures, best_sentences, coaching_mode, synonyms
- Pattern: Immutable; mutations via record-mastery call

**MatchTrie:**
- Purpose: Trie data structure for O(|tokens|) word matching with inflection variants
- Methods: insert(word, forms, matchType), search(tokens) → TrieMatch[]
- Pattern: Built from mastery.json on each sighting hook (with mtime cache to avoid rebuilds)

**SightingEvent:**
- Purpose: Aggregated sightings for a minute/timestamp
- Fields: timestamp (ISO minute), channel, words (word → sentence extract), count
- Pattern: Daily aggregation in sightings.json (per-day buckets)

## Entry Points

**OpenClaw Plugin Entry:**
- Location: `src/index.ts` default export
- Triggers: OpenClaw gateway load
- Responsibilities: Tool registration, config bootstrap, hook setup, cron initialization

**Tools (8 total):**
- `scan_vault` — filter by status/due
- `load_word` — fetch .md + mastery state
- `record_mastery` — score a session, advance SRS
- `update_page` — write agent-generated content back
- `record_sighting` — manual sighting entry
- `create_word` — add new word to vault
- `update_word_meta` — change coaching_mode, synonyms
- `vault_summary` — aggregate stats
- `prepare_review` — bucket words for daily review session

**Message Hook:**
- Location: `src/hooks/sighting-hook.ts`, called by plugin at message_received
- Triggers: Every outgoing user message
- Responsibilities: Detect sightings, batch write to sightings.json, optionally extract sentences

**Background Crons:**
- Location: `src/index.ts` gateway_start handler
- Triggers: Plugin initialization (on gateway start)
- Responsibilities: Fire 3 polling intervals; watcher for nudge generation

## Error Handling

**Strategy:** All errors propagated via ToolError discriminated union. No thrown exceptions cross tool boundaries.

**Patterns:**
- Path validation before I/O: `assertInVault()` blocks traversal
- Word validation before file operations: `validateWord()` rejects invalid patterns
- Graceful degradation: Missing directories → empty lists, not errors
- Atomic writes: Temporary file cleanup on exception
- Lock cleanup: Finally blocks in `withFileLock()` ensure release
- Config resolution: Try discovery file → manual override → error with instructions

## Cross-Cutting Concerns

**Logging:** 
- `api.logger.info()` calls (OpenClaw plugin runtime API)
- Tool results include `{ ok, data/error }` logged as JSON

**Validation:**
- `validateWord()` — regex pattern for word characters, length limits
- `assertInVault()` — path traversal prevention
- Word page detection — YAML frontmatter + legacy callout checks

**Authentication:**
- Plugin-level: OAuth via OpenClaw (external)
- Vault access: File system permissions only

**Concurrency:**
- File locks via proper-lockfile (retries: 3, minTimeout 100ms)
- Atomic writes: temp file → rename
- Sidecar mutation: lock-read-fn-write-unlock pattern

---

*Architecture analysis: 2026-04-07*
