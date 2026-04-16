import { statSync } from 'node:fs';

import type {
  LocalSourceStatusItem,
  LocalSourceStatusResult,
  SourceAdapterEnabledMap,
  WaypathHealthResult,
  WaypathSourceHealthStatus,
} from '../contracts/index.js';
import { createJcpLiveReader, type JcpLiveReader } from '../adapters/jcp/index.js';
import { probeLocalSourceAdapters } from '../jarvis_fusion/source-readers-local.js';
import type { SqliteTruthKernelStorage } from '../jarvis_fusion/truth-kernel/index.js';

const DB_STATS_TABLES = [
  'schema_meta',
  'provenance_records',
  'entities',
  'relationships',
  'decisions',
  'preferences',
  'promoted_memories',
  'claims',
  'promotion_candidates',
  'knowledge_pages',
  'evidence_bundles',
  'waypath_fts',
] as const;

type DbStatsTableName = (typeof DB_STATS_TABLES)[number];

export interface WaypathDbTableStat {
  readonly name: DbStatsTableName;
  readonly row_count: number;
}

export interface WaypathDbStatsResult {
  readonly operation: 'db-stats';
  readonly status: 'ready';
  readonly db_size_bytes: number;
  readonly tables: readonly WaypathDbTableStat[];
}

export interface HealthCheckOptions {
  readonly sourceAdaptersEnabled?: SourceAdapterEnabledMap;
  readonly jcpLiveReader?: JcpLiveReader;
}

function asSourceAnchor(source: LocalSourceStatusItem) {
  return {
    source_system: source.reader,
    source_kind: source.adapter_status === 'probe_only' ? 'probe' : 'local_adapter',
    source_ref: source.path ?? `${source.reader}:unavailable`,
  } as const;
}

function getSourceStatusItem(
  sources: readonly LocalSourceStatusItem[],
  reader: LocalSourceStatusItem['reader'],
): LocalSourceStatusItem {
  const item = sources.find((source) => source.reader === reader);
  if (item) return item;
  return {
    reader,
    available: false,
    enabled: false,
    path: null,
    adapter_status: 'missing',
    source_anchor: {
      source_system: reader,
      source_kind: 'probe',
      source_ref: `${reader}:unavailable`,
    },
  };
}

function dbFileSizeBytes(location: string): number {
  if (location === ':memory:') return 0;
  try {
    return statSync(location).size;
  } catch {
    return 0;
  }
}

function readIntegrityCheck(store: SqliteTruthKernelStorage): string {
  const row = store.get<Record<string, unknown>>('PRAGMA integrity_check');
  if (!row) return 'unknown';
  const [value] = Object.values(row);
  return typeof value === 'string' ? value : String(value ?? 'unknown');
}

function buildJcpStatus(item: LocalSourceStatusItem, reader: JcpLiveReader): WaypathSourceHealthStatus {
  if (!item.enabled) {
    return {
      reader: item.reader,
      enabled: item.enabled,
      available: item.available,
      adapter_status: item.adapter_status,
      path: item.path,
      ok: true,
      message: 'jarvis-memory-db disabled',
    };
  }

  if (!item.available) {
    return {
      reader: item.reader,
      enabled: item.enabled,
      available: item.available,
      adapter_status: item.adapter_status,
      path: item.path,
      ok: false,
      message: item.path ? `jarvis-memory-db unavailable: ${item.path}` : 'jarvis-memory-db unavailable',
    };
  }

  const health = reader.health();
  return {
    reader: item.reader,
    enabled: item.enabled,
    available: item.available,
    adapter_status: item.adapter_status,
    path: item.path,
    ok: health.ok,
    message: health.message,
  };
}

