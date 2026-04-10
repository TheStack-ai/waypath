export type HostName = 'codex';
export type ImportMode = 'bootstrap' | 'manual' | 'reimport';

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
  source_system: string;
  source_kind: string;
  source_ref: string;
}

export interface TruthHighlights {
  decisions: string[];
  preferences: string[];
  entities: string[];
  promoted_memories: string[];
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
  reader_names: string[];
  source_anchors: SourceAnchor[];
}

export interface ImportResult {
  operation: 'import';
  status: 'imported';
  mode: ImportMode;
  manifest_id: string;
  readers: string[];
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
  sourceSystems?: Record<string, number>;
  sourceKinds?: Record<string, number>;
}

export interface LocalSourceStatusItem {
  reader: string;
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

export interface SessionContextPack {
  session: SessionIdentity;
  current_focus: SessionFocus;
  truth_highlights: TruthHighlights;
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

export type FacadeVerb =
  | 'session-start'
  | 'recall'
  | 'page'
  | 'promote'
  | 'review'
  | 'review-queue'
  | 'inspect-page'
  | 'inspect-candidate'
  | 'graph-query'
  | 'resolve-contradiction'
  | 'refresh-page';

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
  inspectPage(pageId: string): InspectPageResult;
  inspectCandidate(candidateId: string): InspectCandidateResult;
  graphQuery(entityId: string, pattern?: GraphTraversalPattern): GraphQueryResult;
  resolveContradiction(key: string, keepPreferenceId: string, scopeRef?: string, notes?: string): ResolveContradictionResult;
  refreshPage(pageId: string): RefreshPageResult;
}

export interface SessionRuntime {
  buildContextPack(input: SessionStartInput): SessionContextPack;
}

export interface CodexBootstrapInput extends SessionStartInput {
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
