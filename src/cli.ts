#!/usr/bin/env node

import { createLocalImportManifest, runBootstrapImport, toImportResult } from './jarvis_fusion/bootstrap-import.js';
import { probeLocalSourceAdapters } from './jarvis_fusion/source-readers-local.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from './jarvis_fusion/truth-kernel/index.js';
import { createFacade } from './facade';
import { dbStats } from './facade/health.js';
import { createClaudeCodeHostShim, createCodexHostShim } from './host-shims';
import { runWaypathMcpServer } from './mcp/server.js';
import { loadRuntimeConfig } from './shared/config';
import { createCliArgs, formatUsage, writeLine, type CliIo } from './shared/cli';
import { backupSqliteDatabase } from './shared/sqlite-maintenance.js';
import { runBenchmarkCli } from './benchmark/index.js';
import { runScanCli } from './scan/index.js';
import { exportClaudeMd, exportAgentsMd } from './export/index.js';

export function runCli(argv: string[], io: CliIo): number {
  let parsed;
  try {
    parsed = createCliArgs(argv);
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    io.stderr.write(`${formatUsage()}\n`);
    return 1;
  }

  if (parsed.help || !parsed.command) {
    writeLine(io, formatUsage());
    return 0;
  }

  const runtimeConfig = loadRuntimeConfig().config;
  const facadeOptions = {
    ...(parsed.storePath ? { storePath: parsed.storePath } : {}),
    autoSeed: true,
    ...(runtimeConfig.retrieval?.weights ? { recallWeights: runtimeConfig.retrieval.weights } : {}),
    ...(runtimeConfig.reviewQueue?.limit ? { reviewQueueLimit: runtimeConfig.reviewQueue.limit } : {}),
    ...(runtimeConfig.sourceAdapters?.enabled ? { sourceAdaptersEnabled: runtimeConfig.sourceAdapters.enabled } : {}),
  };

  if (parsed.command === 'codex' || parsed.command === 'claude-code') {
    const facade = createFacade(facadeOptions);
    try {
      const shim = parsed.command === 'codex'
        ? createCodexHostShim({ facade })
        : createClaudeCodeHostShim({ facade });
      const result = shim.bootstrap({
        project: parsed.project,
        objective: parsed.objective,
        activeTask: parsed.task,
        sessionId: parsed.sessionId,
        storePath: parsed.storePath,
      });

      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, `host=${result.host}`);
        writeLine(io, `session=${result.session_id}`);
        writeLine(io, `store=${result.store_path}`);
        writeLine(io, `objective=${result.session.context_pack.current_focus.objective}`);
      }

      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'recall') {
    const query = parsed.query ?? parsed.subject;
    if (!query) {
      io.stderr.write('Missing value for --query\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.recall(query);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'page') {
    const subject = parsed.subject ?? parsed.project;
    if (!subject) {
      io.stderr.write('Missing value for --subject\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.page(subject);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.page?.summary_markdown ?? result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'import-seed') {
    const project = parsed.project ?? 'waypath';
    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      const result = toImportResult(
        runBootstrapImport(
          store,
          {
            manifest_id: `demo-import:${project}`,
            import_mode: 'bootstrap',
            reader_names: ['demo-source'],
          },
          project,
        ),
        storePath,
      );
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'import-local') {
    const project = parsed.project ?? 'waypath';
    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      const manifest = createLocalImportManifest(
        project,
        runtimeConfig.sourceAdapters?.enabled ? { enabled: runtimeConfig.sourceAdapters.enabled } : undefined,
      );
      if (manifest.reader_names.length === 0 && !runtimeConfig.import?.allowMissingLocalReaders) {
        io.stderr.write('No local source readers are available for import-local\n');
        return 1;
      }
      const result = toImportResult(runBootstrapImport(store, manifest, project), storePath);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'source-status') {
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.sourceStatus();
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        for (const source of result.sources) {
          writeLine(
            io,
            `${source.reader}: ${source.enabled ? 'enabled' : 'disabled'} / ${source.adapter_status}${source.path ? ` (${source.path})` : ''}`,
          );
        }
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'health') {
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.health();
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
        writeLine(io, `integrity=${result.truth_kernel.integrity_check}`);
        writeLine(io, `fts=${result.fts_sync.indexed_rows}/${result.fts_sync.expected_rows}`);
        writeLine(io, `stale-pages=${result.stale_pages}`);
        writeLine(io, `pending-reviews=${result.pending_reviews}`);
      }
      return result.ok ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'backup') {
    if (!parsed.path) {
      io.stderr.write('Missing value for --path\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const result = backupSqliteDatabase(storePath, parsed.path);
    if (result.copied_files.length === 0) {
      io.stderr.write(`No SQLite files found to back up at ${storePath}\n`);
      return 1;
    }

    if (parsed.json) {
      writeLine(io, JSON.stringify({
        operation: 'backup',
        status: 'ready',
        ...result,
      }, null, 2));
    } else {
      writeLine(io, `backed up ${result.copied_files.length} file(s) to ${result.destination_directory}`);
    }
    return 0;
  }

  if (parsed.command === 'rebuild-fts') {
    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      store.rebuildWaypathFts();
      const result = {
        operation: 'rebuild-fts' as const,
        status: 'ready' as const,
        indexed_rows: store.countTable('waypath_fts'),
        message: 'waypath FTS index rebuilt',
      };
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
        writeLine(io, `indexed-rows=${result.indexed_rows}`);
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'db-stats') {
    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      const result = dbStats(store);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, `db-size-bytes=${result.db_size_bytes}`);
        for (const table of result.tables) {
          writeLine(io, `${table.name}=${table.row_count}`);
        }
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'mcp-server') {
    void runWaypathMcpServer({
      input: io.stdin ?? process.stdin,
      output: io.stdout,
      error: io.stderr,
      facadeOptions,
    }).catch((error) => {
      io.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      if (typeof process !== 'undefined') {
        process.exitCode = 1;
      }
    });
    return 0;
  }

  if (parsed.command === 'promote') {
    const subject = parsed.subject ?? parsed.query;
    if (!subject) {
      io.stderr.write('Missing value for --subject\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.promote(subject);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'review') {
    if (!parsed.candidateId) {
      io.stderr.write('Missing value for --candidate-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    if (!parsed.status) {
      io.stderr.write('Missing value for --status\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const validStatuses = new Set([
      'pending_review',
      'accepted',
      'rejected',
      'needs_more_evidence',
      'superseded',
    ]);
    if (!validStatuses.has(parsed.status)) {
      io.stderr.write(`Invalid review status: ${parsed.status}\n`);
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.review(
        parsed.candidateId,
        parsed.status as 'accepted' | 'pending_review' | 'rejected' | 'needs_more_evidence' | 'superseded',
        parsed.notes,
      );
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'review-queue') {
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.reviewQueue();
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, `pending-review=${result.pending_review.length}`);
        writeLine(io, `stale-pages=${result.stale_pages.length}`);
        writeLine(io, `contradictions=${result.open_contradictions.length}`);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'inspect-page') {
    if (!parsed.pageId) {
      io.stderr.write('Missing value for --page-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.inspectPage(parsed.pageId);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.page?.summary_markdown ?? result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'inspect-candidate') {
    if (!parsed.candidateId) {
      io.stderr.write('Missing value for --candidate-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    const facade = createFacade(facadeOptions);
    try {
      const result = facade.inspectCandidate(parsed.candidateId);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.candidate?.summary ?? result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'resolve-contradiction') {
    if (!parsed.key) {
      io.stderr.write('Missing value for --key\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    if (!parsed.keepPreferenceId) {
      io.stderr.write('Missing value for --keep-preference-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.resolveContradiction(
        parsed.key,
        parsed.keepPreferenceId,
        parsed.scopeRef,
        parsed.resolutionNotes,
      );
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'refresh-page') {
    if (!parsed.pageId) {
      io.stderr.write('Missing value for --page-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.refreshPage(parsed.pageId);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
      }
      return result.status === 'ready' ? 0 : 1;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'graph-query') {
    if (!parsed.entityId) {
      io.stderr.write('Missing value for --entity-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const validPatterns = new Set([
      'project_context',
      'person_context',
      'system_reasoning',
      'contradiction_lookup',
    ]);
    if (parsed.pattern && !validPatterns.has(parsed.pattern)) {
      io.stderr.write(`Invalid pattern: ${parsed.pattern}\n`);
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.graphQuery(
        parsed.entityId,
        parsed.pattern as 'project_context' | 'person_context' | 'system_reasoning' | 'contradiction_lookup' | undefined,
      );
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
        writeLine(io, `entities=${result.result.expanded_entities.length}`);
        writeLine(io, `relationships=${result.result.expanded_relationships.length}`);
        writeLine(io, `decisions=${result.result.related_decisions.length}`);
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'history') {
    if (!parsed.entityId) {
      io.stderr.write('Missing value for --entity-id\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      // Try entity history first, then decision history
      let history: readonly { valid_from?: string | null; valid_until?: string | null; status: string; updated_at: string; [key: string]: unknown }[] =
        store.listEntityHistory(parsed.entityId);
      let historyType = 'entity';

      if (history.length === 0) {
        const decisionHistory = store.listDecisionHistory(parsed.entityId);
        if (decisionHistory.length > 0) {
          history = decisionHistory;
          historyType = 'decision';
        }
      }

      const result = {
        operation: 'history' as const,
        status: 'ready' as const,
        entity_id: parsed.entityId,
        history_type: historyType,
        records: history.map((record) => ({
          ...record,
          valid_from: record.valid_from ?? record.updated_at,
          valid_until: record.valid_until ?? null,
        })),
        message: history.length > 0
          ? `Found ${history.length} history record(s) for ${parsed.entityId}`
          : `No history found for ${parsed.entityId}`,
      };

      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, result.message);
        for (const record of result.records) {
          const from = record.valid_from ?? '?';
          const until = record.valid_until ?? 'current';
          writeLine(io, `  ${record.status} | ${from} → ${until}`);
        }
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'explain') {
    const query = parsed.query ?? parsed.subject;
    if (!query) {
      io.stderr.write('Missing value for --query\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const facade = createFacade(facadeOptions);
    try {
      const result = facade.explain(query);
      if (parsed.json) {
        writeLine(io, JSON.stringify(result, null, 2));
      } else {
        writeLine(io, `=== Truth Results (${result.truth_results.length}) ===`);
        for (let i = 0; i < result.truth_results.length; i++) {
          const item = result.truth_results[i]!;
          const b = item.score_breakdown;
          writeLine(io, `${i + 1}. [${item.source_kind}] ${item.title}`);
          writeLine(io, `   score: ${b.total.toFixed(4)}  keyword=${b.keyword.toFixed(4)} graph=${b.graph.toFixed(4)} provenance=${b.provenance.toFixed(4)} lexical=${b.lexical.toFixed(4)}`);
          writeLine(io, `   source: ${item.source_system} / ${item.source_kind}`);
        }
        writeLine(io, `=== Archive Results (${result.archive_results.length}) ===`);
        for (let i = 0; i < result.archive_results.length; i++) {
          const item = result.archive_results[i]!;
          const b = item.score_breakdown;
          writeLine(io, `${i + 1}. [${item.source_kind}] ${item.title}`);
          writeLine(io, `   score: ${b.total.toFixed(4)}  keyword=${b.keyword.toFixed(4)} graph=${b.graph.toFixed(4)} provenance=${b.provenance.toFixed(4)} lexical=${b.lexical.toFixed(4)}`);
          writeLine(io, `   source: ${item.source_system} / ${item.source_kind}`);
        }
      }
      return 0;
    } finally {
      facade.close();
    }
  }

  if (parsed.command === 'export') {
    const format = parsed.format;
    if (!format) {
      io.stderr.write('Missing value for --format\n');
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }
    const validFormats = new Set(['claude-md', 'agents-md', 'json']);
    if (!validFormats.has(format)) {
      io.stderr.write(`Invalid format: ${format}. Must be claude-md, agents-md, or json\n`);
      io.stderr.write(`${formatUsage()}\n`);
      return 1;
    }

    const storePath = parsed.storePath ?? defaultTruthKernelStoreLocation();
    const store = createTruthKernelStorage(storePath, { autoMigrate: true });
    try {
      if (format === 'claude-md') {
        writeLine(io, exportClaudeMd(store));
      } else if (format === 'agents-md') {
        writeLine(io, exportAgentsMd(store));
      } else {
        const decisions = store.listActiveDecisions(50);
        const preferences = store.listActivePreferences(50);
        const entities = store.listActiveEntities(50);
        writeLine(io, JSON.stringify({ decisions, preferences, entities }, null, 2));
      }
      return 0;
    } finally {
      store.close();
    }
  }

  if (parsed.command === 'benchmark') {
    return runBenchmarkCli(parsed, io);
  }

  if (parsed.command === 'scan') {
    return runScanCli(parsed, io);
  }

  io.stderr.write(`Unknown command: ${parsed.command}\n`);
  io.stderr.write(`${formatUsage()}\n`);
  return 1;
}

if (typeof process !== 'undefined') {
  const exitCode = runCli(process.argv.slice(2), process);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
