export type HostName = 'codex' | 'claude-code';
export type ImportMode = 'bootstrap' | 'manual' | 'reimport';
export type SourceSystem =
  | 'truth-kernel'
  | 'jarvis-memory-db'
  | 'jarvis-brain-db'
  | 'mempalace'
  | 'demo-source'
  | 'waypath-promotion'
  | 'local-archive';
export type SourceKind =
  | 'entity'
  | 'decision'
  | 'preference'
  | 'relationship'
  | 'memory'
  | 'database'
  | 'project_snapshot'
  | 'decision_snapshot'
  | 'preference_snapshot'
  | 'memory_snapshot'
  | 'import_reader'
  | 'promotion_review'
  | 'contradiction_resolution'
  | 'snapshot'
  | 'evidence'
  | 'transcript'
  | 'note'
  | 'pointer'
  | 'observation'
  | 'daily'
  | 'person'
  | 'project'
  | 'research'
  | 'knowledge'
  | 'system'
  | 'tool'
  | 'concept'
  | 'task'
  | 'event'
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'analytical';

const SOURCE_SYSTEM_SET = new Set<string>([
  'truth-kernel',
  'jarvis-memory-db',
  'jarvis-brain-db',
  'mempalace',
  'demo-source',
  'waypath-promotion',
  'local-archive',
]);

const SOURCE_KIND_SET = new Set<string>([
  'entity',
  'decision',
  'preference',
  'relationship',
  'memory',
  'database',
  'project_snapshot',
  'decision_snapshot',
  'preference_snapshot',
  'memory_snapshot',
  'import_reader',
  'promotion_review',
  'contradiction_resolution',
  'snapshot',
  'evidence',
  'transcript',
  'note',
  'pointer',
  'observation',
  'daily',
  'person',
  'project',
  'research',
  'knowledge',
  'system',
  'tool',
  'concept',
  'task',
  'event',
  'episodic',
  'semantic',
  'procedural',
  'analytical',
]);

export function parseSourceSystem(value: unknown): SourceSystem | null {
  return typeof value === 'string' && SOURCE_SYSTEM_SET.has(value)
    ? value as SourceSystem
    : null;
}

export function parseSourceKind(value: unknown): SourceKind | null {
  return typeof value === 'string' && SOURCE_KIND_SET.has(value)
    ? value as SourceKind
    : null;
}

export function toSourceSystem(value: unknown, fallback: SourceSystem): SourceSystem {
  return parseSourceSystem(value) ?? fallback;
}

export function toSourceKind(value: unknown, fallback: SourceKind): SourceKind {
  return parseSourceKind(value) ?? fallback;
}

export interface SessionIdentity {
  session_id: string;
  host: HostName;
  project: string;
  objective: string;
  active_task: string;
}

export interface SessionFocus {
  project: string;
  objective: string;
  activeTask: string;
}

export interface SourceAnchor {
  source_system: SourceSystem;
  source_kind: SourceKind;
  source_ref: string;
}

export interface TruthHighlights {
  decisions: string[];
  preferences: string[];
  entities: string[];
  promoted_memories: string[];
}

export interface JcpContext {
  enabled: boolean;
  decisions: string[];
  entities: string[];
}

export interface GraphContext {
  seed_entities: string[];
  related_entities: string[];
  relationships: string[];
}

export interface ContradictionItem {
  contradiction_id: string;
  kind: 'preference_conflict';
  scope_ref: string;
  key: string;
  values: string[];
  summary: string;
  updated_at: string;
}

export interface RecentChanges {
  recent_promotions: string[];
  superseded: string[];
  open_contradictions: string[];
  review_queue: string[];
  stale_items: string[];
  contradiction_items: ContradictionItem[];
  review_queue_items: ReviewQueueItem[];
  stale_item_details: StaleItem[];
}

export interface EvidenceItem {
  evidence_id: string;
  source_ref: string;
  title: string;
  excerpt: string;
  observed_at: string | null;
  confidence: number | null;
  metadata: Record<string, unknown>;
}

export interface EvidenceBundle {
  bundle_id: string;
  query: string;
  generated_at: string;
  items: EvidenceItem[];
}

export interface EvidenceAppendix {
  enabled: boolean;
  bundles: string[];
}

export interface PageReference {
  page_id: string;
  page_type: 'session_brief' | 'topic_brief' | 'project_page' | 'entity_page' | 'decision_page';
  title: string;
  status: 'draft' | 'canonical' | 'stale';
}

export interface StaleItem {
  page_id: string;
  page_type: PageReference['page_type'];
  title: string;
  status: 'stale';
  updated_at: string;
  summary: string;
}

export interface StoredKnowledgePage {
  page: PageReference;
  summary_markdown: string;
  linked_entity_ids: string[];
  linked_decision_ids: string[];
  linked_evidence_bundle_ids: string[];
  updated_at: string;
}

export interface PromotionCandidateView {
  candidate_id: string;
  subject: string;
  status: 'accepted' | 'pending_review' | 'rejected' | 'needs_more_evidence' | 'superseded';
  summary: string;
  created_at: string;
}

