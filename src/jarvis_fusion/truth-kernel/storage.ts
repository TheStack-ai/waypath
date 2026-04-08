import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  SqliteQueryResult,
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthKernelHealth,
  TruthKernelStore,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from '../contracts.js';
import { TRUTH_KERNEL_SCHEMA_VERSION, buildTruthKernelMigrationSql } from './schema.js';

export interface SqliteTruthKernelStoreOptions {
  readonly autoMigrate?: boolean;
}

export interface TruthKernelSeedOptions {
  readonly project?: string;
  readonly objective?: string;
  readonly activeTask?: string;
}

export interface SessionStartSnapshot {
  readonly entities: readonly TruthEntityRecord[];
  readonly decisions: readonly TruthDecisionRecord[];
  readonly preferences: readonly TruthPreferenceRecord[];
  readonly promotedMemories: readonly TruthPromotedMemoryRecord[];
}

interface SessionSnapshotOptions {
  readonly projectEntityId?: string;
  readonly entityLimit?: number;
  readonly decisionLimit?: number;
  readonly preferenceLimit?: number;
  readonly memoryLimit?: number;
}

function normalizeLocation(location: string): string {
  return location.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureParentDirectory(location: string): void {
  if (location === ':memory:') {
    return;
  }

  mkdirSync(dirname(location), { recursive: true });
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function asParams(record: object): Readonly<Record<string, unknown>> {
  return record as Readonly<Record<string, unknown>>;
}

function mapEntity(row: Record<string, unknown>): TruthEntityRecord {
  return {
    entity_id: String(row.entity_id),
    entity_type: row.entity_type as TruthEntityRecord['entity_type'],
    name: String(row.name),
    summary: String(row.summary),
    state_json: String(row.state_json),
    status: row.status as TruthEntityRecord['status'],
    canonical_page_id: row.canonical_page_id === null ? null : String(row.canonical_page_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapDecision(row: Record<string, unknown>): TruthDecisionRecord {
  return {
    decision_id: String(row.decision_id),
    title: String(row.title),
    statement: String(row.statement),
    status: row.status as TruthDecisionRecord['status'],
    scope_entity_id: row.scope_entity_id === null ? null : String(row.scope_entity_id),
    effective_at: row.effective_at === null ? null : String(row.effective_at),
    superseded_by: row.superseded_by === null ? null : String(row.superseded_by),
    provenance_id: row.provenance_id === null ? null : String(row.provenance_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapPreference(row: Record<string, unknown>): TruthPreferenceRecord {
  return {
    preference_id: String(row.preference_id),
    subject_kind: String(row.subject_kind),
    subject_ref: row.subject_ref === null ? null : String(row.subject_ref),
    key: String(row.key),
    value: String(row.value),
    strength: String(row.strength),
    status: row.status as TruthPreferenceRecord['status'],
    provenance_id: row.provenance_id === null ? null : String(row.provenance_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapPromotedMemory(row: Record<string, unknown>): TruthPromotedMemoryRecord {
  return {
    memory_id: String(row.memory_id),
    memory_type: row.memory_type as TruthPromotedMemoryRecord['memory_type'],
    access_tier: row.access_tier as TruthPromotedMemoryRecord['access_tier'],
    summary: String(row.summary),
    content: String(row.content),
    subject_entity_id: row.subject_entity_id === null ? null : String(row.subject_entity_id),
    status: row.status as TruthPromotedMemoryRecord['status'],
    provenance_id: row.provenance_id === null ? null : String(row.provenance_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class SqliteTruthKernelStorage implements TruthKernelStore {
  readonly location: string;
  readonly db: DatabaseSync;

  constructor(location: string, options: SqliteTruthKernelStoreOptions = {}) {
    this.location = normalizeLocation(location);
    ensureParentDirectory(this.location);
    this.db = new DatabaseSync(this.location);

    if (options.autoMigrate ?? true) {
      this.migrate();
    }
  }

  migrate(): void {
    this.db.exec(buildTruthKernelMigrationSql());
  }

  close(): void {
    this.db.close();
  }

  health(): TruthKernelHealth {
    return {
      ok: true,
      location: this.location,
      schema_version: TRUTH_KERNEL_SCHEMA_VERSION,
      message: 'truth kernel ready',
    };
  }

  run(sql: string, params: Readonly<Record<string, unknown>> = {}): SqliteQueryResult {
    const statement = this.db.prepare(sql);
    return statement.run(params as Record<string, unknown>);
  }

  all<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): readonly T[] {
    const statement = this.db.prepare(sql);
    return statement.all(params as Record<string, unknown>) as readonly T[];
  }

  get<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): T | undefined {
    const statement = this.db.prepare(sql);
    return statement.get(params as Record<string, unknown>) as T | undefined;
  }

  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  upsertEntity(record: TruthEntityRecord): void {
    this.run(
      `INSERT INTO entities (
        entity_id, entity_type, name, summary, state_json, status, canonical_page_id, created_at, updated_at
      ) VALUES (
        :entity_id, :entity_type, :name, :summary, :state_json, :status, :canonical_page_id, :created_at, :updated_at
      )
      ON CONFLICT(entity_id) DO UPDATE SET
        entity_type = excluded.entity_type,
        name = excluded.name,
        summary = excluded.summary,
        state_json = excluded.state_json,
        status = excluded.status,
        canonical_page_id = excluded.canonical_page_id,
        updated_at = excluded.updated_at`,
      asParams(record),
    );
  }

  upsertDecision(record: TruthDecisionRecord): void {
    this.run(
      `INSERT INTO decisions (
        decision_id, title, statement, status, scope_entity_id, effective_at, superseded_by, provenance_id, created_at, updated_at
      ) VALUES (
        :decision_id, :title, :statement, :status, :scope_entity_id, :effective_at, :superseded_by, :provenance_id, :created_at, :updated_at
      )
      ON CONFLICT(decision_id) DO UPDATE SET
        title = excluded.title,
        statement = excluded.statement,
        status = excluded.status,
        scope_entity_id = excluded.scope_entity_id,
        effective_at = excluded.effective_at,
        superseded_by = excluded.superseded_by,
        provenance_id = excluded.provenance_id,
        updated_at = excluded.updated_at`,
      asParams(record),
    );
  }

  upsertPreference(record: TruthPreferenceRecord): void {
    this.run(
      `INSERT INTO preferences (
        preference_id, subject_kind, subject_ref, key, value, strength, status, provenance_id, created_at, updated_at
      ) VALUES (
        :preference_id, :subject_kind, :subject_ref, :key, :value, :strength, :status, :provenance_id, :created_at, :updated_at
      )
      ON CONFLICT(preference_id) DO UPDATE SET
        subject_kind = excluded.subject_kind,
        subject_ref = excluded.subject_ref,
        key = excluded.key,
        value = excluded.value,
        strength = excluded.strength,
        status = excluded.status,
        provenance_id = excluded.provenance_id,
        updated_at = excluded.updated_at`,
      asParams(record),
    );
  }

  upsertPromotedMemory(record: TruthPromotedMemoryRecord): void {
    this.run(
      `INSERT INTO promoted_memories (
        memory_id, memory_type, access_tier, summary, content, subject_entity_id, status, provenance_id, created_at, updated_at
      ) VALUES (
        :memory_id, :memory_type, :access_tier, :summary, :content, :subject_entity_id, :status, :provenance_id, :created_at, :updated_at
      )
      ON CONFLICT(memory_id) DO UPDATE SET
        memory_type = excluded.memory_type,
        access_tier = excluded.access_tier,
        summary = excluded.summary,
        content = excluded.content,
        subject_entity_id = excluded.subject_entity_id,
        status = excluded.status,
        provenance_id = excluded.provenance_id,
        updated_at = excluded.updated_at`,
      asParams(record),
    );
  }

  getEntity(entityId: string): TruthEntityRecord | undefined {
    const row = this.get<Record<string, unknown>>(
      `SELECT * FROM entities WHERE entity_id = :entity_id LIMIT 1`,
      { entity_id: entityId },
    );
    return row ? mapEntity(row) : undefined;
  }

  listActiveEntities(limit = 5): readonly TruthEntityRecord[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM entities WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`,
      { limit },
    ).map(mapEntity);
  }

  listActiveDecisions(limit = 5, scopeEntityId?: string): readonly TruthDecisionRecord[] {
    if (scopeEntityId) {
      return this.all<Record<string, unknown>>(
        `SELECT * FROM decisions WHERE status = 'active' AND (scope_entity_id = :scope_entity_id OR scope_entity_id IS NULL) ORDER BY updated_at DESC LIMIT :limit`,
        { scope_entity_id: scopeEntityId, limit },
      ).map(mapDecision);
    }
    return this.all<Record<string, unknown>>(
      `SELECT * FROM decisions WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`,
      { limit },
    ).map(mapDecision);
  }

  listActivePreferences(limit = 5, subjectRef?: string): readonly TruthPreferenceRecord[] {
    if (subjectRef) {
      return this.all<Record<string, unknown>>(
        `SELECT * FROM preferences WHERE status = 'active' AND (subject_ref = :subject_ref OR subject_ref IS NULL) ORDER BY updated_at DESC LIMIT :limit`,
        { subject_ref: subjectRef, limit },
      ).map(mapPreference);
    }
    return this.all<Record<string, unknown>>(
      `SELECT * FROM preferences WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`,
      { limit },
    ).map(mapPreference);
  }

  listActivePromotedMemories(limit = 5, subjectEntityId?: string): readonly TruthPromotedMemoryRecord[] {
    if (subjectEntityId) {
      return this.all<Record<string, unknown>>(
        `SELECT * FROM promoted_memories WHERE status = 'active' AND (subject_entity_id = :subject_entity_id OR subject_entity_id IS NULL) ORDER BY updated_at DESC LIMIT :limit`,
        { subject_entity_id: subjectEntityId, limit },
      ).map(mapPromotedMemory);
    }
    return this.all<Record<string, unknown>>(
      `SELECT * FROM promoted_memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`,
      { limit },
    ).map(mapPromotedMemory);
  }

  countTable(tableName: 'entities' | 'decisions' | 'preferences' | 'promoted_memories'): number {
    const row = this.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
    return row?.count ?? 0;
  }
}

export function defaultTruthKernelStoreLocation(currentDirectory: string = process.cwd()): string {
  return join(currentDirectory, '.jarvis-fusion', 'truth.db');
}

export function createTruthKernelStorage(
  location: string,
  options: SqliteTruthKernelStoreOptions = {},
): SqliteTruthKernelStorage {
  return new SqliteTruthKernelStorage(location, options);
}

export function ensureTruthKernelSeedData(
  store: SqliteTruthKernelStorage,
  options: TruthKernelSeedOptions = {},
): void {
  const project = options.project?.trim() || 'jarvis-fusion-system';
  const objective = options.objective?.trim() || 'deliver codex-first external brain';
  const activeTask = options.activeTask?.trim() || 'session-start';
  const projectEntityId = `project:${project}`;
  const timestamp = nowIso();

  if (store.getEntity(projectEntityId)) {
    return;
  }

  store.transaction(() => {
    store.upsertEntity({
      entity_id: projectEntityId,
      entity_type: 'project',
      name: project,
      summary: 'Primary local-first project workspace for Jarvis Fusion v1.',
      state_json: toJson({ objective, activeTask }),
      status: 'active',
      canonical_page_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    store.upsertDecision({
      decision_id: `decision:${project}:shared-backend-host-shims`,
      title: 'Use a shared backend with thin host shims',
      statement:
        'Jarvis Fusion v1 keeps truth, archive orchestration, and session assembly in one local backend while Codex/Claude integrations remain thin shims.',
      status: 'active',
      scope_entity_id: projectEntityId,
      effective_at: timestamp,
      superseded_by: null,
      provenance_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    store.upsertPreference({
      preference_id: `preference:${project}:rollout-order`,
      subject_kind: 'project',
      subject_ref: projectEntityId,
      key: 'host_rollout',
      value: 'codex-first',
      strength: 'high',
      status: 'active',
      provenance_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    store.upsertPromotedMemory({
      memory_id: `memory:${project}:session-start-pack`,
      memory_type: 'project',
      access_tier: 'ops',
      summary: 'Session-start context packs should come from persisted SQLite truth data.',
      content: `Current objective: ${objective}. Active task: ${activeTask}.`,
      subject_entity_id: projectEntityId,
      status: 'active',
      provenance_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });
}

export function loadSessionStartSnapshot(
  store: SqliteTruthKernelStorage,
  options: SessionSnapshotOptions = {},
): SessionStartSnapshot {
  return {
    entities: options.projectEntityId
      ? [store.getEntity(options.projectEntityId)].filter((value): value is TruthEntityRecord => Boolean(value))
      : store.listActiveEntities(options.entityLimit ?? 5),
    decisions: store.listActiveDecisions(options.decisionLimit ?? 5, options.projectEntityId),
    preferences: store.listActivePreferences(options.preferenceLimit ?? 5, options.projectEntityId),
    promotedMemories: store.listActivePromotedMemories(options.memoryLimit ?? 5, options.projectEntityId),
  };
}
