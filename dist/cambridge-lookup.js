/**
 * cambridge-lookup.ts
 *
 * Fetches and parses word data from Cambridge Learner's Dictionary via HTML scraping.
 * No API key required. Ported from CambridgeScraper.swift.
 *
 * Anti-detection: realistic User-Agent + Accept-Language headers, random jitter delay.
 */
import { load } from 'cheerio';
// ─── Errors ──────────────────────────────────────────────────────────────────
export class CambridgeBlockedError extends Error {
    statusCode;
    constructor(statusCode) {
        super(`Cambridge blocked the request (HTTP ${statusCode})`);
        this.statusCode = statusCode;
    }
}
export class CambridgeServerError extends Error {
    statusCode;
    constructor(statusCode) {
        super(`Cambridge server error (HTTP ${statusCode})`);
        this.statusCode = statusCode;
    }
}
// ─── Main entry point ────────────────────────────────────────────────────────
const BASE_URL = 'https://dictionary.cambridge.org';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
/**
 * Look up a word on Cambridge Dictionary.
 * Returns null if the word is not found.
 * Throws CambridgeBlockedError / CambridgeServerError on HTTP errors.
 */
export async function cambridgeLookup(word, timeoutMs = 8000) {
    await jitterDelay();
    const encoded = encodeURIComponent(word.toLowerCase());
    const url = `${BASE_URL}/dictionary/english/${encoded}`;
    const html = await fetchPage(url, timeoutMs);
    if (html === null)
        return null;
    return parseContent(html, word);
}
// ─── HTTP ────────────────────────────────────────────────────────────────────
async function fetchPage(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': 'en-US,en;q=0.9',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        const code = response.status;
        if (code === 404)
            return null;
        if (code === 429 || code === 403)
            throw new CambridgeBlockedError(code);
        if (code >= 500)
            throw new CambridgeServerError(code);
        if (code < 200 || code >= 300)
            throw new Error(`Unexpected HTTP status: ${code}`);
        return await response.text();
    }
    finally {
        clearTimeout(timer);
    }
}
function jitterDelay() {
    const ms = 500 + Math.floor(Math.random() * 1500); // 0.5–2.0 s
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ─── Parsing ─────────────────────────────────────────────────────────────────
export function parseContent(html, word) {
    const $ = load(html);
    const headword = extractHeadword($) ?? word.toLowerCase();
    const [pronunciationBrE, pronunciationAmE] = extractPronunciations($);
    const entries = extractEntries($);
    const corpusExamples = extractCorpusExamples($);
    const wordFamily = extractWordFamily($);
    if (entries.length === 0)
        return null;
    return {
        headword,
        pronunciationBrE,
        pronunciationAmE,
        entries,
        corpusExamples,
        wordFamily,
    };
}
// ─── Headword ─────────────────────────────────────────────────────────────────
export function extractHeadword($) {
    const text = $('.headword').first().text() || $('.hw.dhw').first().text() || '';
    return clean(text) || null;
}
// ─── Pronunciations ───────────────────────────────────────────────────────────
export function extractPronunciations($) {
    return [extractIPA($, 'uk'), extractIPA($, 'us')];
}
function extractIPA($, regionClass) {
    const region = $(`.${regionClass}.dpron-i`).first();
    if (!region.length)
        return null;
    const ipa = region.find('.ipa.dipa').first().text();
    const text = clean(ipa);
    return text ? `/${text}/` : null;
}
// ─── Entries ─────────────────────────────────────────────────────────────────
export function extractEntries($) {
    // First entry-body in the document is the main English entry
    const mainBody = $('div.entry-body').first();
    if (!mainBody.length)
        return [];
    const entries = [];
    mainBody.find('div.pr.entry-body__el').each((_i, block) => {
        const entry = parseEntryBlock($, $(block));
        if (entry)
            entries.push(entry);
    });
    if (entries.length === 0)
        return [];
    // Find American Dictionary di-body and merge its examples
    const americanBody = findDiBody($, 'American');
    if (americanBody) {
        const americanEntries = [];
        americanBody.find('div.pr.entry-body__el').each((_i, block) => {
            const entry = parseEntryBlock($, $(block));
            if (entry)
                americanEntries.push(entry);
        });
        mergeExamples(americanEntries, entries);
    }
    return entries;
}
function findDiBody($, label) {
    let found = null;
    $('div.di-body').each((_i, el) => {
        const parent = $(el).parent();
        if (parent.find('div.di-head').text().includes(label)) {
            found = $(el);
            return false; // break
        }
    });
    return found;
}
function mergeExamples(source, target) {
    for (const srcEntry of source) {
        const tgtIdx = target.findIndex((e) => e.pos === srcEntry.pos);
        if (tgtIdx === -1)
            continue;
        const targetSenses = [...target[tgtIdx].senses];
        srcEntry.senses.forEach((srcSense, senseIdx) => {
            if (senseIdx >= targetSenses.length)
                return;
            const existing = new Set(targetSenses[senseIdx].examples);
            const newExamples = srcSense.examples.filter((ex) => !existing.has(ex));
            if (newExamples.length === 0)
                return;
            targetSenses[senseIdx] = {
                ...targetSenses[senseIdx],
                examples: [...targetSenses[senseIdx].examples, ...newExamples],
            };
        });
        target[tgtIdx] = { ...target[tgtIdx], senses: targetSenses };
    }
}
function parseEntryBlock($, block) {
    const posEl = block.find('b.pos.dpos, span.pos.dpos').first();
    const pos = posEl.length ? clean(posEl.text()) || null : null;
    const entryGrammar = block
        .find('.posgram .gram.dgram')
        .first()
        .text();
    const fallbackGrammar = entryGrammar ? cleanGrammar(entryGrammar) : null;
    const senses = parseSenses($, block, fallbackGrammar);
    if (senses.length === 0)
        return null;
    return { pos, senses };
}
// ─── Senses ───────────────────────────────────────────────────────────────────
function parseSenses($, block, fallbackGrammar) {
    const senses = [];
    block.find('div.dsense').each((_i, dsenseEl) => {
        const dsense = $(dsenseEl);
        const senseLabel = extractSenseLabel(dsense);
        dsense.find('div.ddef_block').each((_j, defBlockEl) => {
            const sense = parseDefBlock($, $(defBlockEl), senseLabel, fallbackGrammar);
            if (sense)
                senses.push(sense);
        });
    });
    return senses;
}
function extractSenseLabel(dsense) {
    const header = dsense.find('.dsense_h').first();
    if (!header.length)
        return null;
    const text = clean(header.clone().find('*').remove().end().text());
    const parenMatch = text.match(/\(([^)]+)\)/);
    if (parenMatch)
        return parenMatch[1].trim() || null;
    const spanText = clean(header.find('span').first().text());
    return spanText || null;
}
function parseDefBlock($, block, senseLabel, fallbackGrammar) {
    const cefrRaw = block.find('span.epp-xref').first().text();
    const cefrLevel = cefrRaw ? normalizeCEFR(clean(cefrRaw)) : null;
    const gramEl = block.find('.ddef_h .gram.dgram').first();
    const grammar = gramEl.length
        ? cleanGrammar(gramEl.text()) || fallbackGrammar
        : fallbackGrammar;
    const defEl = block.find('div.def.ddef_d').first();
    if (!defEl.length)
        return null;
    const definition = clean(defEl.text()).replace(/^:\s*/, '');
    if (!definition)
        return null;
    const patterns = [];
    const examples = [];
    block.find('.def-body .examp.dexamp').each((_i, exampEl) => {
        const examp = $(exampEl);
        const luText = clean(examp.find('span.lu.dlu').first().text());
        if (luText && !patterns.includes(luText))
            patterns.push(luText);
        const egText = clean(examp.find('span.eg.deg').first().text());
        if (egText)
            examples.push(egText);
    });
    // Accordion (More examples)
    block.find('li.eg.dexamp.hax').each((_i, el) => {
        const ex = clean($(el).text());
        if (ex)
            examples.push(ex);
    });
    const regEl = block.find('span.reg.dreg, span.lab.dlab').first();
    const register = regEl.length ? clean(regEl.text()) || null : null;
    return { cefrLevel, definition, examples, senseLabel, grammar, patterns, register };
}
// ─── Corpus examples ──────────────────────────────────────────────────────────
export function extractCorpusExamples($) {
    const results = [];
    $('div.lbb.lb-cm').each((_i, el) => {
        const block = $(el);
        const source = block.find('.dsource').text();
        if (!source.includes('Cambridge English Corpus'))
            return;
        const text = clean(block.find('span.deg').first().text());
        if (text)
            results.push(text);
    });
    return results;
}
// ─── Word family ──────────────────────────────────────────────────────────────
export function extractWordFamily($) {
    const wfBlock = $('div.lbb.lb-wf').first();
    if (!wfBlock.length)
        return [];
    const entries = [];
    wfBlock.find('div.lcs').each((_i, el) => {
        const group = $(el);
        const word = clean(group.find('.hw.dhw').first().text());
        if (!word)
            return;
        const poses = [];
        group.find('span.pos.dpos').each((_j, posEl) => {
            const p = clean($(posEl).text());
            if (p)
                poses.push(p);
        });
        entries.push({ word, partsOfSpeech: poses });
    });
    return entries;
}
// ─── Text helpers ─────────────────────────────────────────────────────────────
function clean(text) {
    return text.replace(/\s+/g, ' ').trim();
}
function cleanGrammar(raw) {
    return raw.replace(/\s+/g, ' ').trim();
}
function normalizeCEFR(text) {
    const upper = text.toUpperCase();
    return ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(upper) ? upper : null;
}
//# sourceMappingURL=cambridge-lookup.js.map