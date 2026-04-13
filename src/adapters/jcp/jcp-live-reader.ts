import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { SqliteDb } from '../../shared/sqlite-driver.js';
import { createSqliteDriver } from '../../shared/sqlite-factory.js';

const DEFAULT_JARVIS_DB_PATH = join(homedir(), '.claude', 'jarvis', 'data', 'jarvis.db');

type SqliteRow = Record<string, unknown>;

export interface JcpMemorySearchResult {
  readonly id: string;
  readonly memory_type: string;
  readonly content: string;
  readonly confidence: number | null;
  readonly source: string | null;
  readonly created_at: string | null;
  readonly access_tier: string | null;
  readonly description: string | null;
  readonly rank: number;
}

export interface JcpEntitySearchResult {
  readonly id: string;
  readonly name: string;
  readonly entity_type: string;
  readonly properties: string | null;
  readonly confidence: number | null;
  readonly updated_at: string | null;
  readonly rank: number;
}

export interface JcpDecisionRecord {
  readonly id: string;
  readonly timestamp: string | null;
  readonly decision: string;
  readonly reasoning: string;
  readonly confidence: number | null;
  readonly project: string | null;
  readonly status: string;
}

export interface JcpRelationshipRecord {
  readonly id: string;
  readonly subject_id: string;
  readonly predicate: string;
  readonly object_id: string;
  readonly confidence: number | null;
  readonly updated_at: string | null;
  readonly weight: number | null;
}

export interface JcpEntityRecord {
  readonly id: string;
  readonly name: string;
  readonly entity_type: string;
  readonly properties: string | null;
  readonly confidence: number | null;
  readonly updated_at: string | null;
}

export interface JcpHealthResult {
  readonly ok: boolean;
  readonly path: string;
  readonly message: string;
}

export interface JcpLiveReaderOptions {
  readonly dbPath?: string;
}

function getJarvisDbPath(): string {
  return process.env.JARVIS_FUSION_JARVIS_DB_PATH || DEFAULT_JARVIS_DB_PATH;
}

export function openReadonlyDatabase(path: string): SqliteDb {
  return createSqliteDriver().open(path, { readOnly: true });
}

