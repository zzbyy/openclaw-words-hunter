import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolResult, ToolError, VaultConfig, PluginSidecarConfig, MasteryStore, SightingsStore, SightingsStoreV1, SightingEvent, NudgeQueue, ok, err } from './types.js';
import { writeTextFileAtomic, withFileLock } from './io-utils.js';

// ============================================================
// Config loading
// ============================================================

export async function loadVaultConfig(vaultRoot: string): Promise<ToolResult<VaultConfig>> {
  const configPath = configJsonPath(vaultRoot);
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch {
    return err({ code: 'VAULT_NOT_FOUND', message: `config.json not found at ${configPath}. Run Words Hunter and save settings.` });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err({ code: 'PARSE_ERROR', message: `config.json is not valid JSON` });
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return err({ code: 'PARSE_ERROR', message: 'config.json must be a JSON object' });
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['vault_path'] !== 'string' || !obj['vault_path']) {
    return err({ code: 'VAULT_NOT_FOUND', message: 'config.json is missing vault_path' });
  }

  const vaultPath = obj['vault_path'] as string;
  try {
    await fs.access(vaultPath);
  } catch {
    return err({ code: 'VAULT_NOT_FOUND', message: `vault_path '${vaultPath}' does not exist on disk. Has the vault been moved?` });
  }

  return ok({
    vault_path: vaultPath,
    words_folder: typeof obj['words_folder'] === 'string' ? obj['words_folder'] : '',
  });
}

export function configJsonPath(vaultRoot: string): string {
  return path.join(vaultRoot, '.wordshunter', 'config.json');
}

function parsePluginSidecarConfig(raw: string): PluginSidecarConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['vault_path'] !== 'string' || !obj['vault_path']) return null;

  return {
    vault_path: obj['vault_path'],
    words_folder: typeof obj['words_folder'] === 'string' ? obj['words_folder'] : '',
    primary_channel: typeof obj['primary_channel'] === 'string' ? obj['primary_channel'] : undefined,
    last_weekly_recap_at: typeof obj['last_weekly_recap_at'] === 'string' ? obj['last_weekly_recap_at'] : undefined,
  };
}

export async function readPluginSidecarConfig(vaultRoot: string): Promise<PluginSidecarConfig | null> {
  try {
    const raw = await fs.readFile(configJsonPath(vaultRoot), 'utf8');
    return parsePluginSidecarConfig(raw);
  } catch {
    return null;
  }
}

export async function writePluginSidecarConfig(
  vaultRoot: string,
  config: PluginSidecarConfig,
): Promise<ToolResult<void>> {
  const configPath = configJsonPath(vaultRoot);
  try {
    await writeTextFileAtomic(configPath, JSON.stringify(config, null, 2), 'wh-config');
    return ok(undefined);
  } catch (e) {
    return err({ code: 'WRITE_FAILED', message: `Could not write config.json: ${String(e)}` });
  }
}

export async function mutatePluginSidecarConfig<T>(
  vaultRoot: string,
  fn: (current: PluginSidecarConfig) => Promise<{ next: PluginSidecarConfig; value: T }> | { next: PluginSidecarConfig; value: T },
): Promise<ToolResult<T>> {
  return withSidecarLock(vaultRoot, async () => {
    const current = (await readPluginSidecarConfig(vaultRoot)) ?? { vault_path: vaultRoot, words_folder: '' };
    const { next, value } = await fn(current);
    const writeResult = await writePluginSidecarConfig(vaultRoot, next);
    if (!writeResult.ok) return writeResult;
    return ok(value);
  });
}

// ============================================================
// Input validation
// ============================================================

/** Valid word: letters, digits, apostrophes, hyphens, spaces — max 50 chars. */
const WORD_PATTERN = /^[a-z0-9][a-z0-9'\- ]{0,49}$/i;

/**
 * Validate that a word string from LLM tool input is safe to use as a file
 * name and mastery.json key. Rejects path traversal, empty strings, and
 * excessively long values before any I/O occurs.
 */
export function validateWord(word: string): ToolError | null {
  if (!word || typeof word !== 'string') {
    return { code: 'INVALID_INPUT', message: 'word must be a non-empty string', field: 'word' };
  }
  if (!WORD_PATTERN.test(word)) {
    return { code: 'INVALID_INPUT', message: `Invalid word format: '${word}'. Words must contain only letters, digits, apostrophes, hyphens, and spaces (max 50 chars).`, field: 'word' };
  }
  return null;
}

// ============================================================
// Path helpers
// ============================================================

export function wordsFolderPath(config: VaultConfig): string {
  return config.words_folder
    ? path.join(config.vault_path, config.words_folder)
    : config.vault_path;
}

export function masteryJsonPath(config: VaultConfig): string {
  return path.join(config.vault_path, '.wordshunter', 'mastery.json');
}

export function sightingsJsonPath(config: VaultConfig): string {
  return path.join(config.vault_path, '.wordshunter', 'sightings.json');
}

export function nudgeQueuePath(config: VaultConfig): string {
  return path.join(config.vault_path, '.wordshunter', 'pending-nudges.json');
}

/** Returns VAULT_ESCAPE if resolvedPath is not inside vaultRoot. */
export function assertInVault(
  vaultRoot: string,
  resolvedPath: string,
): ToolError | null {
  const vaultResolved = path.resolve(vaultRoot);
  const fileResolved = path.resolve(resolvedPath);
  if (!fileResolved.startsWith(vaultResolved + path.sep) && fileResolved !== vaultResolved) {
    return { code: 'VAULT_ESCAPE', message: `Path escapes vault root`, path: resolvedPath };
  }
  return null;
}

// ============================================================
// mastery.json I/O
// ============================================================

/**
 * Serialize read-modify-write on mastery.json to prevent lost updates when
 * two callers update concurrently (e.g. sighting hook + active session).
 *
 * Locks a dedicated `.mastery.lock` file (not mastery.json itself) because
 * proper-lockfile requires the lock target to exist, and mastery.json may be
 * absent on first run.
 */
export async function withMasteryLock<T>(jsonPath: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.dirname(jsonPath);
  return withFileLock(dir, '.mastery.lock', fn);
}

export async function readMasteryStore(jsonPath: string): Promise<ToolResult<MasteryStore>> {
  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, 'utf8');
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // First run — no mastery data yet, return empty store
      return ok({ version: 1, words: {} });
    }
    return err({ code: 'PARSE_ERROR', message: `Could not read mastery.json: ${String(e)}` });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err({ code: 'PARSE_ERROR', message: 'mastery.json is not valid JSON. Run words-hunter repair.' });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as MasteryStore).version !== 1 ||
    typeof (parsed as MasteryStore).words !== 'object'
  ) {
    return err({ code: 'PARSE_ERROR', message: 'mastery.json has unexpected schema. Run words-hunter repair.' });
  }

  return ok(parsed as MasteryStore);
}

