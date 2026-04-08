export type HostName = 'codex';
export type ImportMode = 'bootstrap' | 'manual' | 'reimport';

export interface SessionFocus {
  project: string;
  objective: string;
  activeTask: string;
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

export interface RecentChanges {
  recent_promotions: string[];
  superseded: string[];
  open_contradictions: string[];
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

export interface ImportCounts {
  provenance: number;
  entities: number;
  decisions: number;
  preferences: number;
  promoted_memories: number;
  promoted_candidates: number;
}

export interface ImportResult {
  operation: 'import';
  status: 'imported';
  mode: ImportMode;
  manifest_id: string;
  imported_at: string;
  store_path: string;
  counts: ImportCounts;
  message: string;
}

export interface SessionContextPack {
  current_focus: SessionFocus;
  truth_highlights: TruthHighlights;
  graph_context: GraphContext;
  recent_changes: RecentChanges;
  evidence_appendix: EvidenceAppendix;
  related_pages: PageReference[];
}

export type FacadeVerb = 'session-start' | 'recall' | 'page' | 'promote' | 'review';

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

export interface FacadeApi {
  describe(): FacadeDescription;
  sessionStart(input: SessionStartInput): SessionStartResult;
  recall(query: string): RecallResult;
  page(subject: string): PageResult;
  promote(subject: string): PromoteResult;
  review(candidateId: string, status: PromotionCandidateView['status'], notes?: string): ReviewResult;
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
