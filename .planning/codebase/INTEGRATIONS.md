# External Integrations

**Analysis Date:** 2026-04-07

## APIs & External Services

**Cambridge Dictionary:**
- Service: Cambridge Learner's Dictionary via HTML scraping
  - What it's used for: Fetch word definitions, pronunciations (RP/US), examples, word family, CEFR levels
  - Base URL: `https://dictionary.cambridge.org/dictionary/english/{word}`
  - Client: cheerio (HTML parser) - no official API client
  - Implementation: `src/cambridge-lookup.ts`
  - Auth: None required
  - Anti-detection: Realistic User-Agent header, Accept-Language: en-US/en, jitter delay (random 100-500ms)
  - Error handling: `CambridgeBlockedError` on HTTP 429/403, `CambridgeServerError` on 5xx
  - Timeout: 8000ms default (configurable)
  - HTTP Method: GET with headers for realistic browser simulation

**OpenClaw Gateway:**
- Service: OpenClaw plugin runtime / gateway
  - What it's used for: Plugin registration, tool execution, message hooks, config management, notifications
  - Type: In-process via peer dependency
  - SDK: `openclaw/plugin-sdk/plugin-entry` for `definePluginEntry`
  - API contracts:
    - `api.registerTool({name, description, parameters, execute})` - Register agent tools
    - `api.on('message_received', handler)` - Hook for sighting detection
    - `api.on('gateway_start', handler)` - Hook for background cron tasks
    - `api.pluginConfig` - Access user configuration (vault_path, recap_channel)
    - `api.logger` - Plugin logging interface
  - Notifications: `api.notify({title, body, icon})` for in-app alerts
  - Version requirement: >=2026.3.22

## Data Storage

**Local File System:**
- Storage method: JSON files in vault directory
- Vault structure:
  - `.wordshunter/config.json` - Plugin configuration bridge (vault_path, words_folder, primary_channel, timing)
  - `.wordshunter/mastery.json` - Master state file (all word entries with spaced repetition data)
  - `.wordshunter/sightings.json` - Word usage tracking (timestamp, channel, speaker for each sighting)
  - `.wordshunter/nudges.json` - Queue of pending review reminders
  - `{words_folder}/*.md` - Individual word page files (content/display layer)

**Atomic Writes:**
- Coordination: `proper-lockfile` for file-level locking
- Pattern: All writes to mastery.json and sightings.json use lockfile to prevent concurrent modification
- Implementation: `src/io-utils.ts` provides `writeTextFileAtomic()` and lock management functions

**Sidecar Config Bridge:**
- Purpose: Share configuration between macOS app and OpenClaw plugin
- File: `~/.wordshunter/discovery.json` (shared discovery file written by app on settings change)
- Contains: `words_directory`, `words_folder`, app metadata
- Fallback: Plugin config `vault_path` if discovery file missing
- Implementation: `src/discovery.ts` with `readDiscovery()`, `writeDiscovery()`

## Message Bus / Events

**Incoming Messages Hook:**
- Integration: `api.on('message_received', handler)` from OpenClaw SDK
- Handler: `src/hooks/sighting-hook.ts` implements `onOutgoingMessage`
- Purpose: Auto-detect word sightings in conversational messages
- Writes to: `.wordshunter/sightings.json` (records timestamp, channel, speaker)
- Matching engine: Trie-based inflection matching for word variants (`src/matching/`)

**Gateway Startup Hook:**
- Integration: `api.on('gateway_start', handler)` from OpenClaw SDK
- Purpose: Start file watcher (`src/watcher.ts`) and cron tasks for daily/weekly reviews
- Crons: Daily review nudge, weekly recap notification

## Authentication & Identity

**Plugin Context:**
- Auth mechanism: No explicit auth; plugin runs within OpenClaw gateway process
- Identity: Plugin operates as `words-hunter` (from `openclaw.plugin.json` id)
- Config access: Via `api.pluginConfig` (user-provided at plugin install time)
- Logging: Via `api.logger` interface provided by OpenClaw

**Message Metadata:**
- User context: `speaker` field in sighting records
- Channel context: `channel` field in sighting records and config
- No persistent user/auth model — values come from OpenClaw gateway context

## File System Integration

**Watcher:**
- Service: fs.watch via chokidar
- What it's used for: Auto-detect when .md word pages are edited in vault
- Implementation: `src/watcher.ts`
- Behavior: Watches `{vault_path}/{words_folder}` for create/modify events, restarts on error with exponential backoff
- Used by: Message/content sync workflows

**CLI Repair Tool:**
- Binary: `words-hunter` (installed via `npm install -g` or `npx`)
- Entry point: `src/cli/repair.ts`
- Purpose: Offline validation and repair of vault integrity
- Implementation: Runs Node.js directly without OpenClaw runtime

## Notification System

**In-App Notifications:**
- Service: OpenClaw native notifications via `api.notify()`
- Used for: Daily review reminders, weekly recap alerts
- Implementation: `src/notify-utils.ts` wraps API calls
- Metadata: Title, body, icon from plugin context

**Notification Cron Schedule:**
- Daily review nudge: Configurable hour (default: stored in sidecar config)
- Weekly recap: Configurable day + hour (default: stored in sidecar config)
- Implementation: `src/notifications.ts` handles `isWeeklyRecapDue()`, `isDailyReviewDue()`, `resolveRecapChannel()`

## Webhook & Callback Points

**Message Received Hook:**
- Triggers: Every message in any OpenClaw channel where plugin is active
- Handler: `src/hooks/sighting-hook.ts`
- Output: Records word sightings to `.wordshunter/sightings.json`
- Processing: Word matching via trie, inflection detection

**Gateway Startup Hook:**
- Triggers: Once when OpenClaw gateway initializes
- Handler: Registered in `src/index.ts` via `api.on('gateway_start')`
- Output: Starts file watcher, initializes scheduled tasks

## Environment Configuration

**Required env vars:**
- None explicitly — all config via `api.pluginConfig` from OpenClaw

**Configuration paths (resolution order):**
1. `~/.wordshunter/discovery.json` (shared with macOS app if available)
2. `api.pluginConfig.vault_path` (manual plugin config override)
3. Error if neither found

**Vault structure discovery:**
- Auto-read from `{vault_path}/.wordshunter/config.json` if exists
- Falls back to vault root if bridge missing

## Data Flow & Timing

**Word Creation Flow:**
- Tool: `create_word` (manual or via agent)
- Fetch: Cambridge Dictionary via `cambridgeLookup()` HTTP request
- Enrich: Parse definitions, examples, word family
- Write: New .md page + mastery.json entry (with lockfile)
- Implementation: `src/tools/create-word.ts`

**Sighting Recording Flow:**
- Trigger: Message hook detects word in conversation
- Match: Trie-based inflection search against known words
- Write: Append to sightings.json with timestamp, channel, speaker
- Implementation: `src/hooks/sighting-hook.ts`

**Daily Review Flow:**
- Cron: Check if due via `isDailyReviewDue()`
- Tool: `prepare_review` collects due words from mastery.json
- Send: Notify user, push words to SRS scheduler
- Implementation: `src/tools/prepare-review.ts`

**Weekly Recap Flow:**
- Cron: Check if due via `isWeeklyRecapDue()`
- Fetch: Summary statistics from mastery.json and sightings.json
- Send: Aggregated progress report to recap_channel (configurable)
- Implementation: Initiated via gateway_start hook, tracked in sidecar config timing fields

---

*Integration audit: 2026-04-07*
