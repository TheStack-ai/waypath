/**
 * Benchmark module — CLI entry point and public API.
 */

export { BENCHMARK_QUERIES, type BenchmarkQuery } from './queries.js';
export { benchmarkQuery, runBenchmarkSuite, type BenchmarkResult, type QueryMethodResult } from './runner.js';
export { generateReport, type BenchmarkSummary } from './report.js';

import type { CliIo, CliArgs } from '../shared/cli.js';
import { writeLine } from '../shared/cli.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation, ensureTruthKernelSeedData } from '../jarvis_fusion/truth-kernel/index.js';
import { BENCHMARK_QUERIES } from './queries.js';
import { runBenchmarkSuite } from './runner.js';
import { generateReport } from './report.js';

/**
 * CLI handler for `waypath benchmark`.
 */
export function runBenchmarkCli(parsed: CliArgs, io: CliIo): number {
  const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
  const store = createTruthKernelStorage(storePath, { autoMigrate: true });
  try {
    // Ensure seed data exists for benchmark queries to match against
    ensureTruthKernelSeedData(store, {
      project: 'waypath',
      objective: 'deliver codex-first external brain',
      activeTask: 'session-start',
    });

    const results = runBenchmarkSuite(store, BENCHMARK_QUERIES);
    const report = generateReport(results);

    if (parsed.json) {
      writeLine(io, JSON.stringify(report.json, null, 2));
    } else {
      writeLine(io, report.table);
    }

    return 0;
  } finally {
    store.close();
  }
}
