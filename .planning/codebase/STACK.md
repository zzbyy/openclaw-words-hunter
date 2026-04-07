# Technology Stack

**Analysis Date:** 2026-04-07

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code in `src/`
- JavaScript - Build output in `dist/`, CLI scripts

**Runtime:**
- Node.js 24.0.2 - Required for both plugin and CLI operations

## Package Manager

**Manager:**
- npm 11.4.2
- Lockfile: `package-lock.json` present

## Frameworks & Core Dependencies

**Plugin Framework:**
- openclaw >=2026.3.22 (peer dependency) - Plugin SDK integration point
  - Entry point: `src/index.ts` via `definePluginEntry` from `openclaw/plugin-sdk/plugin-entry`
  - Plugin metadata: `openclaw.plugin.json` with configSchema for `vault_path` and `recap_channel`

**Data Validation:**
- @sinclair/typebox 0.27.10 - Type-safe schema validation
  - Used in `src/index.ts` for tool parameter schemas via `Type` helper

**HTML Parsing:**
- cheerio 1.2.0 - DOM manipulation for Cambridge Dictionary scraping
  - Used in `src/cambridge-lookup.ts` for extracting word definitions, pronunciations, examples
  - CheerioAPI type imported from cheerio

**File System Watching:**
- chokidar 5.0.0 - File system event monitoring
  - Used in `src/watcher.ts` for dynamic import to detect word file changes
  - Errors logged and restarted with exponential backoff

**File Locking:**
- proper-lockfile 4.1.2 - Atomic file write coordination
  - Used in `src/io-utils.ts` for mastery.json and sightings.json writes
  - Prevents concurrent modification of shared state files

## Build & Development

**Compiler:**
- TypeScript 5.9.3 - Strict mode enabled
  - Config: `tsconfig.json` targets ES2022, NodeNext modules
  - Output: `dist/` directory with source maps and declaration files
  - Build command: `npm run build` (runs `tsc`)

**Testing Framework:**
- vitest 1.6.1 - Fast unit test runner
  - Config: `vitest.config.ts` includes unit tests from `tests/**/*.test.ts`
  - Excludes: `tests/evals/**` and `tests/integration/**` from normal runs
  - Commands:
    - `npm test` - Run all unit tests
    - `npm test:watch` - Watch mode
    - `npm test:evals` - Run evaluation suite specifically

**Type Definitions:**
- @types/node 20.19.37 - Node.js standard library types
- @types/proper-lockfile 4.1.4 - proper-lockfile TypeScript definitions

## Built-in Modules

**Core Node APIs used:**
- `fs` / `fs/promises` - File system operations across all tools
- `path` - Path manipulation in `src/tools/`
- `crypto` - Hash generation in `src/tools/update-page.ts`
- `node:url` - URL parsing in HTTP requests

## Distribution

**Package Metadata:**
- Main entry: `dist/index.js` (plugin entry point)
- CLI binary: `dist/cli/repair.js` (bin: `words-hunter`)
- Files included in distribution: `dist/`, `openclaw.plugin.json`, `SKILL.md`, `README.md`, `LICENSE`
- Module type: `"type": "module"` (ESM throughout)

## Configuration

**Plugin Configuration:**
- Schema defined in `openclaw.plugin.json`:
  - `vault_path` (string, optional) - Absolute path to words directory, auto-discovered or manually set
  - `recap_channel` (string, optional) - Channel ID for weekly vocab recap

**Runtime Configuration:**
- Auto-discovered from shared bridge file: `~/Library/Application Support/WordsHunter/discovery.json`
- Fallback to plugin config if discovery file not found
- Vault-local config: `.wordshunter/config.json` (mirrors plugin config)
- Sidecar config: `.wordshunter/config.json` stores `vault_path`, `words_folder`, `primary_channel`, timing metadata

## Compilation Targets

**Output:**
- Target: ES2022
- Module system: NodeNext
- Library: ES2022
- Declaration files: Generated with `declarationMap`
- Source maps: Enabled for debugging

---

*Stack analysis: 2026-04-07*
