# Testing Patterns

**Analysis Date:** 2026-04-07

## Test Framework

**Runner:**
- Vitest 1.6.1
- Config: `vitest.config.ts`
- ESM modules with Node.js runtime

**Assertion Library:**
- Vitest built-in expect assertions (from Chai)

**Run Commands:**
```bash
npm test              # Run all tests (excludes evals and integration)
npm run test:watch   # Watch mode
npm run test:evals   # Run evaluation tests only
```

**Config Details:**
- Include pattern: `tests/**/*.test.ts`
- Excluded: `tests/evals/**`, `tests/integration/**`
- TypeScript source maps enabled for stack traces
- Test files compile via tsconfig (target ES2022)

## Test File Organization

**Location:**
- `tests/` directory parallel to `src/`
- Mirrors source structure: `src/tools/record-mastery.ts` → `tests/record-mastery.test.ts`
- Subdirectories for feature areas: `tests/matching/`, `tests/fixtures/`

**Naming:**
- Pattern: `{module}.test.ts` or `{feature}.test.ts`
- Examples: `record-mastery.test.ts`, `vault-summary.test.ts`, `matching/trie.test.ts`

**Structure:**
```
tests/
├── fixtures/                 # Shared test data (markdown, HTML samples)
├── matching/
│   ├── inflect.test.ts
│   ├── trie.test.ts
│   └── tokenizer.test.ts
├── record-mastery.test.ts
├── vault.test.ts
├── scan-vault.test.ts
└── [other test files]
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recordMastery } from '../src/tools/record-mastery.js';
import type { VaultConfig } from '../src/types.js';

describe('record_mastery', () => {
  it('creates mastery.json if it does not exist', async () => {
    // Test body
  });

  it('writes mastery.json atomically', async () => {
    // Test body
  });
});
```

**Patterns:**
- Top-level `describe()` block per public function or module
- Flat test structure: tests directly in describe block, no nested describes
- Descriptive test names using plain English with arrow operators: `'creates mastery.json if it does not exist'`, `'NaN score → NaN_SCORE error'`
- Test titles often include expected behavior with arrows: `'box 1 success → box 2'`

**Fixtures and Factories:**
- Temporary directories created per test via `mkdtemp()`:
  ```typescript
  async function makeVault(): Promise<{ 
    vaultPath: string; 
    config: VaultConfig; 
    cleanup: () => Promise<void> 
  }> {
    const vaultPath = await mkdtemp(join(tmpdir(), 'wh-test-'));
    await mkdir(join(vaultPath, '.wordshunter'), { recursive: true });
    await mkdir(join(vaultPath, 'Words'), { recursive: true });
    const config: VaultConfig = { vault_path: vaultPath, words_folder: 'Words' };
    return { vaultPath, config, cleanup: () => rm(vaultPath, { recursive: true, force: true }) };
  }
  ```
- Cleanup in finally block or after async completion:
  ```typescript
  const { vaultPath, config, cleanup } = await makeVault();
  try {
    // test body
  } finally {
    await cleanup();
  }
  ```

**Test Data:**
- Fixtures stored in `tests/fixtures/`: markdown templates, HTML samples (cambridge-posit.html, posit-no-mastery.md)
- Loaded via `readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8')`
- Inline fixture data for small objects:
  ```typescript
  const SAMPLE_CONTENT: CambridgeContent = {
    headword: 'pos·it',
    pronunciationBrE: '/ˈpɒz.ɪt/',
    // ...
  };
  ```

## Mocking

**Framework:** Manual mocking via factory functions (no Jest/Vitest mock utilities used extensively)

**Patterns:**
- Avoid mocking by creating real temporary files/directories
- Pure functions tested without mocking (e.g., `scheduler.ts`):
  ```typescript
  it('box 1 success → box 2', () => {
    const result = advance(1, MASTERY_THRESHOLD, TODAY);
    expect(result.box).toBe(2);
  });
  ```
