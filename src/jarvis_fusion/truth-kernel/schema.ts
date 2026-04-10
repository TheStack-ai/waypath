import type { MemoryType, AccessTier, KnowledgePageStatus, KnowledgePageType, TruthStatus } from '../contracts.js';

export const TRUTH_KERNEL_SCHEMA_VERSION = 2;

export const MEMORY_TYPES: readonly MemoryType[] = [
  'episodic',
  'semantic',
  'project',
  'procedural',
  'analytical',
] as const;

export const ACCESS_TIERS: readonly AccessTier[] = ['self', 'notes', 'ops'] as const;

export const TRUTH_STATUSES: readonly TruthStatus[] = ['active', 'superseded', 'inactive', 'rejected'] as const;

export const KNOWLEDGE_PAGE_STATUSES: readonly KnowledgePageStatus[] = ['draft', 'canonical', 'stale'] as const;

export const KNOWLEDGE_PAGE_TYPES: readonly KnowledgePageType[] = [
  'project_page',
  'entity_page',
  'decision_page',
  'topic_brief',
  'session_brief',
] as const;

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlEnumList(values: readonly string[]): string {
  return values.map(quoteSqlString).join(', ');
}

const TRUTH_STATUS_LIST = sqlEnumList(TRUTH_STATUSES);
const MEMORY_TYPE_LIST = sqlEnumList(MEMORY_TYPES);
const ACCESS_TIER_LIST = sqlEnumList(ACCESS_TIERS);
const KNOWLEDGE_PAGE_STATUS_LIST = sqlEnumList(KNOWLEDGE_PAGE_STATUSES);
const KNOWLEDGE_PAGE_TYPE_LIST = sqlEnumList(KNOWLEDGE_PAGE_TYPES);

export const TRUTH_KERNEL_MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS schema_meta (
    schema_name TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    applied_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS provenance_records (
    provenance_id TEXT PRIMARY KEY,
    source_system TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    observed_at TEXT,
    imported_at TEXT,
    promoted_at TEXT,
    promoted_by TEXT,
    confidence REAL,
    notes TEXT
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS entities (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'project', 'system', 'tool', 'concept', 'decision', 'task', 'event')),
    name TEXT NOT NULL,
    summary TEXT NOT NULL,
    state_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
    canonical_page_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS relationships (
    relationship_id TEXT PRIMARY KEY,
    from_entity_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    to_entity_id TEXT NOT NULL,
    weight REAL,
    status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
    provenance_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS decisions (
    decision_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    statement TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
    scope_entity_id TEXT,
    effective_at TEXT,
    superseded_by TEXT,
    provenance_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS preferences (
    preference_id TEXT PRIMARY KEY,
    subject_kind TEXT NOT NULL,
    subject_ref TEXT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    strength TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
    provenance_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS promoted_memories (
    memory_id TEXT PRIMARY KEY,
    memory_type TEXT NOT NULL CHECK (memory_type IN (${MEMORY_TYPE_LIST})),
    access_tier TEXT NOT NULL CHECK (access_tier IN (${ACCESS_TIER_LIST})),
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    subject_entity_id TEXT,
    status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
    provenance_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS claims (
    claim_id TEXT PRIMARY KEY,
    claim_type TEXT NOT NULL,
    claim_text TEXT NOT NULL,
    subject_entity_id TEXT,
    status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
    evidence_bundle_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS promotion_candidates (
    candidate_id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    proposed_action TEXT NOT NULL CHECK (proposed_action IN ('create', 'update', 'supersede')),
    target_object_type TEXT NOT NULL,
    target_object_id TEXT,
    review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'accepted', 'rejected', 'superseded', 'needs_more_evidence')),
    review_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS knowledge_pages (
    page_id TEXT PRIMARY KEY,
    page_type TEXT NOT NULL CHECK (page_type IN (${KNOWLEDGE_PAGE_TYPE_LIST})),
    title TEXT NOT NULL,
    summary_markdown TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${KNOWLEDGE_PAGE_STATUS_LIST})),
    linked_entity_ids_json TEXT NOT NULL,
    linked_decision_ids_json TEXT NOT NULL,
    linked_evidence_bundle_ids_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS evidence_bundles (
    bundle_id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    bundle_json TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
  `
  CREATE VIRTUAL TABLE IF NOT EXISTS waypath_fts
  USING fts5(
    source_table UNINDEXED,
    source_id UNINDEXED,
    source_type UNINDEXED,
    status UNINDEXED,
    title,
    content
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_entities_status_updated_at
  ON entities(status, updated_at DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_relationships_from_entity_id
  ON relationships(from_entity_id)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_relationships_to_entity_id
  ON relationships(to_entity_id)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_decisions_status_updated_at
  ON decisions(status, updated_at DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_preferences_subject_kind_ref
  ON preferences(subject_kind, subject_ref)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_promoted_memories_status_updated_at
  ON promoted_memories(status, updated_at DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_claims_status_updated_at
  ON claims(status, updated_at DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_promotion_candidates_review_status
  ON promotion_candidates(review_status, updated_at DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_knowledge_pages_status_updated_at
  ON knowledge_pages(status, updated_at DESC)
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_evidence_bundles_updated_at
  ON evidence_bundles(updated_at DESC)
  `,
] as const;

export function buildTruthKernelMigrationSql(): string {
  return [
    'PRAGMA foreign_keys = ON',
    ...TRUTH_KERNEL_MIGRATIONS.map((migration) => migration.trim()),
    `INSERT OR REPLACE INTO schema_meta (schema_name, schema_version, applied_at)
     VALUES ('truth_kernel', ${TRUTH_KERNEL_SCHEMA_VERSION}, CURRENT_TIMESTAMP)`,
  ].join(';\n');
}
