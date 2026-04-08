import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assertEqual } from '../../src/shared/assert';
import { runBootstrapImport, toImportResult } from '../../src/jarvis_fusion/bootstrap-import';
import { createTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel';

export function runSourceReaderBootstrapUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-import-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  const result = runBootstrapImport(store, { manifest_id: 'demo-import', import_mode: 'bootstrap', reader_names: ['demo-source'] }, 'demo-project');
  assertEqual(result.imported_entities, 1);
  assertEqual(result.imported_decisions, 1);
  assertEqual(result.imported_preferences, 1);
  assertEqual(result.imported_memories, 1);
  assertEqual(result.imported_promotion_candidates, 1);
  const importResult = toImportResult(result, store.location);
  assertEqual(importResult.counts.entities, 1);
  assertEqual(importResult.counts.promoted_candidates, 1);
  store.close();
}
