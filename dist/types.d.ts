export type ToolResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: ToolError;
};
export type ToolError = {
    code: 'VAULT_NOT_FOUND';
    message: string;
} | {
    code: 'FILE_NOT_FOUND';
    message: string;
    word: string;
} | {
    code: 'PARSE_ERROR';
    message: string;
    word?: string;
} | {
    code: 'WRITE_FAILED';
    message: string;
} | {
    code: 'ALREADY_EDITED';
    message: string;
    word: string;
} | {
    code: 'VAULT_ESCAPE';
    message: string;
    path: string;
} | {
    code: 'NaN_SCORE';
    message: string;
    field: string;
} | {
    code: 'INVALID_INPUT';
    message: string;
    field: string;
} | {
    code: 'FILE_EXISTS';
    message: string;
};
export declare function ok<T>(data: T): ToolResult<T>;
export declare function err(error: ToolError): ToolResult<never>;
export interface VaultConfig {
    vault_path: string;
    words_folder: string;
}
export interface BestSentence {
    text: string;
    date: string;
    score: number;
}
export interface WordEntry {
    word: string;
    box: 1 | 2 | 3 | 4 | 5;
    status: 'learning' | 'reviewing' | 'mastered';
    score: number;
    last_practiced: string;
    next_review: string;
    sessions: number;
    failures: string[];
    best_sentences: BestSentence[];
}
export interface MasteryStore {
    version: 1;
    words: Record<string, WordEntry>;
}
export interface PendingNudge {
    word: string;
    nudge_due_at: string;
    created_at: string;
}
export interface NudgeQueue {
    version: 1;
    nudges: PendingNudge[];
}
export interface SessionScore {
    meaning: number;
    register: number;
    collocation: number;
    grammar: number;
    total: number;
}
export interface VaultSummary {
    total: number;
    mastered: number;
    reviewing: number;
    learning: number;
    due_today: number;
    last_session: string | null;
}
export type ScanFilter = 'all' | 'due' | 'new';
export interface ScannedWord {
    word: string;
    status: WordEntry['status'] | 'new';
    next_review: string | null;
}
//# sourceMappingURL=types.d.ts.map