import fs from 'node:fs/promises';
import path from 'node:path';

const WORD_PAGE_HEAD_BYTES = 400;

export function isWordPageFilename(fileName: string): boolean {
  return fileName.endsWith('.md') && !fileName.startsWith('_') && !fileName.startsWith('.');
}

async function readFileHead(filePath: string, maxBytes: number): Promise<string> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

export async function isWordPage(filePath: string): Promise<boolean> {
  const base = path.basename(filePath);
  if (!isWordPageFilename(base)) return false;

  try {
    const head = await readFileHead(filePath, WORD_PAGE_HEAD_BYTES);
    // v3+: YAML frontmatter with type: word-page
    if (/^---\n[\s\S]*?type:\s*word-page[\s\S]*?\n---/m.test(head)) return true;
    // Legacy v1/v2 fallback for pages created before frontmatter
    return head.includes('> [!info]')
        || head.includes('> [!mastery]')
        || /^# .+\n\n\*\*Pronunciation:\*\*/.test(head);
  } catch {
    return false;
  }
}

export async function listWordPageFiles(wordsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(wordsDir);
  } catch {
    return [];
  }

  const files = entries.filter(isWordPageFilename);
  const pages: string[] = [];

  for (const file of files) {
    const fullPath = path.join(wordsDir, file);
    if (await isWordPage(fullPath)) {
      pages.push(file);
    }
  }

  return pages;
}
