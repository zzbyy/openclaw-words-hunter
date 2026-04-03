import fs from 'node:fs/promises';
import path from 'node:path';
import lockfile from 'proper-lockfile';

function randomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function writeTextFileAtomic(filePath: string, content: string, tmpPrefix: string): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${tmpPrefix}-${base}-${randomSuffix()}.tmp`);

  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmp);
    } catch {
      // best effort cleanup
    }
    throw error;
  }
}

export async function withFileLock<T>(
  lockDir: string,
  lockName: string,
  fn: () => Promise<T>,
): Promise<T> {
  await fs.mkdir(lockDir, { recursive: true });
  const lockTarget = path.join(lockDir, lockName);
  await fs.writeFile(lockTarget, '', { flag: 'a' });

  const release = await lockfile.lock(lockTarget, {
    retries: { retries: 3, minTimeout: 100 },
  });

  try {
    return await fn();
  } finally {
    await release();
  }
}
