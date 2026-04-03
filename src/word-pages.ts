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
    return head.includes('> [!info]');
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
