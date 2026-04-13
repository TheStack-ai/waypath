import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, assertEqual } from '../../src/shared/assert';
import { createTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel';
import { scanForChanges } from '../../src/scan';

/**
 * Test: scan with no sources returns zero changes.
 */
export function testScanNoSources(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-empty-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const result = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: `${root}/nonexistent-mempalace`,
  });

  assertEqual(result.operation, 'scan');
  assertEqual(result.status, 'ready');
  assertEqual(result.changes_detected, 0);
  assertEqual(result.candidates_created, 0);
  assert(result.message.includes('no changes'), 'expected no-changes message');

  store.close();
}

/**
 * Test: scan detects new MemPalace files.
 */
export function testScanDetectsMemPalaceFiles(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-mp-`);
  const mempalacePath = join(root, 'mempalace');
  mkdirSync(join(mempalacePath, 'daily'), { recursive: true });

  // Create a markdown file
  writeFileSync(join(mempalacePath, 'daily', '2026-04-13.md'), '# Daily Note\nSome content here');

  const store = createTruthKernelStorage(`${root}/truth.db`);

  const result = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });

  assert(result.changes_detected > 0, 'should detect new mempalace file');
  assert(result.candidates_created > 0, 'should create candidates for new files');
  assert(result.changes.some((c) => c.source === 'mempalace'), 'should have mempalace change');
  assert(result.changes.some((c) => c.change_type === 'new'), 'should detect as new');

  store.close();
}

/**
 * Test: second scan with no changes returns zero.
 */
export function testScanIdempotent(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-idem-`);
  const mempalacePath = join(root, 'mempalace');
  mkdirSync(join(mempalacePath, 'daily'), { recursive: true });
  writeFileSync(join(mempalacePath, 'daily', 'test.md'), '# Test\nContent');

  const store = createTruthKernelStorage(`${root}/truth.db`);

  // First scan
  const result1 = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });
  assert(result1.changes_detected > 0, 'first scan should detect changes');

  // Second scan without modifications — content hash should prevent re-detection
  const result2 = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });
  assertEqual(result2.changes_detected, 0);
  assertEqual(result2.candidates_created, 0);

  store.close();
}

/**
 * Test: scan detects modified MemPalace files.
 */
export function testScanDetectsModifiedFiles(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-mod-`);
  const mempalacePath = join(root, 'mempalace');
  mkdirSync(join(mempalacePath, 'projects'), { recursive: true });
  const filePath = join(mempalacePath, 'projects', 'waypath.md');
  writeFileSync(filePath, '# Waypath\nOriginal content');

  const store = createTruthKernelStorage(`${root}/truth.db`);

  // First scan
  scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });

  // Modify the file
  writeFileSync(filePath, '# Waypath\nModified content with new info');

  // Second scan should detect modification
  const result2 = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });
  assert(result2.changes_detected > 0, 'should detect modified file');
  assert(result2.changes.some((c) => c.change_type === 'modified'), 'should detect as modified');

  store.close();
}

/**
 * Test: scan stores last_scan_at in schema_meta.
 */
export function testScanUpdatesLastScanAt(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-ts-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const result = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: `${root}/nonexistent`,
  });

  // last_scan_at should be null on first run (no previous scan)
  assertEqual(result.last_scan_at, null);

  // After scan, current_scan_at should be set
  assert(result.current_scan_at.length > 0, 'current_scan_at should be set');

  // Second scan should have last_scan_at from first scan
  const result2 = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: `${root}/nonexistent`,
  });
  assert(result2.last_scan_at !== null, 'last_scan_at should be set from previous scan');

  store.close();
}

/**
 * Test: scan does NOT auto-promote — only creates candidates.
 */
export function testScanNoAutoPromote(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-nopromote-`);
  const mempalacePath = join(root, 'mempalace');
  mkdirSync(join(mempalacePath, 'daily'), { recursive: true });
  writeFileSync(join(mempalacePath, 'daily', 'auto.md'), '# Auto\nScan content');

  const store = createTruthKernelStorage(`${root}/truth.db`);

  const result = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });

  assert(result.candidates_created > 0, 'should create candidates');

  // Verify no promoted_memories were created (no auto-promote)
  const memories = store.listActivePromotedMemories(100);
  const scanMemories = memories.filter((m) => m.summary.includes('Auto'));
  assertEqual(scanMemories.length, 0);

  // But promotion_candidates should exist
  const candidates = store.listPromotionCandidates(100);
  assert(candidates.length > 0, 'candidates should exist in review queue');

  store.close();
}

/**
 * Test: scan handles multiple MemPalace directories.
 */
export function testScanMultipleDirectories(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-scan-multi-`);
  const mempalacePath = join(root, 'mempalace');
  mkdirSync(join(mempalacePath, 'daily'), { recursive: true });
  mkdirSync(join(mempalacePath, 'projects'), { recursive: true });
  mkdirSync(join(mempalacePath, 'people'), { recursive: true });

  writeFileSync(join(mempalacePath, 'daily', '2026-04-13.md'), '# Daily\nToday stuff');
  writeFileSync(join(mempalacePath, 'projects', 'waypath.md'), '# Waypath\nProject notes');
  writeFileSync(join(mempalacePath, 'people', 'dd.md'), '# DD\nPerson info');

  const store = createTruthKernelStorage(`${root}/truth.db`);

  const result = scanForChanges(store, {
    project: 'test',
    jcpDbPath: `${root}/nonexistent.db`,
    mempalaceBasePath: mempalacePath,
  });

  assertEqual(result.changes_detected, 3);
  assertEqual(result.candidates_created, 3);

  store.close();
}
