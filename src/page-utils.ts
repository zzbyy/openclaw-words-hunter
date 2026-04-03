import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolResult, VaultConfig, ok, err } from './types.js';
import { wordsFolderPath, assertInVault, validateWord } from './vault.js';
import { writeTextFileAtomic } from './io-utils.js';

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wordBoundaryRegex(word: string, flags = 'i'): RegExp {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, flags);
}

export function prependLineToSection(content: string, heading: string, line: string): string {
  const headingPattern = escapeRegex(heading);
  const sectionRegex = new RegExp(`^${headingPattern}\\n`, 'm');
  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, `${heading}\n${line}\n`);
  }
  return `${content}\n\n${heading}\n${line}\n`;
}

export function insertSectionAfterInfoBlock(content: string, heading: string, body: string, divider = '---'): string {
  const block = divider
    ? `\n${heading}\n${body}\n\n${divider}\n`
    : `\n${heading}\n${body}\n`;
  const infoEndRegex = /^(> \[!info\][^\n]*\n(?:>[^\n]*\n)*)/m;
  const match = infoEndRegex.exec(content);

  if (!match) {
    return divider
      ? `${heading}\n${body}\n\n${divider}\n\n${content}`
      : `${heading}\n${body}\n\n${content}`;
  }

  const insertAt = match.index + match[0].length;
  return content.slice(0, insertAt) + block + content.slice(insertAt);
}

export function insertSectionAfterCallout(content: string, calloutName: string, heading: string, body: string): string {
  const calloutRegex = new RegExp(`(> \\[!${escapeRegex(calloutName)}\\][\\s\\S]*?)(\\n\\n|\\n##|\\n---)`, 'm');
  if (calloutRegex.test(content)) {
    return content.replace(calloutRegex, `$1\n\n${heading}\n${body}\n$2`);
  }
  return `${content}\n\n${heading}\n${body}\n`;
}

export async function readWordPage(
  config: VaultConfig,
  word: string,
): Promise<ToolResult<{ wordLower: string; mdPath: string; content: string }>> {
  const wordErr = validateWord(word);
  if (wordErr) return { ok: false, error: wordErr };

  const wordLower = word.toLowerCase();
  const wordsDir = wordsFolderPath(config);
  const mdPath = path.join(wordsDir, `${wordLower}.md`);

  const escapeErr = assertInVault(config.vault_path, mdPath);
  if (escapeErr) return { ok: false, error: escapeErr };

  try {
    const content = await fs.readFile(mdPath, 'utf8');
    return ok({ wordLower, mdPath, content });
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return err({ code: 'FILE_NOT_FOUND', message: `Word page '${wordLower}.md' not found.`, word: wordLower });
    }
    return err({ code: 'WRITE_FAILED', message: `Could not read '${wordLower}.md': ${String(e)}` });
  }
}

export async function writeWordPageAtomic(mdPath: string, content: string, tmpPrefix: string): Promise<ToolResult<void>> {
  try {
    await writeTextFileAtomic(mdPath, content, tmpPrefix);
    return ok(undefined);
  } catch (e) {
    return err({ code: 'WRITE_FAILED', message: `Could not write '${path.basename(mdPath)}': ${String(e)}` });
  }
}
