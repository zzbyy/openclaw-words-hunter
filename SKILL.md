# Words Hunter Mastery Skill

Vocabulary mastery through natural conversation. This skill runs a practice session
for any captured Words Hunter vocabulary.

---

## Trigger commands

The following phrases start a session or show vault status. Recognize the **intent**,
not the exact wording. When the user asks about their vocab, wants to review, or asks
what's due, treat it as a trigger.

**Start a mastery session** (call `scan_vault(filter="due")`):
- "let's review words"
- "any words to review today?"
- "what's due?"
- "vocab time"
- "practice vocabulary"

**Start a daily review** (call `prepare_review()`):
- "daily review"
- "how did I do today?"
- "review my words"
- "vocab review"

**Show vault summary** (call `vault_summary`):
- "show my words"
- "what do I have in my word vault?"
- "vocab status"
- "how many words do I have"

---

## Session flow

### 1. Scan

Call `scan_vault(filter="due")`. If no due words:
> "Nothing due today! Your next word is due on {earliest next_review date}.
> Say 'let's review words' anytime to practice early."

If due words found:
> "You have {N} word(s) to practice today: {word list}.
> Let's start with **{first word}**."

### 2. Load

Call `load_word(word)`. Use the page content to:
- Show the word's definition context (from ## Meanings section)
- Show prior mastery data (box, score, last practiced, failures)
- Briefly introduce the word: definition, register, usage context

### 3. Check for unfilled placeholders (fallback only)

Word pages are auto-filled from Cambridge Dictionary when the word is captured.
Most pages will already have definitions, pronunciations, and examples.

If `## Meanings` still contains `{{meanings}}` or is clearly empty (Cambridge lookup
failed or timed out):
> "I'll fill in the blanks for '{word}' — one moment."

Write what you know about the word via `update_page`. Use your own knowledge of the
word's meaning, register, and common collocations. Keep it brief: one clear definition,
two example sentences. Do NOT call any external API.

### 4. Production practice

Ask the user to write an original sentence using the word. At least 3 exchanges.

**First prompt:**
> "Use **{word}** in a sentence — any context works."

**Feedback format** (one reply per sentence):
- Note what works (collocation, register, grammar)
- Correct any errors briefly
- Ask for another attempt or provide a contrast: "Now try it in a formal context" or
  "What's the difference between {word} and {near-synonym}?"

**Goal**: by the end of the practice block, the user has produced at least one sentence
that demonstrates genuine understanding.

### 5. Score

After 3+ exchanges, score the best sentence using this rubric:

| Component | Max | What you're measuring |
|-----------|-----|-----------------------|
| Meaning | 15 | Does the usage demonstrate correct understanding? |
| Register | 10 | Right formality for the context? |
| Collocation | 10 | Natural word combinations? |
| Grammar | 5 | Grammatically correct? |
| **Total** | **40** | Scaled to 0–100 |

Scaling: `score = round((raw / 40) * 100)`

Mastery threshold: **85/100** (≥ 85 = box advances, < 85 = box drops).

### 6. Record

Call `record_mastery(word, score, best_sentence?, failure_note?)`.