function normalizeLimit(limit: number, fallback: number): number {
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function tokenizeQuery(query: string): string[] {
  return query
    .replace(/['"(){}[\]*:^~!@#$%&\\/+,-]/g, ' ')
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function buildFtsMatchQuery(query: string): string {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return '';
  }

  return tokens
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' OR ');
}

function buildInClause(
  prefix: string,
  values: readonly string[],
): { readonly sql: string; readonly params: Readonly<Record<string, unknown>> } {
  const params: Record<string, unknown> = {};
  const placeholders = values.map((value, index) => {
    const key = `${prefix}_${index}`;
    params[key] = value;
    return `:${key}`;
  });
  return {
    sql: placeholders.join(', '),
    params,
  };
}

function withReadonlyDatabase<T>(
  path: string,
  operation: (db: SqliteDb) => T,
): T {
  const db = openReadonlyDatabase(path);
  try {
    return operation(db);
  } finally {
    db.close();
  }
}

function all<T extends SqliteRow>(
  db: SqliteDb,
  sql: string,
  params: Readonly<Record<string, unknown>> = {},
): readonly T[] {
  return db.prepare(sql).all(params as Record<string, unknown>) as readonly T[];
}

function get<T extends SqliteRow>(
  db: SqliteDb,
  sql: string,
  params: Readonly<Record<string, unknown>> = {},
): T | undefined {
  return db.prepare(sql).get(params as Record<string, unknown>) as T | undefined;
}

export class JcpLiveReader {
  readonly dbPath: string;

  constructor(options: JcpLiveReaderOptions = {}) {
    this.dbPath = options.dbPath ?? getJarvisDbPath();
  }

  searchMemories(query: string, limit = 8): readonly JcpMemorySearchResult[] {
    const matchQuery = buildFtsMatchQuery(query);
    if (matchQuery.length === 0) {
      return [];
    }

    return withReadonlyDatabase(this.dbPath, (db) =>
      all<SqliteRow>(
        db,
        `SELECT
           m.id,
           m.memory_type,
           m.content,
           m.confidence,
           m.source,
           m.created_at,
           m.access_tier,
           m.description,
           bm25(memories_fts) AS rank
         FROM memories m
         JOIN memories_fts f ON f.rowid = m.rowid
         WHERE memories_fts MATCH :query
         ORDER BY rank
         LIMIT :limit`,
        {
          query: matchQuery,
          limit: normalizeLimit(limit, 8),
        },
      ).map((row) => ({
        id: String(row.id),
        memory_type: String(row.memory_type ?? 'semantic'),
        content: String(row.content ?? ''),
        confidence: asNumber(row.confidence),
        source: asString(row.source),
        created_at: asString(row.created_at),
        access_tier: asString(row.access_tier),
        description: asString(row.description),
        rank: typeof row.rank === 'number' ? row.rank : 0,
      })),
    );
  }

  searchEntities(query: string, limit = 8): readonly JcpEntitySearchResult[] {
    const matchQuery = buildFtsMatchQuery(query);
    if (matchQuery.length === 0) {
      return [];
    }

    return withReadonlyDatabase(this.dbPath, (db) =>
      all<SqliteRow>(
        db,
        `SELECT
           e.id,
           e.name,
           e.entity_type,
           e.properties,
           e.confidence,
           e.updated_at,
           bm25(entities_fts) AS rank
         FROM entities e
         JOIN entities_fts f ON f.rowid = e.rowid
         WHERE entities_fts MATCH :query
         ORDER BY rank
         LIMIT :limit`,
        {
          query: matchQuery,
          limit: normalizeLimit(limit, 8),
        },
      ).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? row.id),
        entity_type: String(row.entity_type ?? 'concept'),
        properties: asString(row.properties),
        confidence: asNumber(row.confidence),
        updated_at: asString(row.updated_at),
        rank: typeof row.rank === 'number' ? row.rank : 0,
      })),
    );
  }

  getDecisions(limit = 8): readonly JcpDecisionRecord[] {
    return withReadonlyDatabase(this.dbPath, (db) =>
      all<SqliteRow>(
        db,
        `SELECT id, timestamp, decision, reasoning, confidence, project, status
         FROM decisions
         WHERE status = 'active'
         ORDER BY timestamp DESC
         LIMIT :limit`,
        { limit: normalizeLimit(limit, 8) },
      ).map((row) => ({
        id: String(row.id),
        timestamp: asString(row.timestamp),
        decision: String(row.decision ?? ''),
        reasoning: String(row.reasoning ?? ''),
        confidence: asNumber(row.confidence),
        project: asString(row.project),
        status: String(row.status ?? 'active'),
      })),
    );
  }

  searchDecisions(query: string, limit = 8): readonly JcpDecisionRecord[] {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return [];
    }

    return withReadonlyDatabase(this.dbPath, (db) =>
      all<SqliteRow>(
        db,
        `SELECT id, timestamp, decision, reasoning, confidence, project, status
         FROM decisions
         WHERE status = 'active'
           AND (
             lower(project) = :exact
             OR lower(decision) LIKE :like
             OR lower(reasoning) LIKE :like
           )
         ORDER BY timestamp DESC
         LIMIT :limit`,
        {
          exact: normalized,
          like: `%${normalized}%`,
          limit: normalizeLimit(limit, 8),
        },
      ).map((row) => ({
        id: String(row.id),
        timestamp: asString(row.timestamp),
        decision: String(row.decision ?? ''),
        reasoning: String(row.reasoning ?? ''),
        confidence: asNumber(row.confidence),
        project: asString(row.project),
        status: String(row.status ?? 'active'),
      })),
    );
  }

  getRelationships(entityIds: string[], limit = 12): readonly JcpRelationshipRecord[] {
    const normalizedIds = [...new Set(entityIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (normalizedIds.length === 0) {
      return [];
    }

    const clause = buildInClause('entity_id', normalizedIds);
    return withReadonlyDatabase(this.dbPath, (db) =>
      all<SqliteRow>(
        db,
        `SELECT id, subject_id, predicate, object_id, confidence, updated_at, weight
         FROM relationships
         WHERE subject_id IN (${clause.sql}) OR object_id IN (${clause.sql})
         ORDER BY updated_at DESC
         LIMIT :limit`,
        {
          ...clause.params,
          limit: normalizeLimit(limit, 12),
        },
      ).map((row) => ({
        id: String(row.id),
        subject_id: String(row.subject_id ?? ''),
        predicate: String(row.predicate ?? 'related_to'),
        object_id: String(row.object_id ?? ''),
        confidence: asNumber(row.confidence),
        updated_at: asString(row.updated_at),
        weight: asNumber(row.weight),
      })),
    );
  }

  getEntityById(id: string): JcpEntityRecord | null {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) {
      return null;
    }

    return withReadonlyDatabase(this.dbPath, (db) => {
      const row = get<SqliteRow>(
        db,
        `SELECT id, name, entity_type, properties, confidence, updated_at
         FROM entities
         WHERE id = :id
         LIMIT 1`,
        { id: normalizedId },
      );
      if (!row) {
        return null;
      }

      return {
        id: String(row.id),
        name: String(row.name ?? row.id),
        entity_type: String(row.entity_type ?? 'concept'),
        properties: asString(row.properties),
        confidence: asNumber(row.confidence),
        updated_at: asString(row.updated_at),
      };
    });
  }

  health(): JcpHealthResult {
    if (!existsSync(this.dbPath)) {
      return {
        ok: false,
        path: this.dbPath,
        message: `jarvis db missing: ${this.dbPath}`,
      };
    }

    try {
      withReadonlyDatabase(this.dbPath, (db) => {
        db.prepare('SELECT 1').get();
      });
      return {
        ok: true,
        path: this.dbPath,
        message: `jarvis db ready: ${this.dbPath}`,
      };
    } catch (error) {
      return {
        ok: false,
        path: this.dbPath,
        message: error instanceof Error ? error.message : 'jarvis db unavailable',
      };
    }
  }
}

export function createJcpLiveReader(optionsOrPath: JcpLiveReaderOptions | string = {}): JcpLiveReader {
  const options = typeof optionsOrPath === 'string' ? { dbPath: optionsOrPath } : optionsOrPath;
  return new JcpLiveReader(options);
}
