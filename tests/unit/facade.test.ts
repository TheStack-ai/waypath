import { assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createFacade } from '../../src/facade';

export function runFacadeUnitTest(): void {
  const facade = createFacade();
  const description = facade.describe();

  assertEqual(description.name, 'jarvis-fusion-facade');
  assertDeepEqual(description.host_shims, ['codex']);
  assertDeepEqual(description.verbs, ['session-start', 'recall', 'page', 'promote']);

  const session = facade.sessionStart({
    project: 'unit-project',
    objective: 'wire the facade',
    activeTask: 'test-run',
  });

  assertEqual(session.operation, 'session-start');
  assertEqual(session.session_id, 'unit-project:test-run');
  assertEqual(session.context_pack.current_focus.project, 'unit-project');
  assertEqual(session.context_pack.current_focus.activeTask, 'test-run');
}
