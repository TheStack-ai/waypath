import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCli } from '../../src/cli';
import { createTruthKernelStorage, ensureTruthKernelSeedData } from '../../src/jarvis_fusion/truth-kernel';
import { assert, assertEqual } from '../../src/shared/assert';

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write(chunk: string) { stdout.push(chunk); } },
      stderr: { write(chunk: string) { stderr.push(chunk); } },
    },
  };
}

export function runDbCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-db-cli-`);
  const storePath = join(root, 'truth.db');
  const backupPath = join(root, 'backup');
  const store = createTruthKernelStorage(storePath, { autoMigrate: true });

  try {
    ensureTruthKernelSeedData(store, {
      project: 'health-project',
      objective: 'exercise db cli',
      activeTask: 'db-health',
    });
    store.upsertKnowledgePage({
      page: {
        page_id: 'page:health-project',
        page_type: 'project_page',
        title: 'Health Project',
        status: 'stale',
      },
      summary_markdown: '# Health Project',
      linked_entity_ids: ['project:health-project'],
      linked_decision_ids: [],
      linked_evidence_bundle_ids: [],
      updated_at: new Date().toISOString(),
    });
    store.createPromotionCandidate({
      candidate_id: 'promotion:health-check',
      subject: 'health check',
      status: 'pending_review',
      summary: 'Pending review item for db cli integration',
      created_at: new Date().toISOString(),
    });
    store.run(
      `DELETE FROM waypath_fts WHERE source_table = :source_table AND source_id = :source_id`,
      { source_table: 'entities', source_id: 'project:health-project' },
    );
  } finally {
    store.close();
  }

  const healthBefore = captureIo();
  assertEqual(runCli(['health', '--json', '--store-path', storePath], healthBefore.io), 1);
  const healthBeforeResult = JSON.parse(healthBefore.stdout.join('')) as {
    ok: boolean;
    fts_sync: { ok: boolean };
    stale_pages: number;
    pending_reviews: number;
  };
  assertEqual(healthBeforeResult.ok, false);
  assertEqual(healthBeforeResult.fts_sync.ok, false);
  assertEqual(healthBeforeResult.stale_pages, 1);
  assertEqual(healthBeforeResult.pending_reviews, 1);

  const statsCaptured = captureIo();
  assertEqual(runCli(['db-stats', '--json', '--store-path', storePath], statsCaptured.io), 0);
  const statsResult = JSON.parse(statsCaptured.stdout.join('')) as {
    db_size_bytes: number;
    tables: { name: string; row_count: number }[];
  };
  assert(statsResult.db_size_bytes > 0, 'expected db file size to be reported');
  assert(statsResult.tables.some((table) => table.name === 'waypath_fts'), 'expected waypath_fts stats');

  const rebuildCaptured = captureIo();
  assertEqual(runCli(['rebuild-fts', '--json', '--store-path', storePath], rebuildCaptured.io), 0);
  const rebuildResult = JSON.parse(rebuildCaptured.stdout.join('')) as { indexed_rows: number };
  assert(rebuildResult.indexed_rows > 0, 'expected rebuilt FTS rows');

  const healthAfter = captureIo();
  assertEqual(runCli(['health', '--json', '--store-path', storePath], healthAfter.io), 0);
  const healthAfterResult = JSON.parse(healthAfter.stdout.join('')) as {
    ok: boolean;
    truth_kernel: { integrity_check: string };
    fts_sync: { ok: boolean };
  };
  assertEqual(healthAfterResult.ok, true);
  assertEqual(healthAfterResult.truth_kernel.integrity_check, 'ok');
  assertEqual(healthAfterResult.fts_sync.ok, true);

  const backupCaptured = captureIo();
  assertEqual(runCli(['backup', '--json', '--path', backupPath, '--store-path', storePath], backupCaptured.io), 0);
  const backupResult = JSON.parse(backupCaptured.stdout.join('')) as { copied_files: string[] };
  assert(backupResult.copied_files.length > 0, 'expected copied backup files');
  assert(backupResult.copied_files.every((file) => existsSync(file)), 'expected copied files to exist');
}
