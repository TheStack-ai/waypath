import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  SourceKind,
  SourceSystem,
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
import type { EvidenceBundle, PromotionCandidateView, StoredKnowledgePage } from '../../contracts/index.js';
import type { SqliteDb, SqliteDriver } from '../../shared/sqlite-driver.js';
import { createSqliteDriver } from '../../shared/sqlite-factory.js';
import { TRUTH_KERNEL_SCHEMA_VERSION, buildTruthKernelMigrationSql, buildTemporalMigrationStatements, TRUTH_KERNEL_V4_FK_MIGRATION } from './schema.js';
import { nowIso } from '../../shared/time.js';

export interface SqliteTruthKernelStoreOptions {
  readonly autoMigrate?: boolean;
  readonly driver?: SqliteDriver;
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

export interface WaypathFtsMatch {
  readonly source_table: 'entities' | 'decisions' | 'preferences' | 'promoted_memories';
  readonly source_id: string;
  readonly source_type: 'entity' | 'decision' | 'preference' | 'memory';
  readonly status: string;
  readonly title: string;
  readonly content: string;
  readonly rank: number;
}

interface SessionSnapshotOptions {
  readonly projectEntityId?: string;
  readonly entityLimit?: number;
  readonly decisionLimit?: number;
  readonly preferenceLimit?: number;
  readonly memoryLimit?: number;
}

interface PreferenceConflictRow {
  readonly key: string;
  readonly subject_ref: string | null;
  readonly values_json: string;
  readonly last_updated: string;
}

const WAYPATH_FTS_SCHEMA_NAME = 'fts_version';
const WAYPATH_FTS_SCHEMA_VERSION = 1;

function normalizeLocation(location: string): string {
  return location.trim();
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

function tokenizeFtsQuery(query: string): string[] {
  return query
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((token) => token.trim())
    .filter((token) => token.length > 0)
    ?? [];
}

function toFtsMatchQuery(query: string): string {
  return tokenizeFtsQuery(query)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' AND ');
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
    valid_from: row.valid_from === null || row.valid_from === undefined ? null : String(row.valid_from),
    valid_until: row.valid_until === null || row.valid_until === undefined ? null : String(row.valid_until),
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
    valid_from: row.valid_from === null || row.valid_from === undefined ? null : String(row.valid_from),
    valid_until: row.valid_until === null || row.valid_until === undefined ? null : String(row.valid_until),
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
    valid_from: row.valid_from === null || row.valid_from === undefined ? null : String(row.valid_from),
    valid_until: row.valid_until === null || row.valid_until === undefined ? null : String(row.valid_until),
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
    valid_from: row.valid_from === null || row.valid_from === undefined ? null : String(row.valid_from),
    valid_until: row.valid_until === null || row.valid_until === undefined ? null : String(row.valid_until),
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
    valid_from: row.valid_from === null || row.valid_from === undefined ? null : String(row.valid_from),
    valid_until: row.valid_until === null || row.valid_until === undefined ? null : String(row.valid_until),
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

function mapEvidenceBundle(row: Record<string, unknown>): EvidenceBundle {
  return JSON.parse(String(row.bundle_json)) as EvidenceBundle;
}

function mapPromotionCandidate(row: Record<string, unknown>): PromotionCandidateView {
  const reviewStatus = String(row.review_status);
  return {
    candidate_id: String(row.candidate_id),
    subject: String(row.review_notes ?? row.candidate_id),
    status:
      reviewStatus === 'accepted'
        ? 'accepted'
        : reviewStatus === 'rejected'
          ? 'rejected'
          : reviewStatus === 'needs_more_evidence'
            ? 'needs_more_evidence'
            : reviewStatus === 'superseded'
              ? 'superseded'
              : 'pending_review',
    summary: String(row.review_notes ?? `Promotion candidate ${row.candidate_id} is ${reviewStatus}`),
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
  readonly db: SqliteDb;

  constructor(location: string, options: SqliteTruthKernelStoreOptions = {}) {
    this.location = normalizeLocation(location);
    ensureParentDirectory(this.location);
    this.db = (options.driver ?? createSqliteDriver()).open(this.location);
    if (options.autoMigrate ?? true) this.migrate();
  }

  migrate(): void {
    this.db.exec(buildTruthKernelMigrationSql());
    // v3: temporal validity columns — each ALTER run individually (idempotent)
    if (this.getSchemaMetaVersion('temporal_version') !== 1) {
      for (const stmt of buildTemporalMigrationStatements()) {
        try {
          this.db.exec(stmt);
        } catch (e) {
          if (e instanceof Error && e.message.includes('duplicate column')) continue;
          throw e;
        }
      }
      this.setSchemaMetaVersion('temporal_version', 1);
    }
    // v4: foreign key constraints — recreate tables with FK clauses
    if (this.getSchemaMetaVersion('fk_version') !== 1) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        // Preflight: clean orphan references that would violate FK constraints.
        // Pre-v4 createPromotionCandidate wrote claim_id = candidate_id without a claims row.
        this.db.exec(`INSERT OR IGNORE INTO claims (claim_id, claim_type, claim_text, status, created_at, updated_at)
          SELECT pc.claim_id, 'legacy', 'auto-created for FK migration', 'active', pc.created_at, pc.updated_at
          FROM promotion_candidates pc WHERE pc.claim_id NOT IN (SELECT claim_id FROM claims)`);
        // Remove relationships referencing non-existent entities
        this.db.exec(`DELETE FROM relationships WHERE from_entity_id NOT IN (SELECT entity_id FROM entities)
          OR to_entity_id NOT IN (SELECT entity_id FROM entities)`);
        // Nullify dangling provenance references
        this.db.exec(`UPDATE relationships SET provenance_id = NULL WHERE provenance_id IS NOT NULL AND provenance_id NOT IN (SELECT provenance_id FROM provenance_records)`);
        this.db.exec(`UPDATE decisions SET provenance_id = NULL WHERE provenance_id IS NOT NULL AND provenance_id NOT IN (SELECT provenance_id FROM provenance_records)`);
        this.db.exec(`UPDATE decisions SET scope_entity_id = NULL WHERE scope_entity_id IS NOT NULL AND scope_entity_id NOT IN (SELECT entity_id FROM entities)`);
        this.db.exec(`UPDATE preferences SET provenance_id = NULL WHERE provenance_id IS NOT NULL AND provenance_id NOT IN (SELECT provenance_id FROM provenance_records)`);
        this.db.exec(`UPDATE promoted_memories SET provenance_id = NULL WHERE provenance_id IS NOT NULL AND provenance_id NOT IN (SELECT provenance_id FROM provenance_records)`);
        this.db.exec(`UPDATE promoted_memories SET subject_entity_id = NULL WHERE subject_entity_id IS NOT NULL AND subject_entity_id NOT IN (SELECT entity_id FROM entities)`);

        this.db.exec(TRUTH_KERNEL_V4_FK_MIGRATION);
        this.setSchemaMetaVersion('fk_version', 1);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    if (this.getSchemaMetaVersion(WAYPATH_FTS_SCHEMA_NAME) !== WAYPATH_FTS_SCHEMA_VERSION) {
      this.rebuildWaypathFts();
      this.setSchemaMetaVersion(WAYPATH_FTS_SCHEMA_NAME, WAYPATH_FTS_SCHEMA_VERSION);
    }
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
    this.run(`INSERT INTO entities (entity_id, entity_type, name, summary, state_json, status, canonical_page_id, created_at, updated_at, valid_from, valid_until)
      VALUES (:entity_id,:entity_type,:name,:summary,:state_json,:status,:canonical_page_id,:created_at,:updated_at,:valid_from,:valid_until)
      ON CONFLICT(entity_id) DO UPDATE SET entity_type=excluded.entity_type,name=excluded.name,summary=excluded.summary,state_json=excluded.state_json,status=excluded.status,canonical_page_id=excluded.canonical_page_id,updated_at=excluded.updated_at,valid_from=excluded.valid_from,valid_until=excluded.valid_until`, {
      ...asParams(record),
      valid_from: record.valid_from ?? record.created_at,
      valid_until: record.valid_until ?? null,
    });
    this.upsertWaypathFtsEntry(
      'entities',
      record.entity_id,
      'entity',
      record.status,
      record.name,
      `${record.name}\n${record.summary}`,
    );
  }

  upsertDecision(record: TruthDecisionRecord): void {
    this.run(`INSERT INTO decisions (decision_id,title,statement,status,scope_entity_id,effective_at,superseded_by,provenance_id,created_at,updated_at,valid_from,valid_until)
      VALUES (:decision_id,:title,:statement,:status,:scope_entity_id,:effective_at,:superseded_by,:provenance_id,:created_at,:updated_at,:valid_from,:valid_until)
      ON CONFLICT(decision_id) DO UPDATE SET title=excluded.title,statement=excluded.statement,status=excluded.status,scope_entity_id=excluded.scope_entity_id,effective_at=excluded.effective_at,superseded_by=excluded.superseded_by,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at,valid_from=excluded.valid_from,valid_until=excluded.valid_until`, {
      ...asParams(record),
      valid_from: record.valid_from ?? record.created_at,
      valid_until: record.valid_until ?? null,
    });
    this.upsertWaypathFtsEntry(
      'decisions',
      record.decision_id,
      'decision',
      record.status,
      record.title,
      `${record.title}\n${record.statement}`,
    );
  }

  upsertRelationship(record: TruthRelationshipRecord): void {
    this.run(`INSERT INTO relationships (relationship_id,from_entity_id,relation_type,to_entity_id,weight,status,provenance_id,created_at,updated_at,valid_from,valid_until)
      VALUES (:relationship_id,:from_entity_id,:relation_type,:to_entity_id,:weight,:status,:provenance_id,:created_at,:updated_at,:valid_from,:valid_until)
      ON CONFLICT(relationship_id) DO UPDATE SET from_entity_id=excluded.from_entity_id,relation_type=excluded.relation_type,to_entity_id=excluded.to_entity_id,weight=excluded.weight,status=excluded.status,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at,valid_from=excluded.valid_from,valid_until=excluded.valid_until`, {
      ...asParams(record),
      valid_from: record.valid_from ?? record.created_at,
      valid_until: record.valid_until ?? null,
    });
  }

  upsertProvenance(record: { provenance_id: string; source_system: SourceSystem; source_kind: SourceKind; source_ref: string; observed_at: string | null; imported_at: string | null; promoted_at: string | null; promoted_by: string | null; confidence: number | null; notes: string | null; }): string {
    this.run(`INSERT INTO provenance_records (provenance_id,source_system,source_kind,source_ref,observed_at,imported_at,promoted_at,promoted_by,confidence,notes)
      VALUES (:provenance_id,:source_system,:source_kind,:source_ref,:observed_at,:imported_at,:promoted_at,:promoted_by,:confidence,:notes)
      ON CONFLICT(provenance_id) DO UPDATE SET source_system=excluded.source_system,source_kind=excluded.source_kind,source_ref=excluded.source_ref,observed_at=excluded.observed_at,imported_at=excluded.imported_at,promoted_at=excluded.promoted_at,promoted_by=excluded.promoted_by,confidence=excluded.confidence,notes=excluded.notes`, asParams(record));
    return record.provenance_id;
  }

  upsertPreference(record: TruthPreferenceRecord): void {
    this.run(`INSERT INTO preferences (preference_id,subject_kind,subject_ref,key,value,strength,status,provenance_id,created_at,updated_at,valid_from,valid_until)
      VALUES (:preference_id,:subject_kind,:subject_ref,:key,:value,:strength,:status,:provenance_id,:created_at,:updated_at,:valid_from,:valid_until)
      ON CONFLICT(preference_id) DO UPDATE SET subject_kind=excluded.subject_kind,subject_ref=excluded.subject_ref,key=excluded.key,value=excluded.value,strength=excluded.strength,status=excluded.status,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at,valid_from=excluded.valid_from,valid_until=excluded.valid_until`, {
      ...asParams(record),
      valid_from: record.valid_from ?? record.created_at,
      valid_until: record.valid_until ?? null,
    });
    this.upsertWaypathFtsEntry(
      'preferences',
      record.preference_id,
      'preference',
      record.status,
      `${record.key}=${record.value}`,
      `Preference ${record.key}=${record.value} (${record.strength}) for ${record.subject_ref ?? 'global'}`,
    );
  }

  upsertPromotedMemory(record: TruthPromotedMemoryRecord): void {
    this.run(`INSERT INTO promoted_memories (memory_id,memory_type,access_tier,summary,content,subject_entity_id,status,provenance_id,created_at,updated_at,valid_from,valid_until)
      VALUES (:memory_id,:memory_type,:access_tier,:summary,:content,:subject_entity_id,:status,:provenance_id,:created_at,:updated_at,:valid_from,:valid_until)
      ON CONFLICT(memory_id) DO UPDATE SET memory_type=excluded.memory_type,access_tier=excluded.access_tier,summary=excluded.summary,content=excluded.content,subject_entity_id=excluded.subject_entity_id,status=excluded.status,provenance_id=excluded.provenance_id,updated_at=excluded.updated_at,valid_from=excluded.valid_from,valid_until=excluded.valid_until`, {
      ...asParams(record),
      valid_from: record.valid_from ?? record.created_at,
      valid_until: record.valid_until ?? null,
    });
    this.upsertWaypathFtsEntry(
      'promoted_memories',
      record.memory_id,
      'memory',
      record.status,
      record.summary,
      `${record.summary}\n${record.content}`,
    );
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

  upsertEvidenceBundle(bundle: EvidenceBundle): void {
    this.run(
      `INSERT INTO evidence_bundles (bundle_id, query, bundle_json, generated_at, updated_at)
       VALUES (:bundle_id, :query, :bundle_json, :generated_at, :updated_at)
       ON CONFLICT(bundle_id) DO UPDATE SET query=excluded.query, bundle_json=excluded.bundle_json, generated_at=excluded.generated_at, updated_at=excluded.updated_at`,
      {
        bundle_id: bundle.bundle_id,
        query: bundle.query,
        bundle_json: JSON.stringify(bundle),
        generated_at: bundle.generated_at,
        updated_at: nowIso(),
      },
    );
  }

  getEvidenceBundle(bundleId: string): EvidenceBundle | undefined {
    const row = this.get<Record<string, unknown>>(
      `SELECT * FROM evidence_bundles WHERE bundle_id = :bundle_id LIMIT 1`,
      { bundle_id: bundleId },
    );
    return row ? mapEvidenceBundle(row) : undefined;
  }

  listEvidenceBundles(limit = 10): readonly EvidenceBundle[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM evidence_bundles ORDER BY updated_at DESC LIMIT :limit`,
      { limit },
    ).map(mapEvidenceBundle);
  }

  listKnowledgePages(limit = 10, status?: StoredKnowledgePage['page']['status']): readonly StoredKnowledgePage[] {
    const rows = status
      ? this.all<Record<string, unknown>>(
          `SELECT * FROM knowledge_pages WHERE status = :status ORDER BY updated_at DESC LIMIT :limit`,
          { status, limit },
        )
      : this.all<Record<string, unknown>>(
          `SELECT * FROM knowledge_pages ORDER BY updated_at DESC LIMIT :limit`,
          { limit },
        );
    return rows.map(mapKnowledgePage);
  }

  createPromotionCandidate(candidate: PromotionCandidateView): void {
    const claimId = candidate.candidate_id;
    // Ensure prerequisite claim record exists (FK: promotion_candidates.claim_id -> claims.claim_id)
    this.run(
      `INSERT INTO claims (claim_id, claim_type, claim_text, subject_entity_id, status, evidence_bundle_id, created_at, updated_at)
       VALUES (:claim_id, :claim_type, :claim_text, :subject_entity_id, :status, :evidence_bundle_id, :created_at, :updated_at)
       ON CONFLICT(claim_id) DO UPDATE SET claim_text=excluded.claim_text, updated_at=excluded.updated_at`,
      {
        claim_id: claimId,
        claim_type: 'general',
        claim_text: candidate.summary ?? candidate.subject ?? candidate.candidate_id,
        subject_entity_id: null,
        status: 'active',
        evidence_bundle_id: null,
        created_at: candidate.created_at,
        updated_at: candidate.created_at,
      },
    );
    this.run(`INSERT INTO promotion_candidates (candidate_id,claim_id,proposed_action,target_object_type,target_object_id,review_status,review_notes,created_at,updated_at)
      VALUES (:candidate_id,:claim_id,:proposed_action,:target_object_type,:target_object_id,:review_status,:review_notes,:created_at,:updated_at)
      ON CONFLICT(candidate_id) DO UPDATE SET review_status=excluded.review_status,review_notes=excluded.review_notes,updated_at=excluded.updated_at`, {
      candidate_id: candidate.candidate_id,
      claim_id: claimId,
      proposed_action: 'create',
      target_object_type: 'promoted_memory',
      target_object_id: null,
      review_status:
        candidate.status === 'accepted'
          ? 'accepted'
          : candidate.status === 'rejected'
            ? 'rejected'
            : candidate.status === 'needs_more_evidence'
              ? 'needs_more_evidence'
              : candidate.status === 'superseded'
                ? 'superseded'
                : 'pending',
      review_notes: candidate.summary,
      created_at: candidate.created_at,
      updated_at: candidate.created_at,
    });
  }

  getPromotionCandidate(candidateId: string): PromotionCandidateView | undefined {
    const row = this.get<Record<string, unknown>>(`SELECT * FROM promotion_candidates WHERE candidate_id = :candidate_id LIMIT 1`, { candidate_id: candidateId });
    return row ? mapPromotionCandidate(row) : undefined;
  }

  listPromotionCandidates(limit = 10): readonly PromotionCandidateView[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM promotion_candidates ORDER BY updated_at DESC LIMIT :limit`,
      { limit },
    ).map(mapPromotionCandidate);
  }

  reviewPromotionCandidate(
    candidateId: string,
    reviewStatus: PromotionCandidateView['status'],
    reviewNotes?: string,
  ): PromotionCandidateView | undefined {
    const status =
      reviewStatus === 'pending_review'
        ? 'pending'
        : reviewStatus;
    this.run(
      `UPDATE promotion_candidates
       SET review_status = :review_status,
           review_notes = COALESCE(:review_notes, review_notes),
           updated_at = :updated_at
       WHERE candidate_id = :candidate_id`,
      {
        candidate_id: candidateId,
        review_status: status,
        review_notes: reviewNotes ?? null,
        updated_at: nowIso(),
      },
    );
    return this.getPromotionCandidate(candidateId);
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

  getDecision(decisionId: string): TruthDecisionRecord | undefined {
    const row = this.get<Record<string, unknown>>(
      `SELECT * FROM decisions WHERE decision_id = :decision_id LIMIT 1`,
      { decision_id: decisionId },
    );
    return row ? mapDecision(row) : undefined;
  }

  getPromotedMemory(memoryId: string): TruthPromotedMemoryRecord | undefined {
    const row = this.get<Record<string, unknown>>(
      `SELECT * FROM promoted_memories WHERE memory_id = :memory_id LIMIT 1`,
      { memory_id: memoryId },
    );
    return row ? mapPromotedMemory(row) : undefined;
  }

  listActiveEntities(limit = 5): readonly TruthEntityRecord[] {
    return this.all<Record<string, unknown>>(`SELECT * FROM entities WHERE status = 'active' AND valid_until IS NULL ORDER BY updated_at DESC LIMIT :limit`, { limit }).map(mapEntity);
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
      ? this.all<Record<string, unknown>>(`SELECT * FROM decisions WHERE status = 'active' AND valid_until IS NULL AND (scope_entity_id = :scope_entity_id OR scope_entity_id IS NULL) ORDER BY updated_at DESC LIMIT :limit`, { scope_entity_id: scopeEntityId, limit })
      : this.all<Record<string, unknown>>(`SELECT * FROM decisions WHERE status = 'active' AND valid_until IS NULL ORDER BY updated_at DESC LIMIT :limit`, { limit })
    ).map(mapDecision);
  }

  listActivePreferences(limit = 5, subjectRef?: string): readonly TruthPreferenceRecord[] {
    return (subjectRef
      ? this.all<Record<string, unknown>>(`SELECT * FROM preferences WHERE status = 'active' AND valid_until IS NULL AND (subject_ref = :subject_ref OR subject_ref IS NULL) ORDER BY updated_at DESC LIMIT :limit`, { subject_ref: subjectRef, limit })
      : this.all<Record<string, unknown>>(`SELECT * FROM preferences WHERE status = 'active' AND valid_until IS NULL ORDER BY updated_at DESC LIMIT :limit`, { limit })
    ).map(mapPreference);
  }

  listActivePromotedMemories(limit = 5, subjectEntityId?: string): readonly TruthPromotedMemoryRecord[] {
    return (subjectEntityId
      ? this.all<Record<string, unknown>>(`SELECT * FROM promoted_memories WHERE status = 'active' AND valid_until IS NULL AND (subject_entity_id = :subject_entity_id OR subject_entity_id IS NULL) ORDER BY updated_at DESC LIMIT :limit`, { subject_entity_id: subjectEntityId, limit })
      : this.all<Record<string, unknown>>(`SELECT * FROM promoted_memories WHERE status = 'active' AND valid_until IS NULL ORDER BY updated_at DESC LIMIT :limit`, { limit })
    ).map(mapPromotedMemory);
  }

  /**
   * Supersede an entity: sets valid_until on the old record and marks it superseded.
   */
  supersedeEntity(entityId: string, newEntityId: string): void {
    const ts = nowIso();
    this.run(
      `UPDATE entities SET status = 'superseded', valid_until = :ts, updated_at = :ts WHERE entity_id = :entity_id`,
      { entity_id: entityId, ts },
    );
    // Also update the FTS index for the old entity
    this.upsertWaypathFtsEntry('entities', entityId, 'entity', 'superseded', entityId, entityId);
    // Link the old to new via the entity's state_json
    const old = this.getEntity(entityId);
    if (old) {
      const state = JSON.parse(old.state_json || '{}');
      state.superseded_by = newEntityId;
      this.run(`UPDATE entities SET state_json = :state_json WHERE entity_id = :entity_id`, {
        entity_id: entityId,
        state_json: JSON.stringify(state),
      });
    }
  }

  /**
   * Supersede a decision: sets valid_until on the old record.
   */
  supersedeDecision(decisionId: string, newDecisionId: string): void {
    const ts = nowIso();
    this.run(
      `UPDATE decisions SET status = 'superseded', valid_until = :ts, superseded_by = :new_id, updated_at = :ts WHERE decision_id = :decision_id`,
      { decision_id: decisionId, new_id: newDecisionId, ts },
    );
  }

  /**
   * List full history of an entity across all statuses (active, superseded, inactive).
   * Returns all versions ordered by valid_from DESC.
   */
  listEntityHistory(entityId: string, limit = 20): readonly TruthEntityRecord[] {
    // First check if this entity has a supersede chain via state_json
    const rows = this.all<Record<string, unknown>>(
      `SELECT * FROM entities WHERE entity_id = :entity_id ORDER BY valid_from DESC LIMIT :limit`,
      { entity_id: entityId, limit },
    );
    if (rows.length > 0) return rows.map(mapEntity);
    // If no exact match, search for entities with same name (name-based history)
    return [];
  }

  /**
   * List all versions of records sharing a name prefix for temporal history.
   * Useful for tracking entity evolution across supersede chains.
   */
  listEntityHistoryByName(name: string, limit = 20): readonly TruthEntityRecord[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM entities WHERE name = :name ORDER BY valid_from DESC, updated_at DESC LIMIT :limit`,
      { name, limit },
    ).map(mapEntity);
  }

  /**
   * List decision history by scope or specific ID.
   */
  listDecisionHistory(decisionId: string, limit = 20): readonly TruthDecisionRecord[] {
    // Walk backward: find predecessors whose superseded_by points into the chain.
    // Depth guard prevents infinite recursion on cycles (cap at limit).
    const backwardRows = this.all<Record<string, unknown>>(
      `WITH RECURSIVE back_chain(decision_id, depth) AS (
        SELECT decision_id, 0 FROM decisions WHERE decision_id = :id
        UNION ALL
        SELECT d.decision_id, c.depth + 1
          FROM decisions d JOIN back_chain c ON d.superseded_by = c.decision_id
          WHERE c.depth < :limit
      )
      SELECT d.* FROM decisions d JOIN back_chain c ON d.decision_id = c.decision_id
      ORDER BY d.valid_from ASC LIMIT :limit`,
      { id: decisionId, limit },
    ).map(mapDecision);

    // Walk forward: follow the superseded_by field from the starting decision.
    const forwardRows = this.all<Record<string, unknown>>(
      `WITH RECURSIVE fwd_chain(decision_id, depth) AS (
        SELECT decision_id, 0 FROM decisions WHERE decision_id = :id
        UNION ALL
        SELECT d2.decision_id, c.depth + 1
          FROM decisions d1
          JOIN fwd_chain c ON d1.decision_id = c.decision_id
          JOIN decisions d2 ON d2.decision_id = d1.superseded_by
          WHERE d1.superseded_by IS NOT NULL AND c.depth < :limit
      )
      SELECT d.* FROM decisions d JOIN fwd_chain c ON d.decision_id = c.decision_id
      ORDER BY d.valid_from ASC LIMIT :limit`,
      { id: decisionId, limit },
    ).map(mapDecision);

    // Merge, deduplicate, and enforce global limit
    const visited = new Set<string>();
    const result: TruthDecisionRecord[] = [];

    for (const row of [...backwardRows, ...forwardRows]) {
      if (visited.has(row.decision_id)) continue;
      visited.add(row.decision_id);
      result.push(row);
      if (result.length >= limit) break;
    }

    return result;
  }

  listOpenPreferenceContradictions(limit = 8, scopeRef?: string): readonly string[] {
    const rows = scopeRef
      ? this.all<PreferenceConflictRow>(
          `SELECT key, subject_ref, json_group_array(DISTINCT value) as values_json, MAX(updated_at) as last_updated
             FROM preferences
            WHERE status = 'active'
              AND (
                subject_ref = :scope_ref
                OR subject_ref LIKE :scope_prefix
                OR subject_ref IS NULL
              )
            GROUP BY key, subject_ref
           HAVING COUNT(DISTINCT value) > 1
            ORDER BY last_updated DESC
            LIMIT :limit`,
          { scope_ref: scopeRef, scope_prefix: `${scopeRef}:%`, limit },
        )
      : this.all<PreferenceConflictRow>(
          `SELECT key, subject_ref, json_group_array(DISTINCT value) as values_json, MAX(updated_at) as last_updated
             FROM preferences
            WHERE status = 'active'
            GROUP BY key, subject_ref
           HAVING COUNT(DISTINCT value) > 1
            ORDER BY last_updated DESC
            LIMIT :limit`,
          { limit },
        );

    return rows.map((row) => {
      const values = parseJsonArray(row.values_json);
      const scope = row.subject_ref ?? 'workspace';
      return `Preference conflict on ${scope}: ${row.key} -> ${values.join(' | ')}`;
    });
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

  /**
   * Mark knowledge pages stale when their linked_entity_ids_json or linked_decision_ids_json
   * contains any of the given IDs. Uses json_each for precise JSON array matching.
   * Returns the page_ids that were marked stale.
   */
  markKnowledgePagesStale(affectedIds: readonly string[]): readonly string[] {
    if (affectedIds.length === 0) return [];
    const timestamp = nowIso();

    // Batch all affectedIds into a single query using json_each()
    const idsJson = JSON.stringify(affectedIds);
    const pages = this.all<{ page_id: string }>(
      `SELECT DISTINCT page_id FROM knowledge_pages
       WHERE status != 'stale'
         AND (
           EXISTS (SELECT 1 FROM json_each(linked_entity_ids_json) je, json_each(:ids) aid WHERE je.value = aid.value)
           OR EXISTS (SELECT 1 FROM json_each(linked_decision_ids_json) je, json_each(:ids) aid WHERE je.value = aid.value)
         )`,
      { ids: idsJson },
    );

    const staledPageIds = pages.map((row) => row.page_id);

    if (staledPageIds.length > 0) {
      const placeholders = staledPageIds.map((_, i) => `:page_id_${i}`).join(', ');
      const params: Record<string, unknown> = { ts: timestamp };
      for (let i = 0; i < staledPageIds.length; i++) {
        params[`page_id_${i}`] = staledPageIds[i];
      }
      this.run(
        `UPDATE knowledge_pages SET status = 'stale', updated_at = :ts WHERE page_id IN (${placeholders})`,
        params,
      );
    }

    return staledPageIds;
  }

  searchWaypathFts(query: string, limit = 20): readonly WaypathFtsMatch[] {
    const matchQuery = toFtsMatchQuery(query);
    if (matchQuery.length === 0) return [];
    return this.all<WaypathFtsMatch>(
      `SELECT source_table, source_id, source_type, status, title, content, bm25(waypath_fts) AS rank
         FROM waypath_fts
        WHERE waypath_fts MATCH :query
          AND status = 'active'
        ORDER BY rank
        LIMIT :limit`,
      { query: matchQuery, limit },
    );
  }

  countTable(tableName: 'schema_meta' | 'provenance_records' | 'entities' | 'relationships' | 'decisions' | 'preferences' | 'promoted_memories' | 'claims' | 'promotion_candidates' | 'knowledge_pages' | 'evidence_bundles' | 'waypath_fts'): number {
    const row = this.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`);
    return row?.count ?? 0;
  }

  getSchemaMetaVersionPublic(schemaName: string): number | null {
    return this.getSchemaMetaVersion(schemaName);
  }

  setSchemaMetaVersionPublic(schemaName: string, schemaVersion: number): void {
    this.setSchemaMetaVersion(schemaName, schemaVersion);
  }

  private upsertWaypathFtsEntry(
    sourceTable: WaypathFtsMatch['source_table'],
    sourceId: string,
    sourceType: WaypathFtsMatch['source_type'],
    status: string,
    title: string,
    content: string,
  ): void {
    this.run(
      `DELETE FROM waypath_fts WHERE source_table = :source_table AND source_id = :source_id`,
      { source_table: sourceTable, source_id: sourceId },
    );
    this.run(
      `INSERT INTO waypath_fts (source_table, source_id, source_type, status, title, content)
       VALUES (:source_table, :source_id, :source_type, :status, :title, :content)`,
      {
        source_table: sourceTable,
        source_id: sourceId,
        source_type: sourceType,
        status,
        title,
        content,
      },
    );
  }

  rebuildWaypathFts(): void {
    this.db.exec(`DELETE FROM waypath_fts`);
    this.db.exec(
      `INSERT INTO waypath_fts (source_table, source_id, source_type, status, title, content)
       SELECT 'entities', entity_id, 'entity', status, name, name || char(10) || summary
         FROM entities`,
    );
    this.db.exec(
      `INSERT INTO waypath_fts (source_table, source_id, source_type, status, title, content)
       SELECT 'decisions', decision_id, 'decision', status, title, title || char(10) || statement
         FROM decisions`,
    );
    this.db.exec(
      `INSERT INTO waypath_fts (source_table, source_id, source_type, status, title, content)
       SELECT 'preferences', preference_id, 'preference', status,
              key || '=' || value,
              'Preference ' || key || '=' || value || ' (' || strength || ') for ' || COALESCE(subject_ref, 'global')
         FROM preferences`,
    );
    this.db.exec(
      `INSERT INTO waypath_fts (source_table, source_id, source_type, status, title, content)
       SELECT 'promoted_memories', memory_id, 'memory', status, summary, summary || char(10) || content
         FROM promoted_memories`,
    );
  }

  private getSchemaMetaVersion(schemaName: string): number | null {
    const row = this.get<{ schema_version: number }>(
      `SELECT schema_version FROM schema_meta WHERE schema_name = :schema_name LIMIT 1`,
      { schema_name: schemaName },
    );
    return row?.schema_version ?? null;
  }

  private setSchemaMetaVersion(schemaName: string, schemaVersion: number): void {
    this.run(
      `INSERT INTO schema_meta (schema_name, schema_version, applied_at)
       VALUES (:schema_name, :schema_version, :applied_at)
       ON CONFLICT(schema_name) DO UPDATE SET schema_version = excluded.schema_version, applied_at = excluded.applied_at`,
      {
        schema_name: schemaName,
        schema_version: schemaVersion,
        applied_at: nowIso(),
      },
    );
  }
}

export function defaultTruthKernelStoreLocation(currentDirectory: string = process.cwd()): string {
  return join(currentDirectory, '.waypath', 'truth.db');
}

export function createTruthKernelStorage(location: string, options: SqliteTruthKernelStoreOptions = {}): SqliteTruthKernelStorage {
  return new SqliteTruthKernelStorage(location, options);
}

export function ensureTruthKernelSeedData(store: SqliteTruthKernelStorage, options: TruthKernelSeedOptions = {}): void {
  const project = options.project?.trim() || 'waypath';
  const objective = options.objective?.trim() || 'deliver codex-first external brain';
  const activeTask = options.activeTask?.trim() || 'session-start';
  const projectEntityId = `project:${project}`;
  const timestamp = nowIso();

  if (store.getEntity(projectEntityId)) return;

  store.transaction(() => {
    store.upsertEntity({ entity_id: projectEntityId, entity_type: 'project', name: project, summary: 'Primary local-first project workspace for Waypath v1.', state_json: toJson({ objective, activeTask }), status: 'active', canonical_page_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertEntity({ entity_id: `task:${project}:${activeTask}`, entity_type: 'task', name: activeTask, summary: `Current active task for ${project}.`, state_json: toJson({ projectEntityId }), status: 'active', canonical_page_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertEntity({ entity_id: `system:${project}:codex-shim`, entity_type: 'system', name: 'Codex host shim', summary: 'Thin operator-facing host shim for Codex.', state_json: toJson({ host: 'codex' }), status: 'active', canonical_page_id: null, created_at: timestamp, updated_at: timestamp });
    store.upsertDecision({ decision_id: `decision:${project}:shared-backend-host-shims`, title: 'Use a shared backend with thin host shims', statement: 'Waypath v1 keeps truth, archive orchestration, and session assembly in one local backend while Codex/Claude integrations remain thin shims.', status: 'active', scope_entity_id: projectEntityId, effective_at: timestamp, superseded_by: null, provenance_id: null, created_at: timestamp, updated_at: timestamp });
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
