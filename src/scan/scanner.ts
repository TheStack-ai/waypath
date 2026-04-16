/**
 * Dream Cycle — Scan Mode
 * Detects changes in JCP and MemPalace sources, creates promotion candidates.
 * Does NOT auto-promote — items go to review queue only.
 */

import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import type { SqliteTruthKernelStorage } from '../jarvis_fusion/truth-kernel/storage.js';
import { contentHash } from '../archive-kernel/content-hash.js';
import { slugify } from '../shared/text.js';
import { nowIso } from '../shared/time.js';

const LAST_SCAN_AT_KEY = 'last_scan_at';
const SCAN_HASHES_TABLE = 'scan_content_hashes';

export interface ScanChangeItem {
  readonly source: 'jcp' | 'mempalace';
  readonly source_ref: string;
  readonly change_type: 'new' | 'modified';
  readonly title: string;
  readonly content_hash: string;
}

export interface ScanResult {
  readonly operation: 'scan';
  readonly status: 'ready';
  readonly project: string;
  readonly last_scan_at: string | null;
  readonly current_scan_at: string;
  readonly changes_detected: number;
  readonly candidates_created: number;
  readonly changes: readonly ScanChangeItem[];
  readonly message: string;
}

interface JcpChangedRecord {
  readonly id: string;
  readonly table_name: string;
  readonly title: string;
  readonly content: string;
  readonly updated_at: string;
}

/**
 * Ensure the scan_content_hashes tracking table exists.
 */
function ensureScanHashTable(store: SqliteTruthKernelStorage): void {
  try {
    store.db.exec(`CREATE TABLE IF NOT EXISTS ${SCAN_HASHES_TABLE} (
      source_ref TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      scanned_at TEXT NOT NULL
    )`);
  } catch {
    // Table already exists
  }
}

/**
 * Get the stored content hash for a source reference.
 */
function getStoredHash(store: SqliteTruthKernelStorage, sourceRef: string): string | null {
  const row = store.get<Record<string, unknown>>(
    `SELECT content_hash FROM ${SCAN_HASHES_TABLE} WHERE source_ref = :source_ref`,
    { source_ref: sourceRef },
  );
  return row ? String(row.content_hash) : null;
}

/**
 * Save a content hash for a source reference.
 */
function saveHash(store: SqliteTruthKernelStorage, sourceRef: string, hash: string): void {
  store.run(
    `INSERT OR REPLACE INTO ${SCAN_HASHES_TABLE} (source_ref, content_hash, scanned_at)
     VALUES (:source_ref, :content_hash, :scanned_at)`,
    { source_ref: sourceRef, content_hash: hash, scanned_at: nowIso() },
  );
}

/**
 * Get last_scan_at timestamp from schema_meta.
 */
function getLastScanAt(store: SqliteTruthKernelStorage): string | null {
  const row = store.get<Record<string, unknown>>(
    `SELECT applied_at FROM schema_meta WHERE schema_name = :key`,
    { key: LAST_SCAN_AT_KEY },
  );
  return row ? String(row.applied_at) : null;
}

/**
 * Update last_scan_at timestamp.
 */
function setLastScanAt(store: SqliteTruthKernelStorage, timestamp: string): void {
  store.run(
    `INSERT OR REPLACE INTO schema_meta (schema_name, schema_version, applied_at)
     VALUES (:key, 1, :ts)`,
    { key: LAST_SCAN_AT_KEY, ts: timestamp },
  );
}

/**
 * Scan JCP database for recently changed records.
 */
