import type {
  ContradictionItem,
  ReviewQueueItem,
  SessionIdentity,
  SourceAnchor,
  StaleItem,
} from '../contracts/index.js';

export type ISODateTimeString = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type MemoryType =
  | 'episodic'
  | 'semantic'
  | 'project'
  | 'procedural'
  | 'analytical';

export type AccessTier = 'self' | 'notes' | 'ops';

export type EntityType =
  | 'person'
  | 'project'
  | 'system'
  | 'tool'
  | 'concept'
  | 'decision'
  | 'task'
  | 'event';

export type TruthStatus = 'active' | 'superseded' | 'inactive' | 'rejected';

export type CandidateReviewStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'superseded'
  | 'needs_more_evidence';

export type KnowledgePageStatus = 'draft' | 'canonical' | 'stale';

export type KnowledgePageType =
  | 'project_page'
  | 'entity_page'
  | 'decision_page'
  | 'topic_brief'
  | 'session_brief';

export type PromotionAction = 'create' | 'update' | 'supersede';

export interface ProvenanceRecord extends SourceAnchor {
  readonly provenance_id: string;
  readonly observed_at: ISODateTimeString | null;
  readonly imported_at: ISODateTimeString | null;
  readonly promoted_at: ISODateTimeString | null;
  readonly promoted_by: string | null;
  readonly confidence: number | null;
  readonly notes: string | null;
}

