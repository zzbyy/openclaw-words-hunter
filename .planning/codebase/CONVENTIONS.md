# Coding Conventions

**Analysis Date:** 2026-04-07

## Naming Patterns

**Files:**
- kebab-case for all .ts and .tsx files: `record-mastery.ts`, `fill-word-page.ts`, `scan-vault.ts`
- Directories use kebab-case for multi-word names: `src/tools/`, `src/srs/`, `src/matching/`, `src/hooks/`
- Single-word directories use lowercase: `src/cli/`

**Functions:**
- camelCase for all exported and internal functions: `recordMastery()`, `fillWordPage()`, `scanVault()`, `loadVaultConfig()`
- Helper functions typically contain verb-noun pattern: `readMasteryStore()`, `writeMasteryStore()`, `validateWord()`

**Variables:**
- camelCase for all variables and parameters: `wordLower`, `nextReview`, `currentBox`, `storeResult`
- Constants use UPPER_SNAKE_CASE with const: `BOX_INTERVALS`, `MASTERY_THRESHOLD`, `LOOKUP_VARS`, `TODAY`
- Descriptive names preferred: `masteryOutcome`, `config`, `vaultPath` rather than abbreviated forms

**Types:**
- PascalCase for all interfaces, types, and type aliases: `ToolResult<T>`, `VaultConfig`, `WordEntry`, `MatchTrie`, `MasteryStore`
- Discriminated union pattern used extensively: `ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError }`
- Type parameters use single uppercase letter: `<T>`, `<N>` (rarely used)

## Code Style

**Formatting:**
- Target: ES2022 (TypeScript strict mode)
- Indentation: 2 spaces (consistent across files)
- Line length: typically under 100 characters
- Quote preference: single quotes for strings (not enforced by linter, but consistent in codebase)
- No configured linter/formatter — style is maintained through convention and manual discipline

**Linting:**
- TypeScript strict mode enabled in `tsconfig.json`
- Type annotations required on function parameters and return types
- `esModuleInterop: true` and `skipLibCheck: true` configured
- No ESLint or Prettier in use — relies on TypeScript's built-in checking

**File Headers:**
- Block comment documentation pattern: `/** ... */` for module-level and function documentation
- Example from `fill-word-page.ts`:
  ```typescript
  /**
   * fill-word-page.ts
   *
   * Fills lookup-time template variables in a word page after Cambridge lookup.
   * [Detailed description and safety notes...]
   */
  ```
- Module-level documentation describes purpose, variables, and safety guarantees

## Import Organization

**Order:**
1. Node.js built-in modules: `import fs from 'node:fs/promises'`
2. Third-party packages: `import { Type } from '@sinclair/typebox'`
3. Local types and interfaces: `import type { VaultConfig, ToolResult } from '../types.js'`
4. Local functions: `import { loadVaultConfig, readMasteryStore } from '../vault.js'`

**Path Aliases:**
- No path aliases configured in tsconfig
- Relative imports used throughout: `import { recordMastery } from '../src/tools/record-mastery.js'`
- `.js` file extensions always included (ESM requirement)

## Error Handling

**Patterns:**
- Discriminated union pattern via `ToolResult<T>` for all public functions:
  ```typescript
  type ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError }
  ```
- Error code enum: `'VAULT_NOT_FOUND'`, `'FILE_NOT_FOUND'`, `'PARSE_ERROR'`, `'WRITE_FAILED'`, `'NaN_SCORE'`, `'INVALID_INPUT'`, etc.
- Helper functions: `ok(data)` returns `{ ok: true, data }`, `err(error)` returns `{ ok: false, error }`
- Early returns on error: Check `.ok` field and return immediately
  ```typescript
  if (!result.ok) return { ok: false, error: result.error };
  const value = result.data;
  ```
- No exceptions thrown for control flow — all errors are structured returns
- File I/O uses try/catch only for unexpected failures, otherwise returns error codes

**ToolError Variants:**
- `code: 'VAULT_NOT_FOUND'` — vault directory missing or inaccessible
- `code: 'FILE_NOT_FOUND'` — word .md file not found
- `code: 'PARSE_ERROR'` — JSON or markdown parsing failed
- `code: 'WRITE_FAILED'` — atomic write failed
- `code: 'ALREADY_EDITED'` — concurrent edit detected (content_hash mismatch)
- `code: 'VAULT_ESCAPE'` — path traversal attempt detected
- `code: 'NaN_SCORE'` — score parameter is not a finite number
- `code: 'INVALID_INPUT'` — other input validation failure
- `code: 'FILE_EXISTS'` — word already exists
- `code: 'INVALID_GRADUATION'` — word is not at box 4+ for graduation

## Logging

**Framework:** console (no structured logging library)

**Patterns:**
- `api.logger.info()` and `api.logger.error()` for plugin runtime context
- Consistent prefix pattern: `[words-hunter]`, `[words-hunter nudge]`, `[words-hunter add]`
- Example:
  ```typescript
  api.logger.info(`[words-hunter] imported ${imported.length} untracked word(s): ${imported.join(', ')}`);
  api.logger.error(`[words-hunter] ${result.error.message}`);
  ```
- No debug logging framework — uses conditional logging where needed

## Comments

**When to Comment:**
- Module-level JSDoc describing purpose, behavior, and side effects
- Clarify non-obvious algorithms (e.g., Leitner SRS box advancement, trie search)
- Document decision points and assumptions (e.g., "mastery.json is single source of truth")
- Provide examples of JSON schema or file format expectations
- Mark legacy code or compatibility notes (e.g., "Legacy Oxford/MW variables — kept so old pages are still detected")

**JSDoc/TSDoc:**
- Used for public functions and types, not consistently on internal helpers
- Example from `record-mastery.ts`:
  ```typescript
  /**
   * record_mastery — record a practice session result.
   *
   * 1. Validates score (NaN_SCORE if invalid).
   * 2. Reads mastery.json.
   * 3. Advances SRS schedule.
   * 4. Writes mastery.json atomically.
   * 5. Returns new schedule + graduated flag.
   */
  ```
- Parameter and return documentation on tool functions
- No inline comments for obvious code

## Function Design

**Size:** Most functions range 20–80 lines. Some larger tools (e.g., `fillWordPage`, `index.ts`) reach 150–500 lines when grouping related logic.

**Parameters:**
- Use object parameters for functions with >2 parameters: `recordMastery(config, { word, score, best_sentence })`
- Separate concerns into distinct parameters: `config: VaultConfig`, `input: ToolInput`
- Type all parameters explicitly; no `any` type used

**Return Values:**
- All public tool functions return `ToolResult<T>` discriminated union
- Pure functions (no I/O) return raw values or typed objects: `{ ok: true, data: WordEntry }`, `'ok' | 'no_vars' | 'write_failed'`
- Async functions always return Promise<Result> or Promise<void> for fire-and-forget

## Module Design

**Exports:**
- Named exports for all functions: `export async function recordMastery(...)`
- Type exports use `export type`: `export type ToolResult<T> = ...`
- No default exports except `src/index.ts` which exports `definePluginEntry({ ... })`

**Barrel Files:**
- No barrel/index files for re-exporting — each module imported directly
- `src/index.ts` is the plugin entry point, not a barrel file for `src/`

**File Organization:**
- One primary function per file (tools): `record-mastery.ts` exports `recordMastery()`
- Utility modules export multiple related functions: `vault.ts` exports 10+ functions
- Type definitions centralized in `src/types.ts`
- Pure scheduler logic in `src/srs/scheduler.ts` (no I/O dependencies)

---

*Convention analysis: 2026-04-07*
