/**
 * fill-word-page.ts
 *
 * Fills lookup-time template variables in a word page after Cambridge lookup.
 * Ported from WordPageUpdater.swift — kept in exact behavioural parity.
 *
 * Variables filled:
 *   {{pronunciation-bre}} — BrE IPA (e.g. "/ˈpɒz.ɪt/"), empty string if unavailable
 *   {{pronunciation-ame}} — AmE IPA, empty string if unavailable
 *   {{cefr}}             — entry-level CEFR first, then first sense-level, "—" if none
 *   {{meanings}}         — sense blocks: definition heading · grammar · cefr, patterns, examples
 *   {{corpus-examples}}  — Cambridge Corpus sentences with bold lemma forms
 *   {{when-to-use}}      — register/domain labels per sense
 *   {{word-family}}      — related word forms from the Cambridge word family box
 *   {{see-also}}         — [[wikilinks]] for vault words appearing in definitions/examples
 *   {{collocations}}     — legacy placeholder (empty output, kept for compat)
 *   {{nearby-words}}     — legacy placeholder (empty output, kept for compat)
 *   {{syllables}}        — legacy MW placeholder (headword)
 *   {{pronunciation}}    — legacy MW placeholder (combined BrE · AmE)
 *
 * Safety: aborts silently if the file is gone or has no lookup-time vars.
 * Writes atomically via tmp file + rename.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { CambridgeContent, CambridgeEntry, CambridgeSense } from './cambridge-lookup.js';
import type { VaultConfig } from './types.js';
import { wordsFolderPath } from './vault.js';

/** All template variables this filler can handle (mirrors WordPageCreator.allLookupVariables). */
const LOOKUP_VARS = [
  // Current Cambridge-era variables
  '{{pronunciation-bre}}',
  '{{pronunciation-ame}}',
  '{{cefr}}',
  '{{meanings}}',
  '{{corpus-examples}}',
  '{{when-to-use}}',
  '{{word-family}}',
  '{{see-also}}',
  // Legacy Oxford/MW variables — kept so old pages are still detected as fillable
  '{{collocations}}',
  '{{nearby-words}}',
  // Legacy MW-era variables
  '{{syllables}}',
  '{{pronunciation}}',
];

/**
 * Fill template variables in a word's .md page with Cambridge lookup data.
 * Returns 'ok' | 'not_found' | 'no_vars' | 'write_failed'.
 */
