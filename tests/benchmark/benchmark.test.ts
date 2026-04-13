import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertEqual } from '../../src/shared/assert';
import {
  createTruthKernelStorage,
  ensureTruthKernelSeedData,
} from '../../src/jarvis_fusion/truth-kernel';
import { BENCHMARK_QUERIES } from '../../src/benchmark/queries';
import { benchmarkQuery, runBenchmarkSuite } from '../../src/benchmark/runner';
import { generateReport } from '../../src/benchmark/report';

/**
 * Test: benchmark queries are well-formed.
 */
export function testBenchmarkQueriesValid(): void {
  assert(BENCHMARK_QUERIES.length >= 20, `expected 20+ queries, got ${BENCHMARK_QUERIES.length}`);
  const ids = new Set<string>();
  for (const q of BENCHMARK_QUERIES) {
    assert(q.id.length > 0, 'query id must not be empty');
    assert(q.query.length > 0, 'query text must not be empty');
    assert(q.category.length > 0, 'query category must not be empty');
    assert(!ids.has(q.id), `duplicate query id: ${q.id}`);
    ids.add(q.id);
  }
}

/**
 * Test: single benchmark query returns valid result structure.
 */
export function testBenchmarkQueryStructure(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-bench-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store);

  const result = benchmarkQuery(store, BENCHMARK_QUERIES[0]!);
  assertEqual(result.query_id, BENCHMARK_QUERIES[0]!.id);
  assert(result.waypath.response_time_ms >= 0, 'response time should be non-negative');
  assert(result.grep_baseline.response_time_ms >= 0, 'grep time should be non-negative');
  assert(result.waypath.precision >= 0 && result.waypath.precision <= 1, 'precision should be 0-1');
  assert(result.waypath.recall >= 0 && result.waypath.recall <= 1, 'recall should be 0-1');

  store.close();
}

/**
 * Test: full benchmark suite runs and produces report.
 */
export function testBenchmarkSuiteRuns(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-bench-suite-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store);

  const results = runBenchmarkSuite(store, BENCHMARK_QUERIES);
  assertEqual(results.length, BENCHMARK_QUERIES.length);

  const report = generateReport(results);
  assertEqual(report.total_queries, BENCHMARK_QUERIES.length);
  assert(report.table.length > 0, 'report table should not be empty');
  assert(report.json.results.length > 0, 'report JSON results should not be empty');
  assert(report.waypath.avg_response_time_ms >= 0, 'avg response time should be non-negative');

  store.close();
}

/**
 * Test: Waypath FTS should find seeded data.
 */
export function testWaypathFindsSeededData(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-bench-fts-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store);

  // "shared backend" should match the seeded decision
  const result = benchmarkQuery(store, {
    id: 'test-fts',
    category: 'project_decision',
    query: 'shared backend host shims',
    description: 'test FTS match',
    expected_ids: ['decision:waypath:shared-backend-host-shims'],
  });

  assert(result.waypath.result_count > 0, 'Waypath FTS should find seeded decision');
  assert(result.waypath.matched_ids.includes('decision:waypath:shared-backend-host-shims'), 'should match expected decision ID');
  assert(result.waypath.hit_at_5, 'expected hit in top 5');

  store.close();
}

/**
 * Test: grep baseline should also find seeded data.
 */
export function testGrepBaselineFindsSeededData(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-bench-grep-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store);

  const result = benchmarkQuery(store, {
    id: 'test-grep',
    category: 'general',
    query: 'waypath',
    description: 'test grep baseline',
    expected_ids: ['project:waypath'],
  });

  assert(result.grep_baseline.result_count > 0, 'grep baseline should find seeded project');

  store.close();
}

/**
 * Test: empty query returns zero results for both methods.
 */
export function testBenchmarkEmptyExpectedIds(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-bench-empty-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store);

  const result = benchmarkQuery(store, {
    id: 'test-empty',
    category: 'concept',
    query: 'xyzzy nonexistent concept',
    description: 'test no matches expected',
    expected_ids: [],
  });

  // When expected_ids is empty, recall=1 by definition
  assertEqual(result.waypath.recall, 1);
  assertEqual(result.grep_baseline.recall, 1);

  store.close();
}
