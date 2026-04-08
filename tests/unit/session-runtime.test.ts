import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createSessionRuntime } from '../../src/session-runtime';

export function runSessionRuntimeUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-session-`);
  const runtime = createSessionRuntime({ storePath: `${root}/truth.db`, autoSeed: true });
  const pack = runtime.buildContextPack({
    project: 'demo-project',
    objective: 'prepare the codex shim',
    activeTask: 'bootstrap cli',
    seedEntities: ['entity-a', 'entity-b'],
  });

  assertEqual(pack.current_focus.project, 'demo-project');
  assertEqual(pack.current_focus.objective, 'prepare the codex shim');
  assertEqual(pack.current_focus.activeTask, 'bootstrap cli');
  assert(pack.truth_highlights.decisions.length > 0, 'expected seeded decisions');
  assert(pack.truth_highlights.preferences.length > 0, 'expected seeded preferences');
  assert(pack.truth_highlights.promoted_memories.length > 0, 'expected seeded promoted memories');
  assertDeepEqual(pack.graph_context.seed_entities, ['entity-a', 'entity-b']);
  assert(pack.graph_context.related_entities.length > 0, 'expected related entities from truth store');
  assertEqual(pack.evidence_appendix.enabled, false);
}
