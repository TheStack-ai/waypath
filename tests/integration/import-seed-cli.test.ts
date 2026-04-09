import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assertEqual } from '../../src/shared/assert';
import { runCli } from '../../src/cli';

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write(chunk: string) { stdout.push(chunk); } },
      stderr: { write(chunk: string) { stderr.push(chunk); } },
    },
  };
}

export function runImportSeedCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-import-cli-`);
  const captured = captureIo();
  const exitCode = runCli(['import-seed', '--json', '--project', 'demo-project', '--store-path', `${root}/truth.db`], captured.io);
  assertEqual(exitCode, 0);
  const result = JSON.parse(captured.stdout.join('')) as { counts: { entities: number; promoted_candidates: number } };
  assertEqual(result.counts.entities, 1);
  assertEqual(result.counts.promoted_candidates, 1);
}
