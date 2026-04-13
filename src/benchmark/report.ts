/**
 * Benchmark report — generates summary tables comparing Waypath vs grep baseline.
 */

import type { BenchmarkResult } from './runner.js';

export interface BenchmarkSummary {
  readonly total_queries: number;
  readonly waypath: MethodSummary;
  readonly grep_baseline: MethodSummary;
  readonly table: string;
  readonly json: BenchmarkReportJson;
}

export interface MethodSummary {
  readonly avg_precision: number;
  readonly avg_recall: number;
  readonly hit_at_5_rate: number;
  readonly avg_response_time_ms: number;
  readonly total_results: number;
}

export interface BenchmarkReportJson {
  readonly summary: {
    readonly total_queries: number;
    readonly waypath: MethodSummary;
    readonly grep_baseline: MethodSummary;
  };
  readonly results: readonly BenchmarkResult[];
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 1000) / 1000;
}

function summarizeMethod(results: readonly BenchmarkResult[], method: 'waypath' | 'grep_baseline'): MethodSummary {
  const methodResults = results.map((r) => r[method]);
  return {
    avg_precision: avg(methodResults.map((r) => r.precision)),
    avg_recall: avg(methodResults.map((r) => r.recall)),
    hit_at_5_rate: avg(methodResults.map((r) => r.hit_at_5 ? 1 : 0)),
    avg_response_time_ms: avg(methodResults.map((r) => r.response_time_ms)),
    total_results: methodResults.reduce((sum, r) => sum + r.result_count, 0),
  };
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

/**
 * Generate an ASCII summary table.
 */
function generateTable(results: readonly BenchmarkResult[], waypathSummary: MethodSummary, grepSummary: MethodSummary): string {
  const lines: string[] = [];
  const sep = '─'.repeat(100);

  lines.push(sep);
  lines.push(
    `${padRight('ID', 5)} ${padRight('Query', 30)} ${padLeft('W:P@5', 6)} ${padLeft('G:P@5', 6)} ${padLeft('W:Prec', 7)} ${padLeft('G:Prec', 7)} ${padLeft('W:Rec', 6)} ${padLeft('G:Rec', 6)} ${padLeft('W:ms', 8)} ${padLeft('G:ms', 8)}`,
  );
  lines.push(sep);

  for (const r of results) {
    const queryShort = r.query.length > 28 ? `${r.query.slice(0, 25)}...` : r.query;
    lines.push(
      `${padRight(r.query_id, 5)} ${padRight(queryShort, 30)} ${padLeft(r.waypath.hit_at_5 ? 'Y' : 'N', 6)} ${padLeft(r.grep_baseline.hit_at_5 ? 'Y' : 'N', 6)} ${padLeft(formatPercent(r.waypath.precision), 7)} ${padLeft(formatPercent(r.grep_baseline.precision), 7)} ${padLeft(formatPercent(r.waypath.recall), 6)} ${padLeft(formatPercent(r.grep_baseline.recall), 6)} ${padLeft(formatMs(r.waypath.response_time_ms), 8)} ${padLeft(formatMs(r.grep_baseline.response_time_ms), 8)}`,
    );
  }

  lines.push(sep);
  lines.push(
    `${padRight('AVG', 5)} ${padRight('', 30)} ${padLeft(formatPercent(waypathSummary.hit_at_5_rate), 6)} ${padLeft(formatPercent(grepSummary.hit_at_5_rate), 6)} ${padLeft(formatPercent(waypathSummary.avg_precision), 7)} ${padLeft(formatPercent(grepSummary.avg_precision), 7)} ${padLeft(formatPercent(waypathSummary.avg_recall), 6)} ${padLeft(formatPercent(grepSummary.avg_recall), 6)} ${padLeft(formatMs(waypathSummary.avg_response_time_ms), 8)} ${padLeft(formatMs(grepSummary.avg_response_time_ms), 8)}`,
  );
  lines.push(sep);
  lines.push('W = Waypath FTS5, G = Grep baseline, P@5 = hit in top-5, Prec = precision, Rec = recall');

  return lines.join('\n');
}

/**
 * Generate full benchmark summary report.
 */
export function generateReport(results: readonly BenchmarkResult[]): BenchmarkSummary {
  const waypathSummary = summarizeMethod(results, 'waypath');
  const grepSummary = summarizeMethod(results, 'grep_baseline');

  return {
    total_queries: results.length,
    waypath: waypathSummary,
    grep_baseline: grepSummary,
    table: generateTable(results, waypathSummary, grepSummary),
    json: {
      summary: {
        total_queries: results.length,
        waypath: waypathSummary,
        grep_baseline: grepSummary,
      },
      results,
    },
  };
}
