import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createFacade } from '../../src/facade';

export async function runFacadeUnitTest(): Promise<void> {
  const root = mkdtempSync(`${tmpdir()}/waypath-facade-`);
  const facade = createFacade({ storePath: `${root}/truth.db`, autoSeed: true });
  const description = facade.describe();

  assertEqual(description.name, 'waypath-facade');
  assertDeepEqual(description.host_shims, ['codex']);
  assertDeepEqual(description.verbs, ['session-start', 'recall', 'page', 'promote', 'review', 'review-queue', 'inspect-page', 'inspect-candidate']);

  const session = facade.sessionStart({
    project: 'unit-project',
    objective: 'wire the facade',
    activeTask: 'test-run',
  });

  assertEqual(session.operation, 'session-start');
  assertEqual(session.session_id, 'unit-project:test-run');
  assertEqual(session.context_pack.current_focus.project, 'unit-project');
  assertEqual(session.context_pack.current_focus.activeTask, 'test-run');
  assertEqual(session.context_pack.evidence_appendix.enabled, true);
  assert(session.context_pack.evidence_appendix.bundles.length > 0, 'expected evidence appendix bundle ids');

  const recall = facade.recall('shared backend');
  assertEqual(recall.status, 'ready');
  const bundle = await Promise.resolve(recall.bundle);
  assert(bundle && bundle.items.length > 0, 'expected recall bundle items');
  assert(bundle?.items.some((item) => item.title.includes('Decision:')), 'expected truth-backed evidence items');

  const page = facade.page('unit-project');
  assertEqual(page.status, 'ready');
  assert(page.page?.summary_markdown.includes('# unit-project'), 'expected synthesized page markdown');
  assert(page.page?.summary_markdown.includes('## Evidence bundles'), 'expected evidence bundle section');

  const promote = facade.promote('remember this decision');
  assertEqual(promote.status, 'ready');
  assert(promote.candidate?.summary.includes('Promotion candidate recorded'), 'expected promotion summary');
  assertEqual(promote.candidate?.status, 'pending_review');

  const review = facade.review(promote.candidate!.candidate_id, 'accepted', 'Approved for promotion');
  assertEqual(review.status, 'ready');
  assertEqual(review.candidate?.status, 'accepted');
  assert(review.candidate?.summary.includes('Approved for promotion'), 'expected persisted review notes');

  const queue = facade.reviewQueue();
  assertEqual(queue.status, 'ready');
  assert(queue.pending_review.length === 0, 'expected accepted candidate to leave pending queue');

  const pageInspect = facade.inspectPage('page:session:unit-project');
  assertEqual(pageInspect.status, 'ready');
  assert(pageInspect.page?.summary_markdown.includes('# unit-project'), 'expected page inspect result');
  assert(pageInspect.page?.linked_evidence_bundle_ids.length, 'expected persisted page evidence bundle ids');

  const candidateInspect = facade.inspectCandidate(promote.candidate!.candidate_id);
  assertEqual(candidateInspect.status, 'ready');
  assertEqual(candidateInspect.candidate?.status, 'accepted');

  facade.close();

  const limitedFacade = createFacade({ storePath: `${root}/limited-truth.db`, autoSeed: true, reviewQueueLimit: 1 });
  limitedFacade.promote('first queued item');
  limitedFacade.promote('second queued item');
  const limitedQueue = limitedFacade.reviewQueue();
  assertEqual(limitedQueue.pending_review.length, 1, 'expected review queue limit to apply');
  limitedFacade.close();
}
