import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  GraphContext,
  GraphRelationshipSummary,
  SqliteQueryResult,
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthKernelHealth,
  TruthKernelStore,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
  TruthRelationshipRecord,
} from '../contracts.js';
import type { PromotionCandidateView, StoredKnowledgePage } from '../../contracts/index.js';
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

export interface GraphSummaryOptions {
  readonly seedEntityIds: readonly string[];
  readonly relationshipLimit?: number;
  readonly relatedEntityLimit?: number;
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
  if (location === ':memory:') return;
  mkdirSync(dirname(location), { recursive: true });
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
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

function mapRelationship(row: Record<string, unknown>): TruthRelationshipRecord {
  return {
    relationship_id: String(row.relationship_id),
    from_entity_id: String(row.from_entity_id),
    relation_type: String(row.relation_type),
    to_entity_id: String(row.to_entity_id),
    weight: typeof row.weight === 'number' ? row.weight : null,
    status: row.status as TruthRelationshipRecord['status'],
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

function mapKnowledgePage(row: Record<string, unknown>): StoredKnowledgePage {
  return {
    page: {
      page_id: String(row.page_id),
      page_type: row.page_type as StoredKnowledgePage['page']['page_type'],
      title: String(row.title),
      status: row.status as StoredKnowledgePage['page']['status'],
    },
    summary_markdown: String(row.summary_markdown),
    linked_entity_ids: parseJsonArray(row.linked_entity_ids_json),
    linked_decision_ids: parseJsonArray(row.linked_decision_ids_json),
    linked_evidence_bundle_ids: parseJsonArray(row.linked_evidence_bundle_ids_json),
    updated_at: String(row.updated_at),
  };
}

function mapPromotionCandidate(row: Record<string, unknown>): PromotionCandidateView {
  return {
    candidate_id: String(row.candidate_id),
    subject: String(row.review_notes ?? row.candidate_id),
    status: row.review_status === 'accepted' ? 'accepted' : 'pending_review',
    summary: String(row.review_notes ?? row.candidate_id),
    created_at: String(row.created_at),
  };
}

function mapRelationshipSummary(record: TruthRelationshipRecord): GraphRelationshipSummary {
  return {
    relationship_id: record.relationship_id,
    from_entity_id: record.from_entity_id,
    relation_type: record.relation_type,
    to_entity_id: record.to_entity_id,
    weight: record.weight,
  };
}

export class SqliteTruthKernelStorage implements TruthKernelStore {
  readonly location: string;
  readonly db: DatabaseSync;

  constructor(location: string, options: SqliteTruthKernelStoreOptions = {}) {
    this.location = normalizeLocation(location);
    ensureParentDirectory(this.location);
    this.db = new DatabaseSync(this.location);
    if (options.autoMigrate ?? true) this.migrate();
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
    return this.db.prepare(sql).run(params as Record<string, unknown>);
  }

  all<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): readonly T[] {
    return this.db.prepare(sql).all(params as Record<string, unknown>) as readonly T[];
  }

  get<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): T | undefined {
    return this.db.prepare(sql).get(params as Record<string, unknown>) as T | undefined;
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
    this.run(`INSERT INTO entities (entity_id, entity_type, name, summary, state_json, status, canonical_page_id, created_at, updated_at)
      VALUES (:entity_id,:entity_type,:name,:summary,:state_json,:status,:canonical_page_id,:created_at,:updated_at)
      ON CONFLICT(entity_id) DO UPDATE SET entity_type=excluded.entity_type,name=excluded.name,summary=excluded.summary,state_json=excluded.state_json,status=excluded.status,canonical_page_id=excluded.canonical_page_id,updated_at=excluded.updated_at`, asParams(record));
  }

  upsertDecision(record: TruthDecisionRecord): void {
    this.run(`INSERT INTO decisions (decision_id,title,statement,status,scope_entity_id,effective_at,superseded_by,provenance_id,created_at,updated_at)
      VALUES (:decision_id,:title,:statement,:status,:scope_entity_id,:effective_at,:superseded_by,:provenance_id,:created_at,:updated_at)
      ON CONFLICT(decision_id) DO UPDATE SET title=excluded.title,statement=excluded.statement,status=excluded.status,scope_entity_id=excluded.scope_entity_id,effective_at=excluded.effective_at,superseded_by=excluded.superseded_by,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at`, asParams(record));
  }

  upsertRelationship(record: TruthRelationshipRecord): void {
    this.run(`INSERT INTO relationships (relationship_id,from_entity_id,relation_type,to_entity_id,weight,status,provenance_id,created_at,updated_at)
      VALUES (:relationship_id,:from_entity_id,:relation_type,:to_entity_id,:weight,:status,:provenance_id,:created_at,:updated_at)
      ON CONFLICT(relationship_id) DO UPDATE SET from_entity_id=excluded.from_entity_id,relation_type=excluded.relation_type,to_entity_id=excluded.to_entity_id,weight=excluded.weight,status=excluded.status,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at`, asParams(record));
  }

  upsertProvenance(record: { provenance_id: string; source_system: string; source_kind: string; source_ref: string; observed_at: string | null; imported_at: string | null; promoted_at: string | null; promoted_by: string | null; confidence: number | null; notes: string | null; }): string {
    this.run(`INSERT INTO provenance_records (provenance_id,source_system,source_kind,source_ref,observed_at,imported_at,promoted_at,promoted_by,confidence,notes)
      VALUES (:provenance_id,:source_system,:source_kind,:source_ref,:observed_at,:imported_at,:promoted_at,:promoted_by,:confidence,:notes)
      ON CONFLICT(provenance_id) DO UPDATE SET source_system=excluded.source_system,source_kind=excluded.source_kind,source_ref=excluded.source_ref,observed_at=excluded.observed_at,imported_at=excluded.imported_at,promoted_at=excluded.promoted_at,promoted_by=excluded.promoted_by,confidence=excluded.confidence,notes=excluded.notes`, asParams(record));
    return record.provenance_id;
  }

  upsertPreference(record: TruthPreferenceRecord): void {
    this.run(`INSERT INTO preferences (preference_id,subject_kind,subject_ref,key,value,strength,status,provenance_id,created_at,updated_at)
      VALUES (:preference_id,:subject_kind,:subject_ref,:key,:value,:strength,:status,:provenance_id,:created_at,:updated_at)
      ON CONFLICT(preference_id) DO UPDATE SET subject_kind=excluded.subject_kind,subject_ref=excluded.subject_ref,key=excluded.key,value=excluded.value,strength=excluded.strength,status=excluded.status,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at`, asParams(record));
  }

  upsertPromotedMemory(record: TruthPromotedMemoryRecord): void {
    this.run(`INSERT INTO promoted_memories (memory_id,memory_type,access_tier,summary,content,subject_entity_id,status,provenance_id,created_at,updated_at)
      VALUES (:memory_id,:memory_type,:access_tier,:summary,:content,:subject_entity_id,:status,:provenance_id,:created_at,:updated_at)
      ON CONFLICT(memory_id) DO UPDATE SET memory_type=excluded.memory_type,access_tier=excluded.access_tier,summary=excluded.summary,content=excluded.content,subject_entity_id=excluded.subject_entity_id,status=excluded.status,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at`, asParams(record));
  }

  upsertKnowledgePage(page: StoredKnowledgePage): void {
    this.run(`INSERT INTO knowledge_pages (page_id,page_type,title,summary_markdown,status,linked_entity_ids_json,linked_decision_ids_json,linked_evidence_bundle_ids_json,updated_at)
      VALUES (:page_id,:page_type,:title,:summary_markdown,:status,:linked_entity_ids_json,:linked_decision_ids_json,:linked_evidence_bundle_ids_json,:updated_at)
      ON CONFLICT(page_id) DO UPDATE SET page_type=excluded.page_type,title=excluded.title,summary_markdown=excluded.summary_markdown,status=excluded.status,linked_entity_ids_json=excluded.linked_entity_ids_json,linked_decision_ids_json=excluded.linked_decision_ids_json,linked_evidence_bundle_ids_json=excluded.linked_evidence_bundle_ids_json,updated_at=excluded.updated_at`, {
      page_id: page.page.page_id,
      page_type: page.page.page_type,
      title: page.page.title,
      summary_markdown: page.summary_markdown,
      status: page.page.status,
      linked_entity_ids_json: JSON.stringify(page.linked_entity_ids),
      linked_decision_ids_json: JSON.stringify(page.linked_decision_ids),
      linked_evidence_bundle_ids_json: JSON.stringify(page.linked_evidence_bundle_ids),
      updated_at: page.updated_at,
    });
  }

  getKnowledgePage(pageId: string): StoredKnowledgePage | undefined {
    const row = this.get<Record<string, unknown>>(`SELECT * FROM knowledge_pages WHERE page_id = :page_id LIMIT 1`, { page_id: pageId });
    return row ? mapKnowledgePage(row) : undefined;
  }

  createPromotionCandidate(candidate: PromotionCandidateView): void {
    this.run(`INSERT INTO promotion_candidates (candidate_id,claim_id,proposed_action,target_object_type,target_object_id,review_status,review_notes,created_at,updated_at)
      VALUES (:candidate_id,:claim_id,:proposed_action,:target_object_type,:target_object_id,:review_status,:review_notes,:created_at,:updated_at)
      ON CONFLICT(candidate_id) DO UPDATE SET review_status=excluded.review_status,review_notes=excluded.review_notes,updated_at=excluded.updated_at`, {
      candidate_id: candidate.candidate_id,
      claim_id: candidate.candidate_id,
      proposed_action: 'create',
      target_object_type: 'promoted_memory',
      target_object_id: null,
      review_status: candidate.status === 'accepted' ? 'accepted' : 'pending',
      review_notes: candidate.summary,
      created_at: candidate.created_at,
      updated_at: candidate.created_at,
    });
  }

  getPromotionCandidate(candidateId: string): PromotionCandidateView | undefined {
    const row = this.get<Record<string, unknown>>(`SELECT * FROM promotion_candidates WHERE candidate_id = :candidate_id LIMIT 1`, { candidate_id: candidateId });
    return row ? mapPromotionCandidate(row) : undefined;
  }

  getRelationship(relationshipId: string): TruthRelationshipRecord | undefined {
    const row = this.get<Record<string, unknown>>(`SELECT * FROM relationships WHERE relationship_id = :relationship_id LIMIT 1`, { relationship_id: relationshipId });
    return row ? mapRelationship(row) : undefined;
  }

  getProvenance(provenanceId: string) {
    const row = this.get<Record<string, unknown>>(`SELECT * FROM provenance_records WHERE provenance_id = :provenance_id LIMIT 1`, { provenance_id: provenanceId });
    if (!row) return undefined;
    return {
      provenance_id: String(row.provenance_id),
      source_system: String(row.source_system),
      source_kind: String(row.source_kind),
      source_ref: String(row.source_ref),
      observed_at: row.observed_at === null ? null : String(row.observed_at),
      imported_at: row.imported_at === null ? null : String(row.imported_at),
      promoted_at: row.promoted_at === null ? null : String(row.promoted_at),
      promoted_by: row.promoted_by === null ? null : String(row.promoted_by),
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
      notes: row.notes === null ? null : String(row.notes),
    };
  }

  getEntity(entityId: string): TruthEntityRecord | undefined {
    const row = this.get<Record<string, unknown>>(`SELECT * FROM entities WHERE entity_id = :entity_id LIMIT 1`, { entity_id: entityId });
    return row ? mapEntity(row) : undefined;
  }

  listActiveEntities(limit = 5): readonly TruthEntityRecord[] {
    return this.all<Record<string, unknown>>(`SELECT * FROM entities WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`, { limit }).map(mapEntity);
  }

  listRelationshipsForEntity(entityId: string, limit = 10): readonly TruthRelationshipRecord[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM relationships
       WHERE status = 'active'
         AND (from_entity_id = :entity_id OR to_entity_id = :entity_id)
       ORDER BY updated_at DESC, relationship_id ASC
       LIMIT :limit`,
      { entity_id: entityId, limit },
    ).map(mapRelationship);
  }

  listRelationshipsForEntities(entityIds: readonly string[], limit = 10): readonly TruthRelationshipRecord[] {
    if (entityIds.length === 0) return [];
    const placeholders = entityIds.map((_, index) => `:entity_id_${index}`).join(', ');
    const params = Object.fromEntries(entityIds.map((entityId, index) => [`entity_id_${index}`, entityId]));
    return this.all<Record<string, unknown>>(
      `SELECT * FROM relationships
       WHERE status = 'active'
         AND (from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders}))
       ORDER BY updated_at DESC, relationship_id ASC
       LIMIT :limit`,
      { ...params, limit },
    ).map(mapRelationship);
  }

  listActiveDecisions(limit = 5, scopeEntityId?: string): readonly TruthDecisionRecord[] {
    return (scopeEntityId
      ? this.all<Record<string, unknown>>(`SELECT * FROM decisions WHERE status = 'active' AND (scope_entity_id = :scope_entity_id OR scope_entity_id IS NULL) ORDER BY updated_at DESC LIMIT :limit`, { scope_entity_id: scopeEntityId, limit })
      : this.all<Record<string, unknown>>(`SELECT * FROM decisions WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`, { limit })
    ).map(mapDecision);
  }

  listActivePreferences(limit = 5, subjectRef?: string): readonly TruthPreferenceRecord[] {
    return (subjectRef
      ? this.all<Record<string, unknown>>(`SELECT * FROM preferences WHERE status = 'active' AND (subject_ref = :subject_ref OR subject_ref IS NULL) ORDER BY updated_at DESC LIMIT :limit`, { subject_ref: subjectRef, limit })
      : this.all<Record<string, unknown>>(`SELECT * FROM preferences WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`, { limit })
    ).map(mapPreference);
  }

  listActivePromotedMemories(limit = 5, subjectEntityId?: string): readonly TruthPromotedMemoryRecord[] {
    return (subjectEntityId
      ? this.all<Record<string, unknown>>(`SELECT * FROM promoted_memories WHERE status = 'active' AND (subject_entity_id = :subject_entity_id OR subject_entity_id IS NULL) ORDER BY updated_at DESC LIMIT :limit`, { subject_entity_id: subjectEntityId, limit })
      : this.all<Record<string, unknown>>(`SELECT * FROM promoted_memories WHERE status = 'active' ORDER BY updated_at DESC LIMIT :limit`, { limit })
    ).map(mapPromotedMemory);
  }

  summarizeGraph(options: GraphSummaryOptions): GraphContext {
    const seedEntityIds = [...new Set(options.seedEntityIds.filter((entityId) => entityId.trim().length > 0))];
    if (seedEntityIds.length === 0) {
      return {
        seed_entities: [],
        related_entities: [],
        relationships: [],
      };
    }

    const relationships = this.listRelationshipsForEntities(seedEntityIds, options.relationshipLimit ?? 12);
    const relatedEntityIds = [...new Set([
      ...seedEntityIds,
      ...relationships.flatMap((relationship) => [relationship.from_entity_id, relationship.to_entity_id]),
    ])];

    return {
      seed_entities: seedEntityIds,
      related_entities: relatedEntityIds.slice(0, options.relatedEntityLimit ?? 12),
      relationships: relationships.map(mapRelationshipSummary),
    };
  }

  countTable(tableName: 'entities' | 'relationships' | 'decisions' | 'preferences' | 'promoted_memories' | 'knowledge_pages' | 'promotion_candidates'): number {
    const row = this.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
    return row?.count ?? 0;
  }
}

export function defaultTruthKernelStoreLocation(currentDirectory: string = process.cwd()): string {
  return join(currentDirectory, '.jarvis-fusion', 'truth.db');
}

export function createTruthKernelStorage(location: string, options: SqliteTruthKernelStoreOptions = {}): SqliteTruthKernelStorage {
  return new SqliteTruthKernelStorage(location, options);
}

export function ensureTruthKernelSeedData(store: SqliteTruthKernelStorage, options: TruthKernelSeedOptions = {}): void {
  const project = options.project?.trim() || 'jarvis-fusion-system';
  const objective = options.objective?.trim() || 'deliver codex-first external brain';
  const activeTask = options.activeTask?.trim() || 'session-start';
  const projectEntityId = `project:${project}`;
  const timestamp = nowIso();

  if (store.getEntity(projectEntityId)) return;

  store.transaction(() => {
    store.upsertEntity({ entity_id: projectEntityId, entity_type: 'project', name: project, summary: 'Primary local-first project workspace for Jarvis Fusion v1.', state_json: toJson({ objective, activeTask }), status: 'active', canonical_page_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertEntity({ entity_id: `task:${project}:${activeTask}`, entity_type: 'task', name: activeTask, summary: `Current active task for ${project}.`, state_json: toJson({ projectEntityId }), status: 'active', canonical_page_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertEntity({ entity_id: `system:${project}:codex-shim`, entity_type: 'system', name: 'Codex host shim', summary: 'Thin operator-facing host shim for Codex.', state_json: toJson({ host: 'codex' }), status: 'active', canonical_page_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertDecision({ decision_id: `decision:${project}:shared-backend-host-shims`, title: 'Use a shared backend with thin host shims', statement: 'Jarvis Fusion v1 keeps truth, archive orchestration, and session assembly in one local backend while Codex/Claude integrations remain thin shims.', status: 'active', scope_entity_id: projectEntityId, effective_at: timestamp, superseded_by: null, provenance_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertPreference({ preference_id: `preference:${project}:rollout-order`, subject_kind: 'project', subject_ref: projectEntityId, key: 'host_rollout', value: 'codex-first', strength: 'high', status: 'active', provenance_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertPromotedMemory({ memory_id: `memory:${project}:session-start-pack`, memory_type: 'project', access_tier: 'ops', summary: 'Session-start context packs should come from persisted SQLite truth data.', content: `Current objective: ${objective}. Active task: ${activeTask}.`, subject_entity_id: projectEntityId, status: 'active', provenance_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertRelationship({ relationship_id: `relationship:${project}:project-active-task`, from_entity_id: projectEntityId, relation_type: 'has_active_task', to_entity_id: `task:${project}:${activeTask}`, weight: 1, status: 'active', provenance_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertRelationship({ relationship_id: `relationship:${project}:project-host-shim`, from_entity_id: projectEntityId, relation_type: 'uses_system', to_entity_id: `system:${project}:codex-shim`, weight: 0.9, status: 'active', provenance_id: null, created_at: timestamp, updated_at: timestamp });
  });
}

export function loadSessionStartSnapshot(store: SqliteTruthKernelStorage, options: SessionSnapshotOptions = {}): SessionStartSnapshot {
  return {
    entities: options.projectEntityId ? [store.getEntity(options.projectEntityId)].filter((value): value is TruthEntityRecord => Boolean(value)) : store.listActiveEntities(options.entityLimit ?? 5),
    decisions: store.listActiveDecisions(options.decisionLimit ?? 5, options.projectEntityId),
    preferences: store.listActivePreferences(options.preferenceLimit ?? 5, options.projectEntityId),
    promotedMemories: store.listActivePromotedMemories(options.memoryLimit ?? 5, options.projectEntityId),
  };
}

export function loadGraphSummary(store: SqliteTruthKernelStorage, options: GraphSummaryOptions): GraphContext {
  return store.summarizeGraph(options);
}
