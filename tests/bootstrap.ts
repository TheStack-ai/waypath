import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

export const projectName = 'jarvis-fusion-system' as const;

export function projectRoot(currentDirectory: string = process.cwd()): string {
  return currentDirectory;
}

export function createTempDir(prefix = 'jarvis-fusion-system-'): string {
  return mkdtempSync(`${tmpdir()}/${prefix}`);
}
