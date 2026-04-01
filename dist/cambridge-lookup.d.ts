/**
 * cambridge-lookup.ts
 *
 * Fetches and parses word data from Cambridge Learner's Dictionary via HTML scraping.
 * No API key required. Ported from CambridgeScraper.swift.
 *
 * Anti-detection: realistic User-Agent + Accept-Language headers, random jitter delay.
 */
import type { CheerioAPI } from 'cheerio';
export interface CambridgeSense {
    cefrLevel: string | null;
    definition: string;
    examples: string[];
    senseLabel: string | null;
    grammar: string | null;
    patterns: string[];
    register: string | null;
}
export interface CambridgeEntry {
    pos: string | null;
    senses: CambridgeSense[];
}
export interface WordFamilyEntry {
    word: string;
    partsOfSpeech: string[];
}
export interface CambridgeContent {
    headword: string;
    pronunciationBrE: string | null;
    pronunciationAmE: string | null;
    entries: CambridgeEntry[];
    corpusExamples: string[];
    wordFamily: WordFamilyEntry[];
}
export declare class CambridgeBlockedError extends Error {
    statusCode: number;
    constructor(statusCode: number);
}
export declare class CambridgeServerError extends Error {
    statusCode: number;
    constructor(statusCode: number);
}
/**
 * Look up a word on Cambridge Dictionary.
 * Returns null if the word is not found.
 * Throws CambridgeBlockedError / CambridgeServerError on HTTP errors.
 */
export declare function cambridgeLookup(word: string, timeoutMs?: number): Promise<CambridgeContent | null>;
export declare function parseContent(html: string, word: string): CambridgeContent | null;
export declare function extractHeadword($: CheerioAPI): string | null;
export declare function extractPronunciations($: CheerioAPI): [string | null, string | null];
export declare function extractEntries($: CheerioAPI): CambridgeEntry[];
export declare function extractCorpusExamples($: CheerioAPI): string[];
export declare function extractWordFamily($: CheerioAPI): WordFamilyEntry[];
//# sourceMappingURL=cambridge-lookup.d.ts.map