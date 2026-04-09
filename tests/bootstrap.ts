import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

export const projectName = 'waypath' as const;

export function projectRoot(currentDirectory: string = process.cwd()): string {
  return currentDirectory;
}

export function createTempDir(prefix = 'waypath-'): string {
  return mkdtempSync(`${tmpdir()}/${prefix}`);
}
