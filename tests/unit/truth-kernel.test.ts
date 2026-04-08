import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import {
  createTruthKernelStorage,
  ensureTruthKernelSeedData,
  loadSessionStartSnapshot,
} from '../../src/jarvis_fusion/truth-kernel';

export function runTruthKernelUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-truth-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store, {
    project: 'unit-project',
    objective: 'exercise sqlite truth',
    activeTask: 'truth-kernel-test',
  });

  const snapshot = loadSessionStartSnapshot(store, { projectEntityId: 'project:unit-project' });

  assert(snapshot.entities.length > 0, 'expected seeded entities');
  assert(snapshot.decisions.length > 0, 'expected seeded decisions');
  assert(snapshot.preferences.length > 0, 'expected seeded preferences');
  assert(snapshot.promotedMemories.length > 0, 'expected seeded promoted memories');
  assertEqual(snapshot.entities[0]?.entity_id, 'project:unit-project');
  assertDeepEqual(snapshot.preferences.map((preference) => preference.key), ['host_rollout']);

  store.close();
}
