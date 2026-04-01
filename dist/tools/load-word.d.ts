import { ToolResult, VaultConfig, WordEntry } from '../types.js';
export interface LoadWordResult {
    word: string;
    content: string;
    mastery: WordEntry | null;
}
/**
 * load_word — load a word page + its mastery state.
 *
 * Returns FILE_NOT_FOUND if the .md page doesn't exist.
 * Returns mastery=null if the word has no mastery.json entry (new word).
 */
export declare function loadWord(config: VaultConfig, word: string): Promise<ToolResult<LoadWordResult>>;
//# sourceMappingURL=load-word.d.ts.map