export interface ReviewQueueItem {
  candidate_id: string;
  status: 'pending_review' | 'needs_more_evidence';
  subject: string;
  summary: string;
  created_at: string;
}

export interface ImportCounts {
  provenance: number;
  entities: number;
  relationships: number;
  decisions: number;
  preferences: number;
  promoted_memories: number;
  promoted_candidates: number;
}

export interface ImportRun {
  manifest_id: string;
  mode: ImportMode;
  imported_at: string;
  reader_names: SourceSystem[];
  source_anchors: SourceAnchor[];
}

export interface ImportResult {
  operation: 'import';
  status: 'imported';
  mode: ImportMode;
  manifest_id: string;
  readers: SourceSystem[];
  imported_at: string;
  run: ImportRun;
  store_path: string;
  counts: ImportCounts;
  message: string;
}

export interface SourceAdapterEnabledMap {
  [readerName: string]: boolean | undefined;
}

export interface RecallWeightOverrides {
  sourceSystems?: Partial<Record<SourceSystem, number>>;
  sourceKinds?: Partial<Record<SourceKind, number>>;
}

export interface LocalSourceStatusItem {
  reader: SourceSystem;
  available: boolean;
  enabled: boolean;
  path: string | null;
  adapter_status: 'ready' | 'probe_only' | 'blocked' | 'missing';
  source_anchor?: SourceAnchor | null;
}

export interface LocalSourceStatusResult {
  operation: 'source-status';
  status: 'ready';
  sources: LocalSourceStatusItem[];
}

export interface WaypathSourceHealthStatus {
  reader: LocalSourceStatusItem['reader'];
  enabled: boolean;
  available: boolean;
  adapter_status: LocalSourceStatusItem['adapter_status'];
  path: string | null;
  ok: boolean;
  message: string;
}

export interface WaypathTruthKernelStatus {
  ok: boolean;
  location: string;
  schema_version: number;
  message: string;
  integrity_check: string;
}

export interface WaypathFtsSyncStatus {
  ok: boolean;
  indexed_rows: number;
  expected_rows: number;
  missing_rows: number;
}

export interface WaypathTemporalCoherenceStatus {
  expired_but_active: number;
  warning: string | null;
}

export interface WaypathHealthResult {
  operation: 'health';
  status: 'ready';
  ok: boolean;
  truth_kernel: WaypathTruthKernelStatus;
  fts_sync: WaypathFtsSyncStatus;
  stale_pages: number;
  pending_reviews: number;
  temporal_coherence: WaypathTemporalCoherenceStatus;
  jcp_status: WaypathSourceHealthStatus;
  mempalace_status: WaypathSourceHealthStatus;
  db_size_bytes: number;
  message: string;
}

export interface SessionContextPack {
  session: SessionIdentity;
  current_focus: SessionFocus;
  truth_highlights: TruthHighlights;
  jcp_context?: JcpContext;
  graph_context: GraphContext;
  recent_changes: RecentChanges;
  evidence_appendix: EvidenceAppendix;
  related_pages: PageReference[];
}

export interface ResolveContradictionResult {
  operation: 'resolve-contradiction';
  status: 'ready';
  message: string;
  kept_preference_id: string;
  resolved_count: number;
}

export interface RefreshPageResult {
  operation: 'refresh-page';
  status: 'ready' | 'missing';
  message: string;
  page_id: string;
  previous_status: string;
  new_status: string;
}

export interface ExplainResultItem {
  id: string;
  title: string;
  source_system: SourceSystem;
  source_kind: SourceKind;
  score_breakdown: {
    keyword: number;
    graph: number;
    provenance: number;
    lexical: number;
    total: number;
  };
  provenance_chain: {
    provenance_id: string;
    source_ref: string;
    promoted_at: string | null;
    promoted_by: string | null;
    confidence: number | null;
  }[] | null;
  graph_path: {
    seed: string;
    steps: { entity: string; relation: string; depth: number }[];
  } | null;
}

export interface ExplainResult {
  operation: 'explain';
  status: 'ready';
  query: string;
  truth_results: ExplainResultItem[];
  archive_results: ExplainResultItem[];
}

export type FacadeVerb =
  | 'session-start'
  | 'recall'
  | 'page'
  | 'promote'
  | 'review'
  | 'review-queue'
  | 'source-status'
  | 'health'
  | 'inspect-page'
  | 'inspect-candidate'
  | 'graph-query'
  | 'resolve-contradiction'
  | 'refresh-page'
  | 'explain';

export interface FacadeDescription {
  name: string;
  host_shims: HostName[];
  verbs: FacadeVerb[];
  access_layer: 'operator-facing';
  session_runtime: 'local-first';
}

export interface SessionStartInput {
  project?: string | undefined;
  objective?: string | undefined;
  activeTask?: string | undefined;
  seedEntities?: string[] | undefined;
}