function scanJcpChanges(
  store: SqliteTruthKernelStorage,
  jcpDbPath: string,
  lastScanAt: string | null,
): ScanChangeItem[] {
  if (!existsSync(jcpDbPath)) return [];

  let jcpDb;
  try {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    jcpDb = new DatabaseSync(jcpDbPath, { readOnly: true });
  } catch {
    return [];
  }

  const changes: ScanChangeItem[] = [];
  const tables = [
    { name: 'memories', idCol: 'id', titleCol: 'description', contentCol: 'content', updatedCol: 'updated_at' },
    { name: 'decisions', idCol: 'id', titleCol: 'decision', contentCol: 'reasoning', updatedCol: 'timestamp' },
    { name: 'entities', idCol: 'id', titleCol: 'name', contentCol: 'properties', updatedCol: 'updated_at' },
  ];

  for (const table of tables) {
    try {
      // Check if table exists
      const tableCheck = jcpDb.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=:name`,
      ).get({ name: table.name } as Record<string, unknown>) as Record<string, unknown> | undefined;
      if (!tableCheck) continue;

      let rows: readonly Record<string, unknown>[];
      if (lastScanAt) {
        rows = jcpDb.prepare(
          `SELECT ${table.idCol} as id, COALESCE(${table.titleCol}, '') as title, COALESCE(${table.contentCol}, '') as content, COALESCE(${table.updatedCol}, '') as updated_at FROM ${table.name} WHERE ${table.updatedCol} > :last_scan`,
        ).all({ last_scan: lastScanAt } as Record<string, unknown>) as readonly Record<string, unknown>[];
      } else {
        rows = jcpDb.prepare(
          `SELECT ${table.idCol} as id, COALESCE(${table.titleCol}, '') as title, COALESCE(${table.contentCol}, '') as content, COALESCE(${table.updatedCol}, '') as updated_at FROM ${table.name} ORDER BY ${table.updatedCol} DESC LIMIT 100`,
        ).all() as readonly Record<string, unknown>[];
      }

      for (const row of rows) {
        const sourceRef = `jcp:${table.name}:${row.id}`;
        const hash = contentHash({ id: String(row.id), title: String(row.title), content: String(row.content) });
        const storedHash = getStoredHash(store, sourceRef);

        if (storedHash !== hash) {
          changes.push({
            source: 'jcp',
            source_ref: sourceRef,
            change_type: storedHash === null ? 'new' : 'modified',
            title: String(row.title).slice(0, 100) || `${table.name}:${row.id}`,
            content_hash: hash,
          });
          saveHash(store, sourceRef, hash);
        }
      }
    } catch {
      // Table doesn't have expected columns — skip
    }
  }

  try {
    jcpDb.close();
  } catch {
    // Ignore close errors
  }

  return changes;
}

/**
 * Scan MemPalace directory for modified files.
 */
function scanMemPalaceChanges(
  store: SqliteTruthKernelStorage,
  basePath: string,
  lastScanAt: string | null,
): ScanChangeItem[] {
  if (!existsSync(basePath)) return [];

  const changes: ScanChangeItem[] = [];
  const lastScanMs = lastScanAt ? new Date(lastScanAt).getTime() : 0;

  function walkDir(dirPath: string): void {
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
        continue;
      }

      if (!entry.name.toLowerCase().endsWith('.md')) continue;

      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      // Only check files modified since last scan
      if (lastScanMs > 0 && stats.mtimeMs <= lastScanMs) continue;

      const relativePath = fullPath.slice(basePath.length + 1);
      const sourceRef = `mempalace:${relativePath}`;

      let content: string;
      try {
        content = readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      const hash = contentHash({ path: relativePath, content });
      const storedHash = getStoredHash(store, sourceRef);

      if (storedHash !== hash) {
        // Extract title from first heading or filename
        let title = entry.name.replace(/\.md$/i, '');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#')) {
            title = trimmed.replace(/^#+\s*/u, '');
            break;
          }
        }

        changes.push({
          source: 'mempalace',
          source_ref: sourceRef,
          change_type: storedHash === null ? 'new' : 'modified',
          title: title.slice(0, 100),
          content_hash: hash,
        });
        saveHash(store, sourceRef, hash);
      }
    }
  }

  walkDir(basePath);
  return changes;
}

/**
 * Create promotion candidates for detected changes.
 * Does NOT auto-promote — creates review queue items only.
 */
function createCandidatesForChanges(
  store: SqliteTruthKernelStorage,
  changes: readonly ScanChangeItem[],
): number {
  let created = 0;
  const timestamp = nowIso();

  for (const change of changes) {
    const slug = slugify(change.title) || slugify(change.source_ref);
    const candidateId = `scan:${slug}:${Date.now()}`;
    const claimId = `claim:scan:${slug}:${Date.now()}`;

    try {
      store.run(
        `INSERT INTO claims (claim_id, claim_type, claim_text, subject_entity_id, status, evidence_bundle_id, created_at, updated_at)
         VALUES (:claim_id, :claim_type, :claim_text, :subject_entity_id, :status, :evidence_bundle_id, :created_at, :updated_at)`,
        {
          claim_id: claimId,
          claim_type: `scan_${change.source}`,
          claim_text: `[${change.change_type}] ${change.title} (${change.source_ref})`,
          subject_entity_id: null,
          status: 'active',
          evidence_bundle_id: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      );

      store.run(
        `INSERT INTO promotion_candidates (candidate_id, claim_id, proposed_action, target_object_type, target_object_id, review_status, review_notes, created_at, updated_at)
         VALUES (:candidate_id, :claim_id, :proposed_action, :target_object_type, :target_object_id, :review_status, :review_notes, :created_at, :updated_at)`,
        {
          candidate_id: candidateId,
          claim_id: claimId,
          proposed_action: change.change_type === 'new' ? 'create' : 'update',
          target_object_type: change.source === 'jcp' ? 'promoted_memory' : 'promoted_memory',
          target_object_id: null,
          review_status: 'pending',
          review_notes: `Scan detected ${change.change_type} from ${change.source}: ${change.title}`,
          created_at: timestamp,
          updated_at: timestamp,
        },
      );

      created += 1;
    } catch {
      // Duplicate or constraint error — skip
    }
  }

  return created;
}

/**
 * Main scan function — detects changes in JCP and MemPalace, creates review candidates.
 */
export function scanForChanges(
  store: SqliteTruthKernelStorage,
  options: {
    readonly project?: string;
    readonly jcpDbPath?: string;
    readonly mempalaceBasePath?: string;
  } = {},
): ScanResult {
  const project = options.project ?? 'waypath';
  const jcpDbPath = options.jcpDbPath ?? join(homedir(), '.claude', 'jarvis', 'data', 'jarvis.db');
  const mempalaceBasePath = options.mempalaceBasePath ?? join(homedir(), 'claude-telegram', 'memory');
  const currentScanAt = nowIso();

  ensureScanHashTable(store);
  const lastScanAt = getLastScanAt(store);

  // Scan both sources
  const jcpChanges = scanJcpChanges(store, jcpDbPath, lastScanAt);
  const mempalaceChanges = scanMemPalaceChanges(store, mempalaceBasePath, lastScanAt);
  const allChanges = [...jcpChanges, ...mempalaceChanges];

  // Create promotion candidates (review queue only, no auto-promote)
  const candidatesCreated = createCandidatesForChanges(store, allChanges);

  // Update last scan timestamp
  setLastScanAt(store, currentScanAt);

  return {
    operation: 'scan',
    status: 'ready',
    project,
    last_scan_at: lastScanAt,
    current_scan_at: currentScanAt,
    changes_detected: allChanges.length,
    candidates_created: candidatesCreated,
    changes: allChanges,
    message: allChanges.length > 0
      ? `Scan complete: ${allChanges.length} change(s) detected, ${candidatesCreated} candidate(s) created for review`
      : 'Scan complete: no changes detected',
  };
}
