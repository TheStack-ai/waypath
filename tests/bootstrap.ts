import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectName = 'jarvis-fusion-system' as const;

export function projectRoot(currentFileUrl: string = import.meta.url): string {
  return resolve(dirname(fileURLToPath(currentFileUrl)), '..');
}

export function createTempDir(prefix = 'jarvis-fusion-system-'): string {
  return mkdtempSync(`${tmpdir()}/${prefix}`);
}
