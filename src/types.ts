// ============================================================
// ToolResult<T> — discriminated union for all tool returns
// ============================================================

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError };

export type ToolError =
  | { code: 'VAULT_NOT_FOUND';  message: string }
  | { code: 'FILE_NOT_FOUND';   message: string; word: string }
  | { code: 'PARSE_ERROR';      message: string; word?: string }
  | { code: 'WRITE_FAILED';     message: string }
  | { code: 'ALREADY_EDITED';   message: string; word: string }
  | { code: 'VAULT_ESCAPE';     message: string; path: string }
  | { code: 'NaN_SCORE';        message: string; field: string }
  | { code: 'INVALID_INPUT';   message: string; field: string }
  | { code: 'FILE_EXISTS';     message: string }
  | { code: 'INVALID_GRADUATION'; message: string; word: string };

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function err(error: ToolError): ToolResult<never> {
  return { ok: false, error };
}

// ============================================================
// Config bridge schema (.wordshunter/config.json)
// ============================================================

export interface VaultConfig {
  vault_path: string;
  words_folder: string;  // subfolder name, or "" for vault root
}

export interface PluginSidecarConfig extends VaultConfig {
  primary_channel?: string;
  last_weekly_recap_at?: string;
  last_daily_review_at?: string;
}

// ============================================================
// Mastery JSON sidecar schema (.wordshunter/mastery.json)
// ============================================================

export interface BestSentence {
  text: string;
  date: string;   // YYYY-MM-DD
  score: number;  // 0–100
}

export interface WordEntry {
  word: string;
  box: 1 | 2 | 3 | 4 | 5;
  status: 'learning' | 'reviewing' | 'mastered';
  score: number;             // latest composite score 0–100
  last_practiced: string;    // YYYY-MM-DD
  next_review: string;       // YYYY-MM-DD
  sessions: number;
  failures: string[];
  best_sentences: BestSentence[];
  coaching_mode?: 'silent' | 'inline';
  synonyms?: string[];
  short_definition?: string;
}

export interface MasteryStore {
  version: 1;
  words: Record<string, WordEntry>;
}

// ============================================================
// Sightings store (.wordshunter/sightings.json)
// ============================================================

export interface SightingEvent {
  timestamp: string;       // ISO minute: "2026-04-04T21:15"
  channel?: string;
  words: Record<string, string>;  // word → sentence extract
}

export interface SightingsStore {
  version: 2;
  days: Record<string, SightingEvent[]>;
}

/** v1 schema for migration (read-only) */
export interface SightingsStoreV1 {
  version: 1;
  days: Record<string, Record<string, Array<{ date: string; sentence: string; channel?: string }>>>;
}

// ============================================================
// Daily review data (returned by prepare_review tool)
// ============================================================

/** Flattened per-word sighting for prepare_review output */
export interface SightingEntry {
  timestamp: string;  // ISO minute
  sentence: string;
  channel?: string;
}

export interface ReviewData {
  review_date: string;
  new_arrivals: Array<{ word: string; short_definition?: string; content: string }>;
  used_today: Array<{ word: string; box: number; short_definition?: string; sightings: SightingEntry[]; content: string }>;
  due_not_used: Array<{ word: string; box: number; status: string; short_definition?: string; days_overdue: number; sessions: number }>;
  dormant_count: number;
  total_words: number;
  total_sightings_today: number;
}

// ============================================================
// Pending nudges queue (.wordshunter/pending-nudges.json)
// ============================================================

export interface PendingNudge {
  word: string;
  nudge_due_at: string;   // ISO8601
  created_at: string;     // ISO8601
}

export interface NudgeQueue {
  version: 1;
  nudges: PendingNudge[];
}

// ============================================================
// Scoring rubric
// ============================================================

export interface SessionScore {
  meaning: number;      // 0–15
  register: number;     // 0–10
  collocation: number;  // 0–10
  grammar: number;      // 0–5
  total: number;        // sum, 0–40 scaled to 0–100
}

// ============================================================
// vault_summary output
// ============================================================

export interface VaultSummary {
  total: number;
  mastered: number;
  reviewing: number;
  learning: number;
  due_today: number;
  last_session: string | null;  // YYYY-MM-DD or null if never
}

// ============================================================
// Scan vault output
// ============================================================

export type ScanFilter = 'all' | 'due' | 'new';

export interface ScannedWord {
  word: string;
  status: WordEntry['status'] | 'new';
  next_review: string | null;
  coaching_mode?: 'silent';   // present only when silent; absent = coaching on (default)
}

export type PluginRuntime = {
  logger: { info: (message: string) => void };
  pluginConfig?: Record<string, unknown>;
  sendMessage?: (channelId: string, message: string) => Promise<unknown> | unknown;
  postMessage?: (channelId: string, message: string) => Promise<unknown> | unknown;
  channels?: {
    send?: (channelId: string, message: string) => Promise<unknown> | unknown;
  };
};