export async function fillWordPage(
  config: VaultConfig,
  word: string,
  content: CambridgeContent,
): Promise<'ok' | 'no_vars' | 'write_failed'> {
  const wordsDir = wordsFolderPath(config);
  const filePath = path.join(wordsDir, `${word}.md`);

  let text: string;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return 'no_vars'; // file deleted between create and fill — skip silently
  }

  const hasVars = LOOKUP_VARS.some((v) => text.includes(v));
  if (!hasVars) return 'no_vars';

  // Scan vault for related words (for {{see-also}})
  const relatedWords = await scanVaultForRelated(config, content, word);

  let updated = text;

  // {{syllables}} — headword from Cambridge (may include · dots)
  if (updated.includes('{{syllables}}')) {
    updated = updated.replaceAll('{{syllables}}', content.headword);
  }

  // {{pronunciation}} — combined "BrE /x/ · AmE /y/" (legacy placeholder)
  if (updated.includes('{{pronunciation}}')) {
    const parts: string[] = [];
    if (content.pronunciationBrE) parts.push(`BrE ${content.pronunciationBrE}`);
    if (content.pronunciationAmE) parts.push(`AmE ${content.pronunciationAmE}`);
    const pron = parts.length > 0 ? parts.join(' · ') : '—';
    updated = updated.replaceAll('{{pronunciation}}', pron);
  }

  // {{pronunciation-bre}} / {{pronunciation-ame}} — split pronunciation (empty string if unavailable, matching Swift)
  if (updated.includes('{{pronunciation-bre}}')) {
    updated = updated.replaceAll('{{pronunciation-bre}}', content.pronunciationBrE ?? '');
  }
  if (updated.includes('{{pronunciation-ame}}')) {
    updated = updated.replaceAll('{{pronunciation-ame}}', content.pronunciationAmE ?? '');
  }

  // {{cefr}} — entry-level first, then first sense-level (matches extractBestCEFR in Swift)
  if (updated.includes('{{cefr}}')) {
    updated = updated.replaceAll('{{cefr}}', extractBestCEFR(content));
  }

  // {{meanings}} — sense blocks
  if (updated.includes('{{meanings}}')) {
    const meaningsBlock = buildMeaningsBlock(content, word);
    updated = updated.replaceAll('{{meanings}}', meaningsBlock ?? '*(no definitions found)*');
  }

  // {{corpus-examples}} — Cambridge corpus sentences with bold lemma
  if (updated.includes('{{corpus-examples}}')) {
    updated = updated.replaceAll('{{corpus-examples}}', buildCorpusExamplesBlock(content, word));
  }

  // {{when-to-use}} — register/domain labels
  if (updated.includes('{{when-to-use}}')) {
    updated = updated.replaceAll('{{when-to-use}}', buildWhenToUseBlock(content));
  }

  // {{word-family}} — related word forms
  if (updated.includes('{{word-family}}')) {
    updated = updated.replaceAll('{{word-family}}', buildWordFamilyBlock(content));
  }

  // {{collocations}} — legacy placeholder (Cambridge has no collocation data; output empty note)
  if (updated.includes('{{collocations}}')) {
    updated = updated.replaceAll('{{collocations}}', '*(no collocations available)*');
  }

  // {{nearby-words}} — legacy placeholder (not scraped from Cambridge)
  if (updated.includes('{{nearby-words}}')) {
    updated = updated.replaceAll('{{nearby-words}}', '*(no nearby words available)*');
  }

  // {{see-also}} — vault wikilinks
  if (updated.includes('{{see-also}}')) {
    const seeAlso =
      relatedWords.length > 0
        ? relatedWords.map((w) => `- [[${w}]]`).join('\n')
        : '*(no related words found yet)*';
    updated = updated.replaceAll('{{see-also}}', seeAlso);
  }

  // Atomic write
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.wh-fill-${Date.now()}.md.tmp`);
  try {
    await fs.writeFile(tmp, updated, 'utf8');
    await fs.rename(tmp, filePath);
    return 'ok';
  } catch (e) {
    try { await fs.unlink(tmp); } catch { /* best effort */ }
    return 'write_failed';
  }
}

// ─── Meanings block ───────────────────────────────────────────────────────────

/**
 * Builds the meanings block. Matches buildMeaningsBlock in WordPageUpdater.swift exactly:
 * - Heading is just the definition (no POS prefix; POS is contextual, not in heading)
 * - Grammar and CEFR appended to heading with " · " separator
 * - Patterns rendered as bullet sub-list
 * - Examples with boldLemma applied
 */
function buildMeaningsBlock(content: CambridgeContent, lemma: string): string | null {
  const allSenses: Array<[CambridgeEntry, CambridgeSense]> = content.entries.flatMap(
    (entry) => entry.senses.map((s): [CambridgeEntry, CambridgeSense] => [entry, s]),
  );
  if (allSenses.length === 0) return null;

  const blocks: string[] = [];
  for (const [_entry, sense] of allSenses) {
    let heading = sense.definition;
    if (sense.grammar) heading += ` · ${sense.grammar}`;
    if (sense.cefrLevel) heading += ` · ${sense.cefrLevel}`;

    let block = `\n### ${heading}\n\n`;

    if (sense.patterns.length > 0) {
      block += '- **Patterns**:\n';
      for (const pattern of sense.patterns) {
        block += `  - \`${pattern}\`\n`;
      }
    }

    for (const example of sense.examples) {
      block += `- ${boldLemma(example, lemma)}\n`;
    }

    blocks.push(block);
  }

  return blocks.join('\n---\n') + '\n\n---\n';
}

