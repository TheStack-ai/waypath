import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createFacade } from '../../src/facade';

export async function runFacadeUnitTest(): Promise<void> {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-facade-`);
  const facade = createFacade({ storePath: `${root}/truth.db`, autoSeed: true });
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

  const recall = facade.recall('memory governance');
  assertEqual(recall.status, 'ready');
  const bundle = await Promise.resolve(recall.bundle);
  assert(bundle && bundle.items.length > 0, 'expected recall bundle items');

  const page = facade.page('unit-project');
  assertEqual(page.status, 'ready');
  assert(page.page?.summary_markdown.includes('# unit-project'), 'expected synthesized page markdown');

  const promote = facade.promote('remember this decision');
  assertEqual(promote.status, 'ready');
  assert(promote.candidate?.summary.includes('Promotion candidate recorded'), 'expected promotion summary');
  assertEqual(promote.candidate?.status, 'pending_review');
}
