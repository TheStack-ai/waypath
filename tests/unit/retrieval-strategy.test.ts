import { assertEqual } from '../../src/shared/assert';
import { createRetrievalStrategy } from '../../src/archive-kernel/retrieval';

export function runRetrievalStrategyUnitTest(): void {
  const archiveStrategy = createRetrievalStrategy({ profile: 'archive-recall' });
  const matched = archiveStrategy.score(
    {
      id: 'evidence:1',
      kind: 'archive-evidence',
      title: 'Shared backend host shims',
      excerpt: 'Keep a shared backend with thin host shims.',
      sourceRef: 'truth:decision:shared-backend',
      sourceSystem: 'truth-kernel',
      sourceKind: 'decision',
      confidence: 0.6,
    },
    'shared backend',
  );
  const missed = archiveStrategy.score(
    {
      id: 'evidence:2',
      kind: 'archive-evidence',
      title: 'Promotion review policy',
      excerpt: 'Review queue remains explicit.',
      sourceRef: 'truth:decision:promotion-review',
      sourceSystem: 'truth-kernel',
      sourceKind: 'decision',
      confidence: 0.6,
    },
    'shared backend',
  );

  assertEqual(missed.total, 0, 'archive recall should gate non-lexical matches');
  assertEqual(matched.total > missed.total, true, 'archive recall should retain lexical matches');

  const vectorBoosted = createRetrievalStrategy({
    profile: 'session-runtime',
    vectorHook: {
      score() {
        return 2.25;
      },
    },
  });
  const sessionScore = vectorBoosted.score(
    {
      id: 'entity:project',
      kind: 'session-entity',
      title: 'demo-project',
      excerpt: 'Prepare the codex shim',
      sourceRef: 'truth:project:demo-project',
      sourceSystem: 'truth-kernel',
      sourceKind: 'project',
      confidence: 0.9,
      baseline: 4.4,
      graphRelevance: 1.35,
    },
    ['demo-project', 'codex'],
  );

  assertEqual(sessionScore.lexical, 0, 'session runtime should preserve zero lexical weighting by default');
  assertEqual(sessionScore.vector, 2.25, 'session runtime should expose a future vector hook boundary');
}
