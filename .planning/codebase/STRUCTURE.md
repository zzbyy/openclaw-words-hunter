# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```
openclaw-words-hunter/
├── src/                       # TypeScript source root
│   ├── index.ts               # Plugin entry point, tool registration, hooks, crons
│   ├── types.ts               # Discriminated unions, interfaces (ToolResult, WordEntry, VaultConfig)
│   ├── vault.ts               # Config/state I/O, atomic writes, path validation, sidecar mutations
│   ├── srs/
│   │   └── scheduler.ts       # Pure Leitner SRS logic (box advancement, intervals, status)
│   ├── tools/                 # 8 Agent-callable tools
│   │   ├── scan-vault.ts      # List words by filter (all/due/new)
│   │   ├── load-word.ts       # Fetch word .md + mastery state
│   │   ├── record-mastery.ts  # Score session, advance SRS, update mastery.json
│   │   ├── update-page.ts     # Write best sentences, graduation notes to .md
│   │   ├── record-sighting.ts # Append sighting to sightings.json
│   │   ├── create-word.ts     # New word: .md + Cambridge lookup + mastery entry
│   │   ├── vault-summary.ts   # Aggregate stats (total, mastered, reviewing, learning, due)
│   │   ├── prepare-review.ts  # Bucket words for daily review session
│   │   └── update-word-meta.ts # Change coaching_mode, synonyms (no SRS change)
│   ├── hooks/
│   │   └── sighting-hook.ts   # Detect word usage in messages via trie matcher
│   ├── matching/              # Word detection & inflection
│   │   ├── trie.ts            # Trie data structure for O(|tokens|) search
│   │   ├── tokenizer.ts       # Split text into lowercase tokens
│   │   ├── inflect.ts         # Generate verb/noun forms (runs, running, ran, etc.)
│   │   └── index.ts           # Public exports
│   ├── word-pages.ts          # Detect/list/read .md word pages
│   ├── page-utils.ts          # Markdown manipulation (sections, callouts, regex patterns)
│   ├── io-utils.ts            # Atomic file writes, file locking primitives
│   ├── notifications.ts       # Cron timing logic (weekly recap, daily review, nudges)
│   ├── notify-utils.ts        # Emit plugin notifications to channels
│   ├── watcher.ts             # File system watcher for 24h nudge generation
│   ├── discovery.ts           # macOS app bridge (shared discovery.json)
│   ├── importer.ts            # One-time: import untracked .md files as new words
│   ├── cambridge-lookup.ts    # Cheerio-based Cambridge dictionary scraper
│   ├── fill-word-page.ts      # Create .md template with definition from Cambridge
│   ├── sdk-shim.ts            # TypeScript type stubs for OpenClaw SDK
│   └── proper-lockfile.d.ts   # Type definition for proper-lockfile npm package
├── tests/                     # Test root (vitest)
│   ├── scheduler.test.ts      # SRS advance/status/isDue
│   ├── vault.test.ts          # Config, path validation, sidecar mutations
│   ├── matching/              # Trie, tokenizer, inflect tests
│   │   ├── trie.test.ts
│   │   ├── tokenizer.test.ts
│   │   └── inflect.test.ts
│   ├── sighting-hook.test.ts  # Hook cache, sentence extraction
│   ├── record-mastery.test.ts # SRS state transitions
│   ├── scan-vault.test.ts     # Filter logic, file checks
│   ├── load-word.test.ts      # Fetch .md + mastery, hash
│   ├── update-page.test.ts    # Content hash collision, section insertion
│   ├── record-sighting.test.ts # Sighting batch appends
│   ├── prepare-review.test.ts # Review bucketing, overdue calculation
│   ├── vault-summary.test.ts  # Aggregate counting
│   ├── notifications.test.ts  # Recap/review/nudge timing
│   ├── watcher.test.ts        # File watcher nudge generation
│   ├── update-word-meta.test.ts # Meta-only mutations
│   ├── cambridge-lookup.test.ts # HTML parsing
│   ├── repair.test.ts         # CLI repair command
│   ├── importer.test.ts       # Untracked file import
│   ├── graduation-guard.test.ts # Graduation section validation
│   ├── fixtures/              # Test data
│   │   ├── sample-word-page.md # Example .md format
│   │   ├── mastery.json       # Example mastery state
│   │   └── ...
│   ├── evals/                 # Evaluation tests (not run in normal vitest)
│   ├── integration/           # Integration tests (not run in normal vitest)
│   └── matching/              # Matching-specific tests
├── src/cli/
│   └── repair.ts              # CLI entry point: npm run repair / words-hunter
├── dist/                      # Compiled JavaScript (generated, not committed)
├── .planning/
│   └── codebase/              # GSD planning documents (generated)
├── .github/
│   ├── workflows/             # GitHub Actions CI
│   └── ISSUE_TEMPLATE/        # Issue templates
├── package.json               # npm metadata, scripts, deps
├── tsconfig.json              # TypeScript config
├── vitest.config.ts           # Test runner config
├── openclaw.plugin.json       # Plugin manifest for OpenClaw
├── SKILL.md                   # User-facing skill documentation
├── README.md                  # Project overview
├── CHANGELOG.md               # Version history
├── CONTRIBUTING.md            # Contributing guidelines
└── LICENSE                    # MIT license
```

## Directory Purposes

**`src/`**
- Purpose: All TypeScript source code
- Contains: Plugin entry point, tools, utilities, types
- Key files: `index.ts` (entry), `types.ts` (contracts), `vault.ts` (state layer)

**`src/tools/`**
- Purpose: Agent-callable tool implementations (8 total)
- Contains: Pure functions accepting VaultConfig + parameters, returning ToolResult
- Key files: All named `{action}-{noun}.ts` (e.g., `record-mastery.ts`)

**`src/srs/`**
- Purpose: Spaced Repetition System (Leitner scheduling)
- Contains: Pure functional box advancement, intervals, status derivation
- Key files: `scheduler.ts` (only file)

**`src/hooks/`**
- Purpose: OpenClaw event handlers
- Contains: Message hook for sighting detection
- Key files: `sighting-hook.ts`

**`src/matching/`**
- Purpose: Word detection using trie + inflections
- Contains: Trie structure, tokenizer, inflection generator
- Key files: `trie.ts`, `tokenizer.ts`, `inflect.ts`

**`tests/`**
- Purpose: Vitest unit test suite
- Contains: 1 test file per src module, mirroring structure
- Key files: Parallel to src structure (e.g., `tests/vault.test.ts` ↔ `src/vault.ts`)
- Excludes: `tests/evals/**` and `tests/integration/**` (from vitest.config.ts)

**`dist/`**
- Purpose: Compiled JavaScript output
- Generated: By `npm run build` (tsc)
- Committed: No (in .gitignore)

## Key File Locations

**Entry Points:**
- `src/index.ts` — Plugin entry, tool registration, event hooks
- `src/cli/repair.ts` — CLI tool entry (npm run repair)

**Configuration:**
- `src/types.ts` — All TypeScript contracts and discriminated unions
- `openclaw.plugin.json` — Plugin manifest (name, version, extensions list)
- `package.json` — npm metadata, peer dependencies (openclaw)

**Core Logic:**
- `src/srs/scheduler.ts` — SRS box advancement (pure functions)
- `src/vault.ts` — State I/O (config, mastery, sightings, nudges)
- `src/tools/` — 8 agent-callable operations

**Markdown/Pages:**
- `src/word-pages.ts` — Detect/list word .md files
- `src/page-utils.ts` — Markdown section manipulation, regex patterns
- `src/fill-word-page.ts` — Create .md template with definition

**Sighting Detection:**
- `src/hooks/sighting-hook.ts` — Message hook + trie cache
- `src/matching/trie.ts` — Trie structure
- `src/matching/tokenizer.ts` — Text → tokens
- `src/matching/inflect.ts` — Word → inflected forms

**Testing:**
- `vitest.config.ts` — Test runner config (includes pattern, excludes evals/integration)
- `tests/scheduler.test.ts` — SRS logic tests
- `tests/vault.test.ts` — State mutation tests

## Naming Conventions

**Files:**
- Tools: `{verb}-{noun}.ts` (e.g., `record-mastery.ts`, `update-page.ts`)
- Modules: descriptive lowercase with hyphens (e.g., `page-utils.ts`, `io-utils.ts`)
- Tests: `{module}.test.ts` (e.g., `vault.test.ts`)
- Hooks: `{trigger}-hook.ts` (e.g., `sighting-hook.ts`)

**Directories:**
- Plural for collections: `src/tools/`, `src/matching/`, `tests/`
- Single descriptive names: `src/srs/`, `src/hooks/`, `src/cli/`

**Exports:**
- Named exports for functions/types: `export function scanVault()`, `export type WordEntry`
- Default exports for entry points: `export default definePluginEntry()`
- Index files for public APIs: `src/matching/index.ts` re-exports trie, tokenizer, inflect

## Where to Add New Code

**New Agent Tool:**
- Create: `src/tools/{verb}-{noun}.ts`
- Import & register in: `src/index.ts` (Tool registration section, around line 124)
- Test: `tests/{verb}-{noun}.test.ts`
- Pattern: `export async function toolName(config: VaultConfig, params: ToolParams): Promise<ToolResult<ToolOutput>>`

**New Matching Rule (Inflection):**
- Extend: `src/matching/inflect.ts` `generateForms()` function
- Test: `tests/matching/inflect.test.ts`
- Cache invalidation: Automatic (hook rebuilds trie on mastery.json mtime change)

**New Vault State File:**
- Define schema: `src/types.ts` (add interface)
- Implement read/write: `src/vault.ts` (add functions following existing patterns)
- Path helper: Add to `src/vault.ts` path helpers section
- Mutations: Use `withFileLock()` and `writeTextFileAtomic()` patterns

**New Background Cron:**
- Logic: Add timing function to `src/notifications.ts`
- Hook: Add setInterval + cleanup in `src/index.ts` gateway_start/gateway_stop handlers
- Test: `tests/notifications.test.ts`

**Utilities & Helpers:**
- Shared markdown: `src/page-utils.ts` (regex helpers, section insertion)
- I/O primitives: `src/io-utils.ts` (atomic writes, locks)
- Type contracts: `src/types.ts` (all interfaces, discriminated unions)

## Special Directories

**`.wordshunter/` (inside vault):**
- Purpose: Plugin metadata, not user-facing
- Generated: By plugin on first run
- Committed: No (lives inside user's vault directory, not in repo)
- Contains: `config.json` (bridge), `mastery.json` (SRS state), `sightings.json` (usage), `pending-nudges.json`

**`dist/`:**
- Purpose: Compiled JavaScript for plugin loading
- Generated: By `npm run build` (tsc)
- Committed: Yes (to npm package via package.json "files")

**`.planning/codebase/`:**
- Purpose: GSD planning documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: By orchestrator tools
- Committed: Yes (reference docs for future implementations)

---

*Structure analysis: 2026-04-07*
