import { assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createRetrievalStrategy } from '../../src/archive-kernel/retrieval/index.js';

export function runRetrievalStrategyUnitTest(): void {
  const strategy = createRetrievalStrategy({ query: 'ranking candidate' });
  assertDeepEqual(strategy.tokens, ['ranking', 'candidate']);

  const ranked = strategy.score({
    title: 'Ranking candidate',
    excerpt: 'Supports the ranking candidate path.',
    sourceRef: 'truth:ranking-candidate',
    provenanceConfidence: 0.6,
    sourceSystem: 'jarvis-brain-db',
    sourceKind: 'decision',
    graphRelevance: 0.4,
    baseScore: 1,
  });
  assertEqual(ranked.lexical, 6);
  assertEqual(ranked.provenance, 0.6);
  assertEqual(ranked.sourceSystem, 0.95);
  assertEqual(ranked.sourceKind, 0.8);
  assertEqual(ranked.graphRelevance, 0.4);
  assertEqual(ranked.base, 1);
  assertEqual(ranked.vector, 0);
  assertEqual(Number(ranked.total.toFixed(2)), 9.75);

  const noMatch = strategy.score({
    title: 'Off topic context',
    excerpt: 'Fallback evidence from an unrelated source.',
    sourceRef: 'truth:disconnected',
    provenanceConfidence: 0.9,
    sourceSystem: 'truth-kernel',
    sourceKind: 'decision',
    graphRelevance: 1.2,
  });
  assertEqual(noMatch.total, 0);

  const vectorStrategy = createRetrievalStrategy({
    query: 'latent neighbor',
    vectorHook: ({ query, tokens, candidate }) => {
      assertEqual(query, 'latent neighbor');
      assertDeepEqual(tokens, ['latent', 'neighbor']);
      assertEqual(candidate.sourceRef, 'truth:semantic');
      return 2.4;
    },
  });

  const vectorOnly = vectorStrategy.score({
    title: 'Disconnected context',
    excerpt: 'Vector similarity can revive a non-lexical candidate later.',
    sourceRef: 'truth:semantic',
    provenanceConfidence: 0.5,
    sourceSystem: 'truth-kernel',
    sourceKind: 'decision',
    graphRelevance: 0.3,
  });
  assertEqual(vectorOnly.lexical, 0);
  assertEqual(vectorOnly.vector, 2.4);
  assertEqual(Number(vectorOnly.total.toFixed(2)), 5.1);
}
