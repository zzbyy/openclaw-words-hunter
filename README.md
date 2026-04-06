# Words Hunter — OpenClaw plugin

[CI](https://github.com/zzbyy/openclaw-words-hunter/actions/workflows/ci.yml)
[License: MIT](LICENSE)

Vocabulary mastery inside your AI conversations. Words Hunter connects your [Obsidian](https://obsidian.md) vocab notes to [OpenClaw](https://openclaw.ai) so you can practice, track, and review the words you're studying — without leaving the chat.

---

## How it works

When you encounter a word worth learning, the [Words Hunter macOS app](https://github.com/zzbyy/words-hunter) captures it into your Obsidian vault. Each word gets a `.md` note with Cambridge Dictionary definitions, pronunciation, example sentences, and a spaced-repetition schedule.

This plugin bridges that vault to your OpenClaw AI agent:

1. **Practice** — start a session for today's due words. The agent quizzes you, scores your sentences, and advances your SRS schedule.
2. **Silent sighting detection** — every outgoing message is scanned for your vocab words (including inflected forms like "posited" for "posit"). Sightings are logged silently to `.wordshunter/sightings.json` — no interruptions during conversation.
3. **Daily vocab review** — a dedicated review session evaluates how you used words in real conversation, introduces new captures, and runs practice for due words.

---

## Features

### Spaced repetition (SRS)

Words move through a 5-box Leitner system. Practice threshold is **85/100**:

- Score ≥ 85 → box advances, next review pushed out
- Score < 85 → box drops, scheduled sooner

Each practice session scores your original sentences across meaning (15pts), register (10pts), collocation (10pts), and grammar (5pts), scaled to 0–100.

### Sighting detection

The plugin monitors your outgoing messages for captured vocab words using a **trie-based matcher with inflection-aware forward expansion**. "posit" catches "posits", "posited", "positing" — but "deposit" does not match.

Sightings are stored in `.wordshunter/sightings.json` as event-based records with minute-precision timestamps. Word pages are not modified. Detection is silent — no footnotes, no interruptions.

Duplicate detection: if the same sentence is sent twice, it increments a count on the existing event. Auto-prune: entries older than 90 days are removed on write.

### Daily vocab review

Triggered by vocab-specific phrases like "daily vocab review" or "review my words." The review walks through three steps:

1. **Usage review** — evaluates sighting sentences against word definitions. Correct usage advances SRS; misuse drops it.
2. **New arrivals** — introduces words captured today with definitions and examples.
3. **Practice** — offers to practice words that are due for SRS review.

### Weekly recap

Every Sunday at 9am, a notification prompts the user to start a weekly vocab review with aggregated stats.

Daily review notification fires at 9pm.

---

## Commands

### Session commands

| Phrase                   | What it does                                                   |
| ------------------------ | -------------------------------------------------------------- |
| `let's review words`     | Start a practice session for today's due words                 |
| `what words are due?`    | Same as above                                                  |
| `daily vocab review`     | Start a daily review (usage evaluation + new arrivals + practice) |
| `review my words`        | Same as daily vocab review                                     |
| `show my words`          | Vault summary: total, mastered, reviewing, learning, due today |

All trigger phrases must contain a vocab domain keyword (`word(s)`, `vocab`, `vocabulary`, `word vault`, `hunt`). Generic phrases like "daily review" or "what's due?" are not treated as vocab triggers.

### Capturing words

| Phrase                | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `add word <word>`     | Capture a word from chat (handled by message hook) |
| `add words <w1> <w2>` | Capture multiple words at once                     |
| `hunt <word>`         | Same as `add word`                                 |
| `vocab add <word>`    | Same as `add word`                                 |

All patterns create the `.md` note and register the word at box 1 due today. If the word already exists, it's skipped. More natural phrasing like "I want to learn the word ephemeral" is handled by the agent via the `create_word` tool.

---

## Install

**One command:**

```bash
curl -fsSL https://raw.githubusercontent.com/zzbyy/openclaw-words-hunter/main/install.sh | sh
```

**Or manually:** download `words-hunter-openclaw.tgz` from the [latest release](https://github.com/zzbyy/openclaw-words-hunter/releases/latest), then:

```bash
openclaw plugins install /path/to/words-hunter-openclaw.tgz
```

Add `words-hunter` to `plugins.allow` in your OpenClaw config if you use an allowlist.

---

## Configuration

Set these in OpenClaw's plugin config UI or directly in `openclaw.plugin.json`:

| Key             | Default               | Description                                                                                                                                |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `vault_path`    | auto                  | Absolute path to your Obsidian vault. Usually auto-discovered from the Words Hunter macOS app — set manually only if auto-discovery fails. |
| `recap_channel` | first session channel | Channel ID for notifications. Defaults to whichever channel your first session ran in.                                                     |

---

## Data storage

All data lives inside your Obsidian vault under `.wordshunter/`:

| File                               | Contents                                                         |
| ---------------------------------- | ---------------------------------------------------------------- |
| `.wordshunter/mastery.json`        | SRS schedule, box positions, scores, coaching settings, synonyms |
| `.wordshunter/sightings.json`      | Sighting events — per-message records with timestamps and word→sentence mapping |
| `.wordshunter/pending-nudges.json` | Nudge queue for 24h capture reminders                            |
| `.wordshunter/config.json`         | Plugin sidecar config (vault path, channel, last review timestamps) |

Each word also has a `.md` note in your words folder (default: `Words/`) with definitions, best sentences, and the `> [!mastery]` callout showing current box and schedule.

### Sightings schema (v2)

```json
{
  "version": 2,
  "days": {
    "2026-04-05": [
      {
        "timestamp": "2026-04-05T21:15",
        "channel": "telegram",
        "words": {
          "deliberate": "The deliberate strategy was to suppress the report.",
          "suppress": "The deliberate strategy was to suppress the report."
        },
        "count": 2
      }
    ]
  }
}
```

One event per message. `words` maps each detected word to its sentence extract. `count` tracks duplicate sends. Day-keyed for fast date lookups.

---

## Development

```bash
git clone https://github.com/zzbyy/openclaw-words-hunter.git
cd openclaw-words-hunter
npm install && npm run build
openclaw plugins install -l .
```

Run tests:

```bash
npm test
```

### Repair CLI

If the `> [!mastery]` callouts in your word notes drift out of sync with `mastery.json` (e.g. after manual edits), regenerate them:

```bash
npm run repair -- --vault /absolute/path/to/your/vault
```

---

## Architecture

```
src/
  index.ts                Plugin entry — tool registration, message hooks, cron jobs
  types.ts                Shared types (WordEntry, SightingsStore, ReviewData, ...)
  vault.ts                mastery.json + sightings.json I/O with file locking
  notify-utils.ts         Notification sender (channel or logger fallback)
  notifications.ts        Weekly recap + daily review timing helpers
  discovery.ts            macOS app discovery.json integration
  importer.ts             Auto-import untracked words on startup
  cambridge-lookup.ts     Cambridge Dictionary HTML parser
  fill-word-page.ts       Auto-fill word pages with Cambridge data
  page-utils.ts           Markdown section parsing and rendering
  word-pages.ts           Word note file I/O
  io-utils.ts             Atomic file writes, file locking
  watcher.ts              File watcher for 24h capture nudges
  hooks/
    sighting-hook.ts      Outgoing message scanner — trie-based inflection matching
  matching/
    index.ts              Barrel export for matching engine
    trie.ts               Word-level trie for O(message_length) matching
    inflect.ts            Rule-based English inflection (plurals, past tense, -ing)
    tokenizer.ts          Message tokenization preserving hyphens/apostrophes
  tools/
    scan-vault.ts         List vault words by filter (due / new / all)
    load-word.ts          Load a word's full page into context
    record-mastery.ts     Record a practice session, advance SRS schedule
    record-sighting.ts    Record sighting events to sightings.json (batch + dedup)
    prepare-review.ts     Bucket words for daily review (used today / new / due / dormant)
    update-page.ts        Write agent-generated content to a word page
    update-word-meta.ts   Update coaching_mode / synonyms without touching SRS state
    create-word.ts        Create a new word page + mastery entry
    vault-summary.ts      Return aggregate vault stats
  srs/
    scheduler.ts          Leitner box advancement logic
  cli/
    repair.ts             Repair CLI — regenerate callouts from mastery.json
```

### Sighting detection flow

```
User sends message
  → message_received hook fires
  → sighting-hook tokenizes message, runs trie search with inflection forms
  → direct hits collected into batch: [{ word, sentence }, ...]
  → ONE call to recordSightingBatch → ONE lock/read/write to sightings.json
  → dedup: if same sentence exists today, increment count
  → auto-prune: days > 90 dropped
```

The trie is built from `mastery.json` at startup and rebuilt when the file changes (mtime check). Each word is expanded into its inflected forms (e.g., "posit" → ["posit", "posits", "posited", "positing"]) and inserted into the trie. Matching is O(message_length), independent of vocabulary size.

### Daily review flow

```
User says "daily vocab review"
  → agent calls prepare_review(date?)
  → reads mastery.json + sightings.json
  → buckets words: used_today (with sightings), new_arrivals, due_not_used, dormant
  → agent walks through three steps: usage evaluation → introductions → practice
  → calls record_mastery for each evaluated word
```

---

## Privacy

The sighting hook scans your **outgoing messages locally on your machine**. It uses a trie-based word matcher against your vocab list.

- Nothing is sent to external servers for sighting detection.
- Matched words are stored in `.wordshunter/sightings.json` inside your vault.
- Word `.md` pages are not modified by sighting detection.
- The hook fires on your outgoing messages only — not on messages you receive or the agent's replies.

---

## Update

Download the new release tarball and re-run the install command. Archive installs are not tracked by `openclaw plugins update`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
