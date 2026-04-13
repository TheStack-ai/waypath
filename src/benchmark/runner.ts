/**
 * Benchmark runner — measures query performance of Waypath FTS vs grep baseline.
 */

import type { SqliteTruthKernelStorage, WaypathFtsMatch } from '../jarvis_fusion/truth-kernel/storage.js';
import type { BenchmarkQuery } from './queries.js';

export interface BenchmarkResult {
  readonly query_id: string;
  readonly query: string;
  readonly expected_count: number;
  readonly waypath: QueryMethodResult;
  readonly grep_baseline: QueryMethodResult;
}

export interface QueryMethodResult {
  readonly hit_at_5: boolean;
  readonly precision: number;
  readonly recall: number;
  readonly result_count: number;
  readonly response_time_ms: number;
  readonly matched_ids: readonly string[];
}

function measureTime<T>(fn: () => T): { result: T; elapsed_ms: number } {
  const start = performance.now();
  const result = fn();
  const elapsed_ms = Math.round((performance.now() - start) * 100) / 100;
  return { result, elapsed_ms };
}

function computeMetrics(
  resultIds: readonly string[],
  expectedIds: readonly string[],
): { hit_at_5: boolean; precision: number; recall: number } {
  if (expectedIds.length === 0) {
    return {
      hit_at_5: resultIds.length > 0,
      precision: resultIds.length > 0 ? 1 : 0,
      recall: 1,
    };
  }

  const expectedSet = new Set(expectedIds);
  const top5 = resultIds.slice(0, 5);
  const hit_at_5 = top5.some((id) => expectedSet.has(id));

  const relevant = resultIds.filter((id) => expectedSet.has(id));
  const precision = resultIds.length > 0 ? relevant.length / resultIds.length : 0;
  const recall = expectedIds.length > 0 ? relevant.length / expectedIds.length : 0;

  return { hit_at_5, precision, recall };
}

/**
 * Run Waypath FTS search for a benchmark query.
 */
function runWaypathQuery(
  store: SqliteTruthKernelStorage,
  query: BenchmarkQuery,
): QueryMethodResult {
  const { result: ftsResults, elapsed_ms } = measureTime(() =>
    store.searchWaypathFts(query.query, 20),
  );

  const matchedIds = ftsResults.map((match: WaypathFtsMatch) => match.source_id);
  const metrics = computeMetrics(matchedIds, [...query.expected_ids]);

  return {
    ...metrics,
    result_count: matchedIds.length,
    response_time_ms: elapsed_ms,
    matched_ids: matchedIds,
  };
}

/**
 * Run grep-style baseline search across all truth tables.
 * Simulates a naive text search by querying each table with LIKE.
 */
function runGrepBaseline(
  store: SqliteTruthKernelStorage,
  query: BenchmarkQuery,
): QueryMethodResult {
  const searchTerms = query.query
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((t) => t.toLowerCase())
    .filter((t) => t.length > 1) ?? [];

  if (searchTerms.length === 0) {
    return {
      hit_at_5: false,
      precision: 0,
      recall: 0,
      result_count: 0,
      response_time_ms: 0,
      matched_ids: [],
    };
  }

  const { result: matchedIds, elapsed_ms } = measureTime(() => {
    const ids: string[] = [];

    // Search entities
    const entities = store.all<Record<string, unknown>>(
      `SELECT entity_id, name, summary FROM entities WHERE status = 'active'`,
    );
    for (const e of entities) {
      const haystack = `${String(e.name)} ${String(e.summary)}`.toLowerCase();
      if (searchTerms.some((t) => haystack.includes(t))) {
        ids.push(String(e.entity_id));
      }
    }

    // Search decisions
    const decisions = store.all<Record<string, unknown>>(
      `SELECT decision_id, title, statement FROM decisions WHERE status = 'active'`,
    );
    for (const d of decisions) {
      const haystack = `${String(d.title)} ${String(d.statement)}`.toLowerCase();
      if (searchTerms.some((t) => haystack.includes(t))) {
        ids.push(String(d.decision_id));
      }
    }

    // Search preferences
    const preferences = store.all<Record<string, unknown>>(
      `SELECT preference_id, key, value FROM preferences WHERE status = 'active'`,
    );
    for (const p of preferences) {
      const haystack = `${String(p.key)} ${String(p.value)}`.toLowerCase();
      if (searchTerms.some((t) => haystack.includes(t))) {
        ids.push(String(p.preference_id));
      }
    }

    // Search promoted_memories
    const memories = store.all<Record<string, unknown>>(
      `SELECT memory_id, summary, content FROM promoted_memories WHERE status = 'active'`,
    );
    for (const m of memories) {
      const haystack = `${String(m.summary)} ${String(m.content)}`.toLowerCase();
      if (searchTerms.some((t) => haystack.includes(t))) {
        ids.push(String(m.memory_id));
      }
    }

    return ids;
  });

  const metrics = computeMetrics(matchedIds, [...query.expected_ids]);

  return {
    ...metrics,
    result_count: matchedIds.length,
    response_time_ms: elapsed_ms,
    matched_ids: matchedIds,
  };
}

/**
 * Run a single benchmark query against both Waypath and grep baseline.
 */
export function benchmarkQuery(
  store: SqliteTruthKernelStorage,
  query: BenchmarkQuery,
): BenchmarkResult {
  const waypath = runWaypathQuery(store, query);
  const grep_baseline = runGrepBaseline(store, query);

  return {
    query_id: query.id,
    query: query.query,
    expected_count: query.expected_ids.length,
    waypath,
    grep_baseline,
  };
}

/**
 * Run full benchmark suite.
 */
export function runBenchmarkSuite(
  store: SqliteTruthKernelStorage,
  queries: readonly BenchmarkQuery[],
): readonly BenchmarkResult[] {
  return queries.map((q) => benchmarkQuery(store, q));
}
