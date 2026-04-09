import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertEqual } from '../../src/shared/assert';
import { loadRuntimeConfig } from '../../src/shared/config';

export function runRuntimeConfigUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-config-`);
  const configPath = join(root, 'config.toml');
  writeFileSync(
    configPath,
    [
      '[source_adapters]',
      'jarvis-memory-db = false',
      '',
      '[retrieval.source_system_weights]',
      'truth-kernel = 1.7',
      '',
      '[retrieval.source_kind_weights]',
      'decision = 0.25',
      '',
      '[import]',
      'allow_missing_local_readers = true',
      '',
      '[review_queue]',
      'limit = 3',
      '',
    ].join('\n'),
  );

  const loaded = loadRuntimeConfig({
    cwd: root,
    env: {
      WAYPATH_SOURCE_ADAPTER_JARVIS_MEMORY_DB: 'true',
      WAYPATH_RECALL_WEIGHT_SOURCE_SYSTEM_TRUTH_KERNEL: '2.5',
      WAYPATH_REVIEW_QUEUE_LIMIT: '6',
    },
  });

  assertEqual(loaded.configPath, configPath);
  assertEqual(loaded.config.sourceAdapters?.enabled?.['jarvis-memory-db'], true);
  assertEqual(loaded.config.retrieval?.weights?.sourceSystems?.['truth-kernel'], 2.5);
  assertEqual(loaded.config.retrieval?.weights?.sourceKinds?.decision, 0.25);
  assertEqual(loaded.config.import?.allowMissingLocalReaders, true);
  assertEqual(loaded.config.reviewQueue?.limit, 6);
}