// ─── CEFR helper ─────────────────────────────────────────────────────────────

/**
 * Matches extractBestCEFR in WordPageUpdater.swift:
 * 1. Try entry-level cefrLevel (not scraped by Cambridge currently, future-proof)
 * 2. Fall back to first sense-level cefrLevel
 * 3. Return "—" if nothing found
 */
function extractBestCEFR(content: CambridgeContent): string {
  // Entry-level (future-proof — Cambridge doesn't expose this yet but Swift checks it)
  for (const entry of content.entries) {
    if ((entry as CambridgeEntry & { cefrLevel?: string | null }).cefrLevel) {
      return (entry as CambridgeEntry & { cefrLevel?: string | null }).cefrLevel!;
    }
  }
  // First sense-level
  for (const entry of content.entries) {
    for (const sense of entry.senses) {
      if (sense.cefrLevel) return sense.cefrLevel;
    }
  }
  return '—';
}

// ─── Corpus examples block ────────────────────────────────────────────────────

/**
 * Matches buildCorpusExamplesBlock in WordPageUpdater.swift:
 * - Each example has boldLemma applied
 * - Fallback text matches Swift exactly
 */
function buildCorpusExamplesBlock(content: CambridgeContent, lemma: string): string {
  if (content.corpusExamples.length === 0) {
    return '*(no corpus examples available)*';
  }
  return content.corpusExamples
    .map((ex) => `- ${boldLemma(ex, lemma)}`)
    .join('\n');
}

// ─── When to use block ────────────────────────────────────────────────────────

function buildWhenToUseBlock(content: CambridgeContent): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const entry of content.entries) {
    for (const sense of entry.senses) {
      if (sense.register && !seen.has(sense.register.toLowerCase())) {
        seen.add(sense.register.toLowerCase());
        labels.push(sense.register);
      }
    }
  }

  if (labels.length > 0) {
    return `**Register:** ${labels.join(', ')}\n`;
  }
  return '**Where it fits:**\n**In casual speech:**\n';
}

// ─── Word family block ────────────────────────────────────────────────────────

function buildWordFamilyBlock(content: CambridgeContent): string {
  if (content.wordFamily.length === 0) {
    return '*(no word family data found — add related forms manually)*\n';
  }
  return (
    content.wordFamily
      .map((entry) => {
        const pos =
          entry.partsOfSpeech.length > 0
            ? ` — ${entry.partsOfSpeech.join(', ')}`
            : '';
        return `- **${entry.word}**${pos}`;
      })
      .join('\n') + '\n'
  );
}

// ─── See Also — vault scanner ─────────────────────────────────────────────────

/**
 * Scan the vault for words that appear in the content's definitions/examples.
 * Returns word filenames (without .md) that are already in the vault.
 */
async function scanVaultForRelated(
  config: VaultConfig,
  content: CambridgeContent,
  excludeWord: string,
): Promise<string[]> {
  const wordsDir = wordsFolderPath(config);
  let files: string[];
  try {
    files = await fs.readdir(wordsDir);
  } catch {
    return [];
  }

  const vaultWords = files
    .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
    .map((f) => f.slice(0, -3).toLowerCase())
    .filter((w) => w !== excludeWord.toLowerCase());

  if (vaultWords.length === 0) return [];

  // Build a corpus from definitions and examples
  const allSenses = content.entries.flatMap((e) => e.senses);
  const corpus = [
    ...allSenses.map((s) => s.definition),
    ...allSenses.flatMap((s) => s.examples),
  ]
    .join(' ')
    .toLowerCase();

  const related: string[] = [];
  for (const vw of vaultWords) {
    const regex = new RegExp(`\\b${escapeRegex(vw)}\\b`, 'i');
    if (regex.test(corpus)) related.push(vw);
  }
  return related;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function boldLemma(text: string, lemma: string): string {
  if (!lemma) return text;
  const escaped = escapeRegex(lemma);
  return text.replace(new RegExp(`\\b(${escaped}\\w*)`, 'gi'), '**$1**');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