- Test data factories instead of mocks:
  ```typescript
  const store: MasteryStore = {
    version: 1,
    words: {
      posit: { word: 'posit', box: 3, status: 'reviewing', ... },
    },
  };
  await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');
  ```

**What to Mock:**
- Generally avoided; prefer real I/O in tests
- External APIs (Cambridge lookup) tested separately or skipped
- No mock clock/timer library in use

**What NOT to Mock:**
- File system operations — use temporary directories instead
- JSON parsing — test with real JSON files
- Core business logic — always tested with real implementations
- Type validation — always test against actual type structures

## Coverage

**Requirements:** None enforced by tooling (no coverage threshold)

**View Coverage:**
- No coverage tool configured (jest coverage not available in this Vitest setup)
- Manual test review to ensure critical paths tested

## Test Types

**Unit Tests:**
- Scope: Pure functions and single module behavior
- Approach: Direct function calls with test data, assertions on return values
- Examples: `scheduler.test.ts` (SRS box advancement), `matching/trie.test.ts` (word trie search)
- Coverage: Happy paths, edge cases (NaN, boundary values), error codes

**Integration Tests:**
- Location: `tests/integration/` (excluded from default test run)
- Scope: Multi-module workflows with real file I/O
- Approach: Set up complete vault state, call tool functions, verify file system and mastery.json
- Examples: `record-mastery.test.ts` (reads/writes mastery.json + validates), `update-page.test.ts` (reads .md, modifies, writes back)
- Test I/O atomicity: verifies JSON remains valid after interrupt-like scenarios

**E2E Tests:**
- Framework/Pattern: Not present in current codebase
- Plugin testing: Occurs via manual testing in OpenClaw environment (no automated E2E)

## Common Patterns

**Async Testing:**
```typescript
it('creates mastery.json if it does not exist (first word practiced)', async () => {
  const { vaultPath, config, cleanup } = await makeVault();
  try {
    const mdContent = readFileSync(join(FIXTURES, 'posit-no-mastery.md'), 'utf8');
    await writeFile(join(vaultPath, 'Words', 'posit.md'), mdContent, 'utf8');

    const result = await recordMastery(config, { word: 'posit', score: 88 });
    expect(result.ok).toBe(true);

    const storeRaw = await readFile(join(vaultPath, '.wordshunter', 'mastery.json'), 'utf8');
    const store: MasteryStore = JSON.parse(storeRaw);
    expect(store.words['posit']).toBeDefined();
    expect(store.words['posit'].box).toBe(2);
  } finally {
    await cleanup();
  }
});
```

**Error Testing:**
```typescript
it('missing config.json → VAULT_NOT_FOUND', async () => {
  const { dir, cleanup } = await makeTmpDir();
  try {
    const result = await loadVaultConfig(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VAULT_NOT_FOUND');
  } finally {
    await cleanup();
  }
});
```

**ToolResult Pattern Testing:**
All tests checking tool functions follow the discriminated union pattern:
```typescript
const result = await scanVault(config, 'all');
expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.data).toHaveLength(2);
  expect(result.data[0].word).toBe('posit');
}
```

**State Setup with Existing Data:**
```typescript
const store: MasteryStore = {
  version: 1,
  words: {
    posit: { word: 'posit', box: 3, status: 'reviewing', score: 78, ... },
  },
};
await writeFile(join(vaultPath, '.wordshunter', 'mastery.json'), JSON.stringify(store), 'utf8');
```

## Known Test Gaps

- **Cambridge lookup mocking:** Tests load real HTML fixtures but don't test network failures
- **Concurrent file access:** Limited testing of race conditions in atomic writes
- **Large dataset performance:** No tests with 1000+ words in mastery.json
- **Binary file handling:** Assumes all word pages are valid UTF-8 markdown
- **Custom plugin config values:** Limited testing of plugin-specific configuration paths

---

*Testing analysis: 2026-04-07*
