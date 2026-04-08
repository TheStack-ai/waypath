export type HostName = 'codex';

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

export interface EvidenceAppendix {
  enabled: true;
  bundles: string[];
}

export interface SessionContextPack {
  current_focus: SessionFocus;
  truth_highlights: TruthHighlights;
  graph_context: GraphContext;
  recent_changes: RecentChanges;
  evidence_appendix: EvidenceAppendix;
}

export type FacadeVerb = 'session-start' | 'recall' | 'page' | 'promote';

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
  status: 'stub';
  message: string;
}

export interface PageResult {
  operation: 'page';
  status: 'stub';
  message: string;
}

export interface PromoteResult {
  operation: 'promote';
  status: 'stub';
  message: string;
}

export interface FacadeApi {
  describe(): FacadeDescription;
  sessionStart(input: SessionStartInput): SessionStartResult;
  recall(query: string): RecallResult;
  page(subject: string): PageResult;
  promote(subject: string): PromoteResult;
}

export interface SessionRuntime {
  buildContextPack(input: SessionStartInput): SessionContextPack;
}

export interface CodexBootstrapInput extends SessionStartInput {
  sessionId?: string | undefined;
  command?: string | undefined;
}

export interface CodexBootstrapResult {
  host: 'codex';
  status: 'bootstrapped';
  entry_point: 'src/host-shims/codex';
  command: 'codex';
  session_id: string;
  facade: ReturnType<FacadeApi['describe']>;
  session: SessionStartResult;
}