export interface TruthEntityRecord {
  readonly entity_id: string;
  readonly entity_type: EntityType;
  readonly name: string;
  readonly summary: string;
  readonly state_json: string;
  readonly status: TruthStatus;
  readonly canonical_page_id: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface TruthRelationshipRecord {
  readonly relationship_id: string;
  readonly from_entity_id: string;
  readonly relation_type: string;
  readonly to_entity_id: string;
  readonly weight: number | null;
  readonly status: TruthStatus;
  readonly provenance_id: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface TruthDecisionRecord {
  readonly decision_id: string;
  readonly title: string;
  readonly statement: string;
  readonly status: TruthStatus;
  readonly scope_entity_id: string | null;
  readonly effective_at: ISODateTimeString | null;
  readonly superseded_by: string | null;
  readonly provenance_id: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface TruthPreferenceRecord {
  readonly preference_id: string;
  readonly subject_kind: string;
  readonly subject_ref: string | null;
  readonly key: string;
  readonly value: string;
  readonly strength: string;
  readonly status: TruthStatus;
  readonly provenance_id: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface TruthPromotedMemoryRecord {
  readonly memory_id: string;
  readonly memory_type: MemoryType;
  readonly access_tier: AccessTier;
  readonly summary: string;
  readonly content: string;
  readonly subject_entity_id: string | null;
  readonly status: TruthStatus;
  readonly provenance_id: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface TruthClaimRecord {
  readonly claim_id: string;
  readonly claim_type: string;
  readonly claim_text: string;
  readonly subject_entity_id: string | null;
  readonly status: TruthStatus;
  readonly evidence_bundle_id: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface TruthPromotionCandidateRecord {
  readonly candidate_id: string;
  readonly claim_id: string;
  readonly proposed_action: PromotionAction;
  readonly target_object_type: string;
  readonly target_object_id: string | null;
  readonly review_status: CandidateReviewStatus;
  readonly review_notes: string | null;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface KnowledgePageRecord {
  readonly page_id: string;
  readonly page_type: KnowledgePageType;
  readonly title: string;
  readonly summary_markdown: string;
  readonly status: KnowledgePageStatus;
  readonly linked_entity_ids: readonly string[];
  readonly linked_decision_ids: readonly string[];
  readonly linked_evidence_bundle_ids: readonly string[];
  readonly updated_at: ISODateTimeString;
}

export interface EvidenceItem {
  readonly evidence_id: string;
  readonly source_ref: string;
  readonly title: string;
  readonly excerpt: string;
  readonly observed_at: ISODateTimeString | null;
  readonly confidence: number | null;
  readonly metadata: JsonObject;
}

export interface EvidenceBundle {
  readonly bundle_id: string;
  readonly query: string;
  readonly items: readonly EvidenceItem[];
  readonly generated_at: ISODateTimeString;
}

export interface ArchiveSearchQuery {
  readonly query: string;
  readonly limit?: number;
}

export interface ArchiveSearchFilters {
  readonly sourceSystems?: readonly string[];
  readonly sourceKinds?: readonly string[];
  readonly minConfidence?: number;
}

export interface ArchivePointerMeta extends SourceAnchor {
  readonly notes?: string;
}

export interface ArchiveHealth {
  readonly ok: boolean;
  readonly message: string;
}

export interface ArchiveProvider {
  search(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): Promise<EvidenceBundle>;
  getItem(evidenceId: string): Promise<EvidenceItem | null>;
  ingestPointer?(meta: ArchivePointerMeta): Promise<string>;
  health(): Promise<ArchiveHealth>;
}

export interface SessionCurrentFocus {
  readonly project: string | null;
  readonly objective: string | null;
  readonly active_task: string | null;
}

export interface TruthHighlights {
  readonly decisions: readonly TruthDecisionRecord[];
  readonly preferences: readonly TruthPreferenceRecord[];
  readonly entities: readonly TruthEntityRecord[];
  readonly promoted_memories: readonly TruthPromotedMemoryRecord[];
}

export interface JcpContext {
  readonly enabled: boolean;
  readonly decisions: readonly string[];
  readonly entities: readonly string[];
}

export interface GraphRelationshipSummary {
  readonly relationship_id: string;
  readonly from_entity_id: string;
  readonly relation_type: string;
  readonly to_entity_id: string;
  readonly weight: number | null;
}

export interface GraphContext {
  readonly seed_entities: readonly string[];
  readonly related_entities: readonly string[];
  readonly relationships: readonly GraphRelationshipSummary[];
}

export interface RecentChanges {
  readonly recent_promotions: readonly string[];
  readonly superseded: readonly string[];
  readonly open_contradictions: readonly string[];
  readonly review_queue: readonly string[];
  readonly stale_items: readonly string[];
  readonly contradiction_items: readonly ContradictionItem[];
  readonly review_queue_items: readonly ReviewQueueItem[];
  readonly stale_item_details: readonly StaleItem[];
}

export interface EvidenceAppendix {
  readonly enabled: boolean;
  readonly bundles: readonly EvidenceBundle[];
}

export interface PageReference {
  readonly page_id: string;
  readonly page_type: KnowledgePageType;
  readonly title: string;
  readonly status: KnowledgePageStatus;
}

export interface SessionContextPack {
  readonly session: SessionIdentity;
  readonly current_focus: SessionCurrentFocus;
  readonly truth_highlights: TruthHighlights;
  readonly jcp_context?: JcpContext;
  readonly graph_context: GraphContext;
  readonly recent_changes: RecentChanges;
  readonly evidence_appendix: EvidenceAppendix;
  readonly related_pages: readonly PageReference[];
}

export interface SessionContextQuery {
  readonly project_id?: string;
  readonly task_id?: string;
  readonly subject_entity_ids?: readonly string[];
  readonly include_evidence?: boolean;
  readonly evidence_limit?: number;
}

export interface TruthKernelHealth {
  readonly ok: boolean;
  readonly location: string;
  readonly schema_version: number;
  readonly message: string;
}

export interface SqliteQueryResult {
  readonly changes: number;
  readonly lastInsertRowid: number;
}

export interface TruthKernelStore {
  readonly location: string;
  migrate(): void;
  close(): void;
  health(): TruthKernelHealth;
  run(sql: string, params?: Readonly<Record<string, unknown>>): SqliteQueryResult;
  all<T>(sql: string, params?: Readonly<Record<string, unknown>>): readonly T[];
  get<T>(sql: string, params?: Readonly<Record<string, unknown>>): T | undefined;
  transaction<T>(operation: () => T): T;
}