function buildProbeStatus(item: LocalSourceStatusItem, label: string): WaypathSourceHealthStatus {
  if (!item.enabled) {
    return {
      reader: item.reader,
      enabled: item.enabled,
      available: item.available,
      adapter_status: item.adapter_status,
      path: item.path,
      ok: true,
      message: `${label} disabled`,
    };
  }

  return {
    reader: item.reader,
    enabled: item.enabled,
    available: item.available,
    adapter_status: item.adapter_status,
    path: item.path,
    ok: item.available,
    message: item.available
      ? `${label} available${item.path ? `: ${item.path}` : ''}`
      : `${label} unavailable`,
  };
}

export function sourceStatus(options: HealthCheckOptions = {}): LocalSourceStatusResult {
  const sources = probeLocalSourceAdapters(
    options.sourceAdaptersEnabled ? { enabled: options.sourceAdaptersEnabled } : undefined,
  ).map((source) => ({
    ...source,
    source_anchor: asSourceAnchor(source),
  }));

  return {
    operation: 'source-status',
    status: 'ready',
    sources,
  };
}

export function dbStats(store: SqliteTruthKernelStorage): WaypathDbStatsResult {
  return {
    operation: 'db-stats',
    status: 'ready',
    db_size_bytes: dbFileSizeBytes(store.location),
    tables: DB_STATS_TABLES.map((name) => ({
      name,
      row_count: store.countTable(name),
    })),
  };
}

export function healthCheck(store: SqliteTruthKernelStorage, options: HealthCheckOptions = {}): WaypathHealthResult {
  const truthKernel = store.health();
  const integrityCheck = readIntegrityCheck(store);
  const sources = sourceStatus(options).sources;
  const jcpStatus = buildJcpStatus(
    getSourceStatusItem(sources, 'jarvis-memory-db'),
    options.jcpLiveReader ?? createJcpLiveReader(),
  );
  const mempalaceStatus = buildProbeStatus(getSourceStatusItem(sources, 'mempalace'), 'mempalace');
  const expectedRows = store.countTable('entities')
    + store.countTable('decisions')
    + store.countTable('preferences')
    + store.countTable('promoted_memories');
  const indexedRows = store.countTable('waypath_fts');
  const ftsSync = {
    ok: indexedRows === expectedRows,
    indexed_rows: indexedRows,
    expected_rows: expectedRows,
    missing_rows: Math.max(expectedRows - indexedRows, 0),
  };
  // valid_until is stored as ISO 8601 (e.g. '2026-04-16T10:30:00.000Z').
  // Pass current time in same format for correct string comparison.
  const nowIsoStr = new Date().toISOString();
  const tables = ['entities', 'decisions', 'preferences', 'relationships', 'promoted_memories'] as const;
  let expiredButActive = 0;
  for (const table of tables) {
    expiredButActive += store.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE valid_until IS NOT NULL AND valid_until < :now AND status = 'active'`,
      { now: nowIsoStr },
    )?.count ?? 0;
  }
  const temporalCoherence = {
    expired_but_active: expiredButActive,
    warning: expiredButActive > 0
      ? `${expiredButActive} records have valid_until in the past but are still active`
      : null,
  };
  const stalePages = store.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM knowledge_pages WHERE status = 'stale'`,
  )?.count ?? 0;
  const pendingReviews = store.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM promotion_candidates WHERE review_status IN ('pending', 'needs_more_evidence')`,
  )?.count ?? 0;
  const ok = truthKernel.ok && integrityCheck === 'ok' && ftsSync.ok;

  return {
    operation: 'health',
    status: 'ready',
    ok,
    truth_kernel: {
      ...truthKernel,
      integrity_check: integrityCheck,
    },
    fts_sync: ftsSync,
    stale_pages: stalePages,
    pending_reviews: pendingReviews,
    temporal_coherence: temporalCoherence,
    jcp_status: jcpStatus,
    mempalace_status: mempalaceStatus,
    db_size_bytes: dbFileSizeBytes(store.location),
    message: ok ? 'waypath health check passed' : 'waypath health check failed',
  };
}