export async function writeMasteryStore(
  jsonPath: string,
  store: MasteryStore,
): Promise<ToolResult<void>> {
  try {
    await writeTextFileAtomic(jsonPath, JSON.stringify(store, null, 2), 'wh-mastery');
    return ok(undefined);
  } catch (e) {
    return err({ code: 'WRITE_FAILED', message: `Could not write mastery.json: ${String(e)}` });
  }
}

// ============================================================
// sightings.json I/O
// ============================================================

export async function withSightingsLock<T>(jsonPath: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.dirname(jsonPath);
  return withFileLock(dir, '.sightings.lock', fn);
}

export async function readSightingsStore(jsonPath: string): Promise<ToolResult<SightingsStore>> {
  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, 'utf8');
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok({ version: 2, days: {} });
    }
    return err({ code: 'PARSE_ERROR', message: `Could not read sightings.json: ${String(e)}` });
  }

  let parsed: { version?: number; days?: unknown };
  try { parsed = JSON.parse(raw); } catch {
    return err({ code: 'PARSE_ERROR', message: 'sightings.json is not valid JSON.' });
  }

  // v1 → v2 migration (in-memory only; next write saves as v2)
  if (parsed.version === 1) {
    const v1 = parsed as SightingsStoreV1;
    const v2: SightingsStore = { version: 2, days: {} };
    for (const [day, words] of Object.entries(v1.days)) {
      const events: SightingEvent[] = [];
      for (const [word, entries] of Object.entries(words)) {
        for (const entry of entries) {
          events.push({
            timestamp: entry.date + 'T00:00',
            channel: entry.channel,
            words: { [word]: entry.sentence },
          });
        }
      }
      v2.days[day] = events;
    }
    return ok(v2);
  }

  return ok(parsed as SightingsStore);
}

export async function writeSightingsStore(
  jsonPath: string,
  store: SightingsStore,
): Promise<ToolResult<void>> {
  try {
    await writeTextFileAtomic(jsonPath, JSON.stringify(store, null, 2), 'wh-sightings');
    return ok(undefined);
  } catch (e) {
    return err({ code: 'WRITE_FAILED', message: `Could not write sightings.json: ${String(e)}` });
  }
}

// ============================================================
// pending-nudges.json I/O
// ============================================================

export async function readNudgeQueue(queuePath: string): Promise<NudgeQueue> {
  try {
    const raw = await fs.readFile(queuePath, 'utf8');
    const parsed = JSON.parse(raw) as NudgeQueue;
    return parsed;
  } catch {
    return { version: 1, nudges: [] };
  }
}

export async function writeNudgeQueue(
  queuePath: string,
  queue: NudgeQueue,
): Promise<ToolResult<void>> {
  try {
    await writeTextFileAtomic(queuePath, JSON.stringify(queue, null, 2), 'wh-nudges');
    return ok(undefined);
  } catch (e) {
    return err({ code: 'WRITE_FAILED', message: `Could not write pending-nudges.json: ${String(e)}` });
  }
}

export async function withNudgeQueueLock<T>(queuePath: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.dirname(queuePath);
  return withFileLock(dir, '.pending-nudges.lock', fn);
}

export async function mutateNudgeQueue<T>(
  queuePath: string,
  fn: (queue: NudgeQueue) => Promise<{ queue: NudgeQueue; value: T }> | { queue: NudgeQueue; value: T },
): Promise<ToolResult<T>> {
  return withNudgeQueueLock(queuePath, async () => {
    const current = await readNudgeQueue(queuePath);
    const { queue, value } = await fn(current);
    const writeResult = await writeNudgeQueue(queuePath, queue);
    if (!writeResult.ok) return writeResult;
    return ok(value);
  });
}

async function withSidecarLock<T>(vaultRoot: string, fn: () => Promise<T>): Promise<T> {
  const dir = path.join(vaultRoot, '.wordshunter');
  return withFileLock(dir, '.config.lock', fn);
}
