import type { MemoryType, AccessTier, KnowledgePageStatus, KnowledgePageType, TruthStatus } from '../contracts.js';

export const TRUTH_KERNEL_SCHEMA_VERSION = 4;

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

/**
 * Schema v3 migration: add valid_from / valid_until temporal columns.
 * ALTER TABLE is idempotent via IF NOT EXISTS-style try/catch in the runner.
 * Existing rows get valid_from = created_at, valid_until = NULL (currently valid).
 */
export const TRUTH_KERNEL_V3_TEMPORAL_COLUMNS: readonly {
  readonly table: string;
  readonly backfillSource: string;
}[] = [
  { table: 'entities', backfillSource: 'created_at' },
  { table: 'decisions', backfillSource: 'created_at' },
  { table: 'preferences', backfillSource: 'created_at' },
  { table: 'relationships', backfillSource: 'created_at' },
  { table: 'promoted_memories', backfillSource: 'created_at' },
];

/**
 * Schema v4 migration: add FOREIGN KEY constraints to tables that reference
 * entities, provenance_records, evidence_bundles, and claims.
 *
 * SQLite does not support ALTER TABLE ADD CONSTRAINT, so we recreate each
 * table with the FK clause, copy data, drop old, rename new.
 * The entire migration runs inside a transaction (see storage.ts).
 */
export const TRUTH_KERNEL_V4_FK_MIGRATION = `
-- relationships
CREATE TABLE relationships_v4 (
  relationship_id TEXT PRIMARY KEY,
  from_entity_id TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL,
  to_entity_id TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE RESTRICT,
  weight REAL,
  status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
  provenance_id TEXT REFERENCES provenance_records(provenance_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT
);
INSERT INTO relationships_v4 SELECT relationship_id, from_entity_id, relation_type, to_entity_id, weight, status, provenance_id, created_at, updated_at, valid_from, valid_until FROM relationships;
DROP TABLE relationships;
ALTER TABLE relationships_v4 RENAME TO relationships;
CREATE INDEX IF NOT EXISTS idx_relationships_from_entity_id ON relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to_entity_id ON relationships(to_entity_id);

-- decisions
CREATE TABLE decisions_v4 (
  decision_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
  scope_entity_id TEXT REFERENCES entities(entity_id) ON DELETE SET NULL,
  effective_at TEXT,
  superseded_by TEXT,
  provenance_id TEXT REFERENCES provenance_records(provenance_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT
);
INSERT INTO decisions_v4 SELECT decision_id, title, statement, status, scope_entity_id, effective_at, superseded_by, provenance_id, created_at, updated_at, valid_from, valid_until FROM decisions;
DROP TABLE decisions;
ALTER TABLE decisions_v4 RENAME TO decisions;
CREATE INDEX IF NOT EXISTS idx_decisions_status_updated_at ON decisions(status, updated_at DESC);

-- preferences
CREATE TABLE preferences_v4 (
  preference_id TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL,
  subject_ref TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  strength TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
  provenance_id TEXT REFERENCES provenance_records(provenance_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT
);
INSERT INTO preferences_v4 SELECT preference_id, subject_kind, subject_ref, key, value, strength, status, provenance_id, created_at, updated_at, valid_from, valid_until FROM preferences;
DROP TABLE preferences;
ALTER TABLE preferences_v4 RENAME TO preferences;
CREATE INDEX IF NOT EXISTS idx_preferences_subject_kind_ref ON preferences(subject_kind, subject_ref);

-- promoted_memories
CREATE TABLE promoted_memories_v4 (
  memory_id TEXT PRIMARY KEY,
  memory_type TEXT NOT NULL CHECK (memory_type IN (${MEMORY_TYPE_LIST})),
  access_tier TEXT NOT NULL CHECK (access_tier IN (${ACCESS_TIER_LIST})),
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  subject_entity_id TEXT REFERENCES entities(entity_id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
  provenance_id TEXT REFERENCES provenance_records(provenance_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT
);
INSERT INTO promoted_memories_v4 SELECT memory_id, memory_type, access_tier, summary, content, subject_entity_id, status, provenance_id, created_at, updated_at, valid_from, valid_until FROM promoted_memories;
DROP TABLE promoted_memories;
ALTER TABLE promoted_memories_v4 RENAME TO promoted_memories;
CREATE INDEX IF NOT EXISTS idx_promoted_memories_status_updated_at ON promoted_memories(status, updated_at DESC);

-- claims
CREATE TABLE claims_v4 (
  claim_id TEXT PRIMARY KEY,
  claim_type TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  subject_entity_id TEXT REFERENCES entities(entity_id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN (${TRUTH_STATUS_LIST})),
  evidence_bundle_id TEXT REFERENCES evidence_bundles(bundle_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO claims_v4 SELECT * FROM claims;
DROP TABLE claims;
ALTER TABLE claims_v4 RENAME TO claims;
CREATE INDEX IF NOT EXISTS idx_claims_status_updated_at ON claims(status, updated_at DESC);

-- promotion_candidates
CREATE TABLE promotion_candidates_v4 (
  candidate_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE RESTRICT,
  proposed_action TEXT NOT NULL CHECK (proposed_action IN ('create', 'update', 'supersede')),
  target_object_type TEXT NOT NULL,
  target_object_id TEXT,
  review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'accepted', 'rejected', 'superseded', 'needs_more_evidence')),
  review_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO promotion_candidates_v4 SELECT * FROM promotion_candidates;
DROP TABLE promotion_candidates;
ALTER TABLE promotion_candidates_v4 RENAME TO promotion_candidates;
CREATE INDEX IF NOT EXISTS idx_promotion_candidates_review_status ON promotion_candidates(review_status, updated_at DESC);
`;

export function buildTruthKernelMigrationSql(): string {
  return [
    'PRAGMA foreign_keys = ON',
    ...TRUTH_KERNEL_MIGRATIONS.map((migration) => migration.trim()),
    `INSERT OR REPLACE INTO schema_meta (schema_name, schema_version, applied_at)
     VALUES ('truth_kernel', ${TRUTH_KERNEL_SCHEMA_VERSION}, CURRENT_TIMESTAMP)`,
  ].join(';\n');
}

/**
 * Build ALTER TABLE statements for v3 temporal columns.
 * Each ALTER is run individually so that already-migrated DBs don't fail.
 */
export function buildTemporalMigrationStatements(): readonly string[] {
  const stmts: string[] = [];
  for (const { table, backfillSource } of TRUTH_KERNEL_V3_TEMPORAL_COLUMNS) {
    stmts.push(`ALTER TABLE ${table} ADD COLUMN valid_from TEXT`);
    stmts.push(`ALTER TABLE ${table} ADD COLUMN valid_until TEXT`);
    stmts.push(`UPDATE ${table} SET valid_from = ${backfillSource} WHERE valid_from IS NULL`);
  }
  return stmts;
}
