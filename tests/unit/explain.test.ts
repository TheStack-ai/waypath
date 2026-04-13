import { createTruthKernelStorage, ensureTruthKernelSeedData } from '../../src/jarvis_fusion/truth-kernel/index.js';
import { createFacade } from '../../src/facade/facade.js';
import { assert, assertEqual } from '../../src/shared/assert';

function nowIso(): string {
  return new Date().toISOString();
}

function createSeededStore() {
  const store = createTruthKernelStorage(':memory:');
  ensureTruthKernelSeedData(store, { project: 'alpha', objective: 'build v1', activeTask: 'implement' });

  const ts = nowIso();
  store.upsertEntity({ entity_id: 'tool:sqlite', entity_type: 'tool', name: 'SQLite', summary: 'Local-first embedded database engine', state_json: '{}', status: 'active', canonical_page_id: null, created_at: ts, updated_at: ts });
  store.upsertDecision({ decision_id: 'decision:use-sqlite', title: 'Use SQLite for truth kernel', statement: 'SQLite chosen for local-first zero-dependency persistence.', status: 'active', scope_entity_id: 'project:alpha', effective_at: ts, superseded_by: null, provenance_id: null, created_at: ts, updated_at: ts });
  store.upsertPromotedMemory({ memory_id: 'memory:local-first', memory_type: 'semantic', access_tier: 'ops', summary: 'Local-first architecture is a core design principle', content: 'Waypath runs locally with zero npm dependencies and Node 25+ native SQLite.', subject_entity_id: 'project:alpha', status: 'active', provenance_id: null, created_at: ts, updated_at: ts });

  return store;
}

export function testExplainReturnsExplainResult(): void {
  const store = createSeededStore();
  const facade = createFacade({ store });
  try {
    const result = facade.explain('SQLite');
    assertEqual(result.operation, 'explain');
    assertEqual(result.status, 'ready');
    assertEqual(result.query, 'SQLite');
    assert(Array.isArray(result.truth_results), 'truth_results should be array');
    assert(Array.isArray(result.archive_results), 'archive_results should be array');
  } finally {
    facade.close();
  }
}

export function testExplainTruthResultsHaveScoreBreakdown(): void {
  const store = createSeededStore();
  const facade = createFacade({ store });
  try {
    const result = facade.explain('SQLite');
    assert(result.truth_results.length > 0, 'Expected truth results for SQLite query');

    const item = result.truth_results[0]!;
    assert('score_breakdown' in item, 'Expected score_breakdown field');
    assert('keyword' in item.score_breakdown, 'Expected keyword in breakdown');
    assert('graph' in item.score_breakdown, 'Expected graph in breakdown');
    assert('provenance' in item.score_breakdown, 'Expected provenance in breakdown');
    assert('lexical' in item.score_breakdown, 'Expected lexical in breakdown');
    assert('total' in item.score_breakdown, 'Expected total in breakdown');
    assert(typeof item.score_breakdown.keyword === 'number', 'keyword should be number');
    assert(typeof item.score_breakdown.total === 'number', 'total should be number');
  } finally {
    facade.close();
  }
}

export function testExplainTruthResultKeywordNonZeroForMatchingQuery(): void {
  const store = createSeededStore();
  const facade = createFacade({ store });
  try {
    const result = facade.explain('SQLite');
    assert(result.truth_results.length > 0, 'Expected truth results for SQLite query');
    // At least one result should have non-zero keyword score since 'SQLite' is in titles/content
    const hasNonZeroKeyword = result.truth_results.some((r) => r.score_breakdown.keyword > 0);
    assert(hasNonZeroKeyword, 'Expected at least one result with non-zero keyword score for SQLite query');
  } finally {
    facade.close();
  }
}

export function testExplainItemHasRequiredFields(): void {
  const store = createSeededStore();
  const facade = createFacade({ store });
  try {
    const result = facade.explain('SQLite');
    assert(result.truth_results.length > 0, 'Expected truth results');

    const item = result.truth_results[0]!;
    assert(typeof item.id === 'string', 'id should be string');
    assert(typeof item.title === 'string', 'title should be string');
    assert(typeof item.source_system === 'string', 'source_system should be string');
    assert(typeof item.source_kind === 'string', 'source_kind should be string');
    // provenance_chain is null or array
    assert(item.provenance_chain === null || Array.isArray(item.provenance_chain), 'provenance_chain should be null or array');
    // graph_path is null (not implemented in Phase 4)
    assertEqual(item.graph_path, null);
  } finally {
    facade.close();
  }
}

export function testExplainArchiveResultsTotalIsRrfFused(): void {
  const store = createSeededStore();
  const facade = createFacade({ store });
  try {
    const result = facade.explain('local first');
    // Archive results use rrf_fused as total
    for (const item of result.archive_results) {
      assert(typeof item.score_breakdown.total === 'number', 'archive total should be number');
    }
  } finally {
    facade.close();
  }
}

export function testExplainEmptyQueryReturnsEmptyResults(): void {
  const store = createSeededStore();
  const facade = createFacade({ store });
  try {
    const result = facade.explain('');
    assertEqual(result.operation, 'explain');
    assertEqual(result.truth_results.length, 0);
    assertEqual(result.archive_results.length, 0);
  } finally {
    facade.close();
  }
}