- If score ≥ 85: include `best_sentence` (the user's best sentence)
- If score < 85: include `failure_note` describing the confusion pattern (e.g., "confused register — used formal word in casual context")

**After recording:**
- Score ≥ 85: "Nice! '{best_sentence}' — that's exactly right. Box {old}→{new}."
- Score < 85: "Almost — the main issue was {failure_note}. Box {old}→{new}. We'll revisit this in {interval} days."

**If graduated (box 4 reached for first time):**
> "You've mastered **{word}**! 🎉"
Generate a memorable sentence using the word. Call `update_page(word, graduation_sentence=...)`.
The sentence must be **non-empty**, include **{word}** as a whole word (case-insensitive), and be **≤200 characters**; otherwise the tool returns `INVALID_GRADUATION` and the page is not updated.
Send the celebration message to the channel.

### 7. Next word

Move to the next due word. Repeat steps 2–6.

### 8. Session complete

After all due words:
> "Session done! {N} words reviewed.
> Mastered today: {graduation_words or 'none'}.
> Next session: {earliest next_review date}.
> Say 'let's review words' to practice early, or 'show my words' for stats."

---

## Scoring rubric examples

| Sentence | Meaning | Register | Collocation | Grammar | Total (scaled) |
|----------|---------|----------|-------------|---------|----------------|
| "I posit that dark matter exists." | 14 | 9 | 9 | 5 | 37 → 93 |
| "posit me a sandwich" (wrong usage) | 1 | 5 | 0 | 4 | 10 → 25 |
| "She posited her theory carefully." | 12 | 8 | 8 | 5 | 33 → 83 |

---

## Session timeout

If the user stops responding mid-session:
- After **60 minutes** of no reply: send once:
  > "Session paused — say 'let's review words' when you're ready. Progress so far has been saved."
- Save any mastery records already written. The session state is not held in memory —
  next /vocab will resume with any remaining due words.

---

## Sighting detection (passive — no user interaction)

The sighting hook fires independently on every outgoing message. When a captured word
(or its inflected form) appears in a message the user sends, `record_sighting` is called
automatically. Sightings are logged silently — no footnotes or interruptions during
conversation. The sighting data is used during the daily review.

---

## Daily review

### Trigger commands

**Start a daily review** (call `prepare_review()`):
- "daily review"
- "how did I do today?"
- "review my words"
- "vocab review"

**Review a past day** (call `prepare_review(date="YYYY-MM-DD")`):
- "how did I do yesterday?"
- "review last Tuesday"

### Review flow

Call `prepare_review()`. The tool returns words bucketed into four groups.
Process them in this order:

#### Bucket 2: Usage review (used_today) — process first

For each word the user used in conversation today:

1. Show the sighting sentence(s)
2. Evaluate each sentence against the word's definitions (from the page content):
   - Does the usage demonstrate correct understanding of the meaning?
   - Is the register appropriate for the context?
   - Are the collocations natural?
3. Classify as:
   - **Well used** — affirm the usage, call `record_mastery(word, score=90)` to advance SRS
   - **Misused/awkward** — explain what went wrong, show a corrected version, give
     an example of correct usage, call `record_mastery(word, score=40, failure_note="...")`

Format per word:
> **deliberate** (Box 2 → 3) ✓
> You wrote: "The deliberate attempt to suppress the report."
> Correct use as adjective meaning "intentional." Natural collocation with "attempt."

> **posit** (Box 3 → 2) ✗
> You wrote: "I posit this sandwich is good."
> "Posit" is formal/academic — it means to assert as a basis for argument.
> Better: "I posit that linguistic determinism shapes cultural perception."

#### Bucket 1: New arrivals (new_arrivals)

For each word captured today but not yet used:
- Show the primary definition from the page content
- Give 2 example sentences demonstrating correct usage
- Invite: "Try using **{word}** in conversation tomorrow."

#### Bucket 3: Due for practice (due_not_used)

Words that were due for review but didn't come up naturally. Transition into the
existing practice session flow (Steps 2–8 from "Session flow" above):
> These words were due but didn't come up today: **ephemeral**, **cogitate**
> Let's practice them now. Starting with **ephemeral**...

If the user declines ("skip", "not now", "later"), acknowledge and move on.

#### Bucket 4: Dormant

Mention briefly at the end:
> {dormant_count} other words sleeping until their next review date.

### Review summary

End with:
> **Summary:** {used_count} words used, {good_count} well used, {misused_count} needs work.
> {new_count} new words to explore. {due_count} due for practice.

---

## Weekly review

Extends the daily review with weekly perspective. Triggered automatically on
Sunday 9am or manually ("weekly review", "how was my week?").

Run the daily review for today, then add a weekly summary:
> **This week:** {total_sightings} sightings across {unique_words} words.
> SRS advances: {count} | Drops: {count} | New words: {count}

---

## Daily review notification (9pm, primary channel)

Sent automatically. Prompts the user to start a review:
> Daily vocab review ready — {N} words tracked, {M} due. Say "daily review" to start.

## Weekly recap notification (Sunday 9am, primary channel)

Sent automatically. Prompts the user to start a weekly review:
> Weekly vocab review — {N} words, {mastered} mastered, {reviewing} reviewing, {learning} learning. Say "weekly review" for details.

---

## Privacy

The sighting hook reads your outgoing messages locally to check for captured words.
Only the matched word + timestamp + sentence is stored in the `.md` file in your vault.
Nothing is sent to external servers. The hook only fires on your outgoing messages,
not on messages you receive.

---

## On-demand commands

| Phrase | What happens |
|--------|-------------|
| "let's review words" | Start mastery session for due words |
| "show my words" | Vault summary (total, mastered, reviewing, learning, due) |
| "add word posit" | Capture a word (handled by message hook, no agent needed) |
| "add words alpha beta" | Capture multiple words at once |
| "hunt posit" | Same as "add word" |
| "vocab add posit" | Same as "add word" |

`vault_summary` is called for all summary-like requests. Format:
> You have **{total}** words: {mastered} mastered, {reviewing} reviewing, {learning} learning.
> {due_today} due today. Last session: {last_session or 'never'}.

### Adding words from chat

The message hook recognizes these patterns directly (no agent reasoning needed):
  > "add word ephemeral"
  > "add this word posit"
  > "add words liminal cogitate spawn"
  > "hunt ephemeral"
  > "vocab add posit"

For more natural phrasing, the agent calls the `create_word` tool:
  > "I want to study ephemeral"
  > "capture the word liminal"

All paths create the word page and register it in `mastery.json` (box 1, due today). If the page already exists, a `FILE_EXISTS` message is returned instead of overwriting.

**extract synonyms [word]** — extract and store synonyms (LLM-driven).
  Agent calls: load_word({ word }), reads content, synthesizes synonyms (max 5, lowercase),
  then calls: update_word_meta({ word, synonyms: [...] })
  Reply: "Synonyms for [word]: suggest, propose, assert. Stored."