export interface SessionStartResult {
  operation: 'session-start';
  session_id: string;
  context_pack: SessionContextPack;
}

export interface RecallResult {
  operation: 'recall';
  status: 'ready' | 'stub';
  message: string;
  bundle?: EvidenceBundle;
  truth_bundle?: EvidenceBundle;
}

export interface PageView {
  page: PageReference;
  summary_markdown: string;
}

export interface PageResult {
  operation: 'page';
  status: 'ready' | 'stub';
  message: string;
  page?: PageView;
}

export interface PromoteResult {
  operation: 'promote';
  status: 'ready' | 'stub';
  message: string;
  candidate?: PromotionCandidateView;
}

export interface ReviewResult {
  operation: 'review';
  status: 'ready' | 'missing';
  message: string;
  candidate?: PromotionCandidateView;
}

export interface ReviewQueueResult {
  operation: 'review-queue';
  status: 'ready';
  pending_review: PromotionCandidateView[];
  stale_pages: PageReference[];
  open_contradictions: string[];
  review_queue_items: ReviewQueueItem[];
  stale_items: StaleItem[];
  contradiction_items: ContradictionItem[];
}

export interface InspectPageResult {
  operation: 'inspect-page';
  status: 'ready' | 'missing';
  message: string;
  page?: StoredKnowledgePage;
}

export interface InspectCandidateResult {
  operation: 'inspect-candidate';
  status: 'ready' | 'missing';
  message: string;
  candidate?: PromotionCandidateView;
}

// Inline types for graph query results (avoids circular deps through jarvis_fusion/contracts)
export interface GraphQueryEntitySummary {
  entity_id: string;
  name: string;
  entity_type: string;
  status: string;
  summary: string;
  state_json: string;
  canonical_page_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GraphQueryRelationshipSummary {
  relationship_id: string;
  from_entity_id: string;
  relation_type: string;
  to_entity_id: string;
  weight: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GraphQueryDecisionSummary {
  decision_id: string;
  title: string;
  statement: string;
  status: string;
  scope_entity_id: string | null;
  effective_at: string | null;
  superseded_by: string | null;
  provenance_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GraphQueryPathStep {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  relation_type: string;
  direction: 'outgoing' | 'incoming';
  depth: number;
  weight: number | null;
}

export interface GraphQueryTraversalPath {
  seed_entity_id: string;
  steps: readonly GraphQueryPathStep[];
  terminal_entity_ids: readonly string[];
}

export interface GraphQueryExpansionResult {
  seed_entities: readonly string[];
  expanded_entities: readonly GraphQueryEntitySummary[];
  expanded_relationships: readonly GraphQueryRelationshipSummary[];
  traversal_paths: readonly GraphQueryTraversalPath[];
  related_decisions: readonly GraphQueryDecisionSummary[];
}

export interface GraphQueryResult {
  operation: 'graph-query';
  status: 'ready';
  message: string;
  result: GraphQueryExpansionResult;
}

export type GraphTraversalPattern = 'project_context' | 'person_context' | 'system_reasoning' | 'contradiction_lookup';

export interface FacadeApi {
  describe(): FacadeDescription;
  sessionStart(input: SessionStartInput): SessionStartResult;
  recall(query: string): RecallResult;
  page(subject: string): PageResult;
  promote(subject: string): PromoteResult;
  review(candidateId: string, status: PromotionCandidateView['status'], notes?: string): ReviewResult;
  reviewQueue(): ReviewQueueResult;
  sourceStatus(): LocalSourceStatusResult;
  health(): WaypathHealthResult;
  inspectPage(pageId: string): InspectPageResult;
  inspectCandidate(candidateId: string): InspectCandidateResult;
  graphQuery(entityId: string, pattern?: GraphTraversalPattern): GraphQueryResult;
  resolveContradiction(key: string, keepPreferenceId: string, scopeRef?: string, notes?: string): ResolveContradictionResult;
  refreshPage(pageId: string): RefreshPageResult;
  explain(query: string): ExplainResult;
}

export interface SessionRuntime {
  buildContextPack(input: SessionStartInput): SessionContextPack;
}

export interface CodexBootstrapInput extends SessionStartInput {
  sessionId?: string | undefined;
  command?: string | undefined;
  storePath?: string | undefined;
}

export interface ClaudeCodeBootstrapInput extends SessionStartInput {
  sessionId?: string | undefined;
  command?: string | undefined;
  storePath?: string | undefined;
}

export interface CodexBootstrapResult {
  host: 'codex';
  status: 'bootstrapped';
  entry_point: 'src/host-shims/codex';
  command: 'codex';
  session_id: string;
  facade: ReturnType<FacadeApi['describe']>;
  session: SessionStartResult;
  store_path: string;
}

export interface ClaudeCodeBootstrapResult {
  host: 'claude-code';
  status: 'bootstrapped';
  entry_point: 'src/host-shims/claude-code';
  command: 'claude-code';
  session_id: string;
  facade: ReturnType<FacadeApi['describe']>;
  session: SessionStartResult;
  store_path: string;
}
