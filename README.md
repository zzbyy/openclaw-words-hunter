# Words Hunter — OpenClaw plugin

[CI](https://github.com/zzbyy/openclaw-words-hunter/actions/workflows/ci.yml)
[License: MIT](LICENSE)

Vocabulary mastery inside your AI conversations. Words Hunter connects your [Obsidian](https://obsidian.md) vocab notes to [OpenClaw](https://openclaw.ai) so you can practice, track, and get coached on the words you're studying — without leaving the chat.

---

## How it works

When you encounter a word worth learning, the [Words Hunter macOS app](https://github.com/zzbyy/words-hunter) captures it into your Obsidian vault. Each word gets a `.md` note with Cambridge Dictionary definitions, pronunciation, example sentences, and a spaced-repetition schedule.

This plugin bridges that vault to your OpenClaw AI agent:

1. **Practice** — `/vocab` starts a session for today's due words. The agent quizzes you, scores your sentences, and advances your SRS schedule.
2. **Track sightings** — every outgoing message is scanned for your vocab words. When you use one naturally, it's logged as a sighting in the word's note.
3. **Proactive coaching** — enable inline feedback per word: when you use it in a message, the agent replies with a quick confirmation and box status. If you use a weaker synonym of a word you're studying, the agent nudges you to consider the stronger one.

---

## Features

### Spaced repetition (SRS)

Words move through a 5-box Leitner system. Practice threshold is **85/100**:

- Score ≥ 85 → box advances, next review pushed out
- Score < 85 → box drops, scheduled sooner

Each practice session scores your original sentences across meaning (15pts), register (10pts), collocation (10pts), and grammar (5pts), scaled to 0–100.

### Sighting detection

The plugin monitors your outgoing messages for captured vocab words using word-boundary matching (case-insensitive). Every sighting is appended to the word's `## Sightings` section. Passive, automatic.

### Proactive coaching (on by default)

When you use a vocab word in a message, a quiet coaching footnote is appended to the agent's reply:

> `#vocab deliberate — done on purpose. Nice use, keep it up.`

When you use a weaker synonym of a word you're studying, the agent nudges you:

> `#vocab you wrote "suggest" — consider "posit" (to assert as fact). Box 2.`

Coaching is automatic for all words below Box 4 (mastered). No setup needed. Mastered words are sighted silently. To suppress footnotes for a noisy word, use `set coaching <word> silent`.

Synonyms are stored per-word (via `extract synonyms`) and matched at runtime with zero LLM cost. Common synonyms (appearing across too many vault words) are automatically filtered out.

### Weekly recap

Every Sunday at 9am, a summary is sent to your primary channel:

> Weekly vocab recap: 12 words total — 3 mastered, 4 reviewing, 5 learning. Today: 2 due.

---

## Commands

### Session commands


| Phrase                 | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `let's review words`   | Start a practice session for today's due words                 |
| `any words to review?` | Same as above                                                  |
| `show my words`        | Vault summary: total, mastered, reviewing, learning, due today |


### Capturing words


| Phrase                | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `add word <word>`     | Capture a word from chat (handled by message hook) |
| `add words <w1> <w2>` | Capture multiple words at once                     |
| `hunt <word>`         | Same as `add word`                                 |
| `vocab add <word>`    | Same as `add word`                                 |


All patterns create the `.md` note and register the word at box 1 due today. If the word already exists, it's skipped. More natural phrasing like "I want to study ephemeral" is handled by the agent via the `create_word` tool.

### Coaching controls


| Command                      | What it does                                           |
| ---------------------------- | ------------------------------------------------------ |
| `set coaching <word> silent` | Silence coaching footnotes for this word               |
| `set coaching <word> inline` | Re-enable coaching footnotes (restores default)        |
| `coaching status`            | List words with coaching silenced                      |
| `extract synonyms <word>`    | Extract and store synonyms for synonym nudge detection |


**Examples:**

```
set coaching posit silent
→ "Coaching silenced for posit. No more footnotes when you use it."

coaching status
→ "Silenced: posit. All others: coaching on (default)."

extract synonyms posit
→ "Synonyms for posit: suggest, propose, assert, claim, hypothesize. Stored."
```

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
| `recap_channel` | first session channel | Channel ID for the weekly Sunday recap. Defaults to whichever channel your first `/vocab` session ran in.                                  |


---

## Data storage

All data lives inside your Obsidian vault under `.wordshunter/`:


| File                               | Contents                                                         |
| ---------------------------------- | ---------------------------------------------------------------- |
| `.wordshunter/mastery.json`        | SRS schedule, box positions, scores, coaching settings, synonyms |
| `.wordshunter/pending-nudges.json` | Nudge queue for 15-minute overdue reminders                      |
| `.wordshunter/config.json`         | Plugin config (vault path, channel settings)                     |


Each word also has a `.md` note in your words folder (default: vault root) with definitions, sightings history, best sentences, and the `> [!mastery]` callout showing current box and schedule.

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
# or
bun test
```

### Repair CLI

If the `> [!mastery]` callouts in your word notes drift out of sync with `mastery.json` (e.g. after manual edits), regenerate them:

```bash
npm run repair -- --vault /absolute/path/to/your/vault
```

`--vault` defaults to the current working directory. When the `words-hunter` binary is on your PATH: `words-hunter repair`.

---

## Architecture

```
src/
  index.ts              Plugin entry point — tool registration, message hook, cron jobs
  types.ts              Shared types (WordEntry, PluginRuntime, ScannedWord, ...)
  vault.ts              mastery.json read/write with file locking
  notify-utils.ts       Shared notification sender (channel or logger fallback)
  coaching-format.ts    Footnote formatter for coaching notes in agent replies
  hooks/
    sighting-hook.ts    Outgoing message scanner — word cache + synonym cache
  tools/
    scan-vault.ts       List vault words by filter (due / new / all)
    load-word.ts        Load a word's full page into context
    record-mastery.ts   Record a practice session, advance SRS schedule
    record-sighting.ts  Append a sighting to the word's .md note
    update-page.ts      Write agent-generated content to a word page
    update-word-meta.ts Update coaching_mode / synonyms without touching SRS state
    create-word.ts      Create a new word page + mastery entry
    vault-summary.ts    Return aggregate vault stats
  srs/
    scheduler.ts        Leitner box advancement logic
  notifications.ts      Weekly recap timing helpers
  watcher.ts            File watcher for vault changes
  cli/
    repair.ts           Repair CLI — regenerate callouts from mastery.json
```

The sighting hook uses a two-cache design: a **word cache** for exact matches and a **synonym cache** for nudge detection. Both share a single `mastery.json` mtime check — one `fs.stat` per message, caches invalidated only when the file changes. Synonym lookup is O(1) via a pre-built `Map<word, entry>` index.

Coaching footnotes are appended to agent replies via the `message_sending` hook. The sighting hook detects words and returns coaching data; the `message_sending` hook formats and appends it to the outgoing message. Zero LLM cost for coaching.

---

## Privacy

The sighting hook scans your **outgoing messages locally on your machine**. It uses word-boundary regex against your vocab list.

- Nothing is sent to external servers for sighting detection.
- Only the matched word, timestamp, and sentence context are written to your local Obsidian `.md` note.
- The hook fires on your outgoing messages only — not on messages you receive or the agent's replies.
- Inline coaching notifications are sent to the same channel as the triggering message.

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