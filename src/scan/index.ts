/**
 * Scan module — CLI entry point and public API.
 */

export { scanForChanges, type ScanResult, type ScanChangeItem } from './scanner.js';

import type { CliIo, CliArgs } from '../shared/cli.js';
import { writeLine } from '../shared/cli.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from '../jarvis_fusion/truth-kernel/index.js';
import { scanForChanges } from './scanner.js';

/**
 * CLI handler for `waypath scan`.
 */
export function runScanCli(parsed: CliArgs, io: CliIo): number {
  const project = parsed.project ?? parsed.projectName ?? 'waypath';
  const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
  const store = createTruthKernelStorage(storePath, { autoMigrate: true });

  try {
    const result = scanForChanges(store, { project });

    if (parsed.json) {
      writeLine(io, JSON.stringify(result, null, 2));
    } else {
      writeLine(io, result.message);
      if (result.changes.length > 0) {
        for (const change of result.changes) {
          writeLine(io, `  [${change.change_type}] ${change.source}: ${change.title}`);
        }
      }
    }

    return 0;
  } finally {
    store.close();
  }
}
