import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createFacade } from '../../src/facade';

export async function runFacadeUnitTest(): Promise<void> {
  const root = mkdtempSync(`${tmpdir()}/waypath-facade-`);
  const facade = createFacade({ storePath: `${root}/truth.db`, autoSeed: true });
  const description = facade.describe();

  assertEqual(description.name, 'waypath-facade');
  assertDeepEqual(description.host_shims, ['codex', 'claude-code']);
  assertDeepEqual(description.verbs, ['session-start', 'recall', 'page', 'promote', 'review', 'review-queue', 'inspect-page', 'inspect-candidate', 'graph-query', 'resolve-contradiction', 'refresh-page']);

  const session = facade.sessionStart({
    project: 'unit-project',
    objective: 'wire the facade',
    activeTask: 'test-run',
  });

  assertEqual(session.operation, 'session-start');
  assertEqual(session.session_id, 'unit-project:test-run');
  assertEqual(session.context_pack.current_focus.project, 'unit-project');
  assertEqual(session.context_pack.current_focus.activeTask, 'test-run');
  assertEqual(
    session.context_pack.evidence_appendix.enabled,
    session.context_pack.evidence_appendix.bundles.length > 0,
  );

  const recall = facade.recall('shared backend');
  assertEqual(recall.status, 'ready');
  const bundle = await Promise.resolve(recall.bundle);
  const truthBundle = await Promise.resolve(recall.truth_bundle);
  assert(bundle !== undefined, 'expected archive recall bundle');
  assert(truthBundle && truthBundle.items.length > 0, 'expected truth-direct recall bundle');
  assert(
    truthBundle.items.some((item) => item.title.includes('Decision:')),
    'expected truth bundle to include truth-backed evidence items',
  );
  assert(
    bundle.items.every((item) => {
      const sourceSystem = String(item.metadata.source_system ?? '');
      return sourceSystem === 'jarvis-memory-db' || sourceSystem === 'mempalace';
    }),
    'expected archive bundle to contain archive-only sources',
  );

  const page = facade.page('unit-project');
  assertEqual(page.status, 'ready');
  assert(page.page?.summary_markdown.includes('# unit-project'), 'expected synthesized page markdown');
  assertEqual(page.page?.page.page_type, 'session_brief');

  const projectPage = facade.page('project:unit-project');
  assertEqual(projectPage.page?.page.page_type, 'project_page');

  const entityPage = facade.page('system:unit-project:codex-shim');
  assertEqual(entityPage.page?.page.page_type, 'entity_page');

  const decisionPage = facade.page('decision:unit-project:shared-backend-host-shims');
  assertEqual(decisionPage.page?.page.page_type, 'decision_page');

  const promote = facade.promote('remember this decision');
  assertEqual(promote.status, 'ready');
  assert(promote.candidate !== undefined, 'expected promotion candidate');
  assertEqual(promote.candidate?.status, 'pending_review');

  const review = facade.review(promote.candidate!.candidate_id, 'accepted', 'Approved for promotion');
  assertEqual(review.status, 'ready');
  assertEqual(review.candidate?.status, 'accepted');

  const queue = facade.reviewQueue();
  assertEqual(queue.status, 'ready');
  assert(queue.pending_review.length === 0, 'expected accepted candidate to leave pending queue');

  const pageInspect = facade.inspectPage(page.page?.page.page_id ?? 'page:session:unit-project');
  assertEqual(pageInspect.status, 'ready');
  assert(pageInspect.page?.summary_markdown.includes('unit-project'), 'expected page inspect result');

  const candidateInspect = facade.inspectCandidate(promote.candidate!.candidate_id);
  assertEqual(candidateInspect.status, 'ready');
  assertEqual(candidateInspect.candidate?.status, 'accepted');

  // graph-query: plain expansion
  const graphResult = facade.graphQuery('project:unit-project');
  assertEqual(graphResult.operation, 'graph-query');
  assertEqual(graphResult.status, 'ready');
  assert(graphResult.result.seed_entities.length > 0, 'expected seed entities');

  // graph-query: pattern-based expansion
  const patternResult = facade.graphQuery('project:unit-project', 'project_context');
  assertEqual(patternResult.operation, 'graph-query');
  assertEqual(patternResult.status, 'ready');

  facade.close();

  const limitedFacade = createFacade({ storePath: `${root}/limited-truth.db`, autoSeed: true, reviewQueueLimit: 1 });
  limitedFacade.promote('first queued item');
  limitedFacade.promote('second queued item');
  const limitedQueue = limitedFacade.reviewQueue();
  assertEqual(limitedQueue.pending_review.length, 1, 'expected review queue limit to apply');
  limitedFacade.close();
}
