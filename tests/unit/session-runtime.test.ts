import { assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createSessionRuntime } from '../../src/session-runtime';

export function runSessionRuntimeUnitTest(): void {
  const runtime = createSessionRuntime();
  const pack = runtime.buildContextPack({
    project: 'demo-project',
    objective: 'prepare the codex shim',
    activeTask: 'bootstrap cli',
    seedEntities: ['entity-a', 'entity-b'],
  });

  assertEqual(pack.current_focus.project, 'demo-project');
  assertEqual(pack.current_focus.objective, 'prepare the codex shim');
  assertEqual(pack.current_focus.activeTask, 'bootstrap cli');
  assertDeepEqual(pack.truth_highlights.entities, ['entity-a', 'entity-b']);
  assertDeepEqual(pack.graph_context.seed_entities, ['entity-a', 'entity-b']);
  assertEqual(pack.evidence_appendix.enabled, true);
}
