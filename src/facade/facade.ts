import {
  type ContradictionItem,
  type ExplainResult,
  type ExplainResultItem,
  type FacadeApi,
  type FacadeDescription,
  type GraphQueryResult,
  type GraphTraversalPattern,
  type InspectCandidateResult,
  type InspectPageResult,
  type LocalSourceStatusResult,
  type PageResult,
  type PromoteResult,
  type ReviewQueueResult,
  type ReviewResult,
  type RecallWeightOverrides,
  type RecallResult,
  type ReviewQueueItem,
  type SessionRuntime,
  type SessionStartInput,
  type SessionStartResult,
  type SourceAdapterEnabledMap,
  type StaleItem,
  type WaypathHealthResult,
} from '../contracts';
import { queryTruthDirect, searchTruthKernel } from '../archive-kernel/search/index.js';
import type { ScoredResult } from '../archive-kernel/search/index.js';
import { createSessionRuntime, type SessionRuntimeOptions } from '../session-runtime';
import { createJcpLiveReader } from '../adapters/jcp/index.js';
import { buildLocalArchiveBundle, buildTruthDirectBundle } from '../jarvis_fusion/archive-provider.js';
import { synthesizePage, refreshPage as refreshKnowledgePage } from '../knowledge-pages/index.js';
import { submitCandidate, reviewCandidate, resolveContradiction as resolveContradictionEngine } from '../promotion/index.js';
import { expandGraphContext, executePattern } from '../ontology-support/index.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from '../jarvis_fusion/truth-kernel/index.js';
import { healthCheck, sourceStatus as buildSourceStatusResult } from './health.js';

export interface FacadeOptions extends SessionRuntimeOptions {
  readonly runtime?: SessionRuntime;
  readonly reviewQueueLimit?: number;
  readonly sourceAdaptersEnabled?: SourceAdapterEnabledMap;
}

export type ManagedFacadeApi = FacadeApi & {
  close(): void;
};

export function createFacade(options: FacadeOptions = {}): ManagedFacadeApi {
  const store = options.store ?? createTruthKernelStorage(options.storePath ?? defaultTruthKernelStoreLocation(), { autoMigrate: true });
  const jcpLiveReader = options.jcpLiveReader ?? createJcpLiveReader();
  const runtime = options.runtime ?? createSessionRuntime({ ...options, store, jcpLiveReader });
  const description: FacadeDescription = {
    name: 'waypath-facade',
    host_shims: ['codex', 'claude-code'],
    verbs: ['session-start', 'recall', 'page', 'promote', 'review', 'review-queue', 'source-status', 'health', 'inspect-page', 'inspect-candidate', 'graph-query', 'resolve-contradiction', 'refresh-page', 'explain'],
    access_layer: 'operator-facing',
    session_runtime: 'local-first',
  };

  return {
    close(): void {
      store.close();
    },
    describe(): FacadeDescription {
      return description;
    },
    sessionStart(input: SessionStartInput): SessionStartResult {
      const sessionId = makeSessionId(input);
      const session = withEvidenceAppendix(
        runtime.buildContextPack(input),
        buildEvidenceQuery(input.project, input.objective, input.activeTask),
        store,
        options.recallWeights,
        jcpLiveReader,
      );
      return {
        operation: 'session-start',
        session_id: sessionId,
        context_pack: {
          ...session,
          session: {
            ...session.session,
            session_id: sessionId,
          },
        },
      };
    },
    recall(query: string): RecallResult {
      const truthBundle = buildTruthDirectBundle(
        query,
        store,
        options.recallWeights ? { weights: options.recallWeights } : undefined,
      );
      const bundle = buildLocalArchiveBundle(
        query,
        store,
        {
          ...(options.recallWeights ? { weights: options.recallWeights } : {}),
          jcpLiveReader,
        },
      );
      if (bundle.items.length > 0) {
        store.upsertEvidenceBundle(bundle);
      }
      return {
        operation: 'recall',
        status: 'ready',
        message: `truth recall returned ${truthBundle.items.length} item(s); archive recall returned ${bundle.items.length} item(s)`,
        bundle,
        truth_bundle: truthBundle,
      };
    },
    page(subject: string): PageResult {
      const page = synthesizePage(store, detectPageInput(store, subject), { jcpLiveReader });
      return {
        operation: 'page',
        status: 'ready',
        message: `page synthesized for ${subject}`,
        page: {
          page: page.page,
          summary_markdown: page.summary_markdown,
        },
      };
    },
    promote(subject: string): PromoteResult {
      const result = submitCandidate(store, { subject });
      return {
        operation: 'promote',
        status: 'ready',
        message: result.message,
        candidate: result.candidate,
      };
    },
    review(candidateId: string, status: 'accepted' | 'pending_review' | 'rejected' | 'needs_more_evidence' | 'superseded', notes?: string): ReviewResult {
      const dbStatus = status === 'pending_review' ? 'pending'
        : status === 'needs_more_evidence' ? 'needs_more_evidence'
        : status;
      const result = reviewCandidate(store, {
        candidate_id: candidateId,
        status: dbStatus as 'pending' | 'accepted' | 'rejected' | 'superseded' | 'needs_more_evidence',
        notes,
      });
      if (!result.success) {
        return {
          operation: 'review',
          status: 'missing',
          message: result.message,
        };
      }

      return {
        operation: 'review',
        status: 'ready',
        message: result.message,
        candidate: result.candidate,
      };
    },
    reviewQueue(): ReviewQueueResult {
      const reviewQueueLimit = options.reviewQueueLimit ?? 25;
      const pendingReview = store
        .listPromotionCandidates(reviewQueueLimit)
        .filter(
          (
            candidate,
          ): candidate is {
            candidate_id: string;
            subject: string;
            status: 'pending_review' | 'needs_more_evidence';
            summary: string;
            created_at: string;
          } => candidate.status === 'pending_review' || candidate.status === 'needs_more_evidence',
        );
      const staleItems = store.listKnowledgePages(reviewQueueLimit, 'stale').map<StaleItem>((page) => ({
        page_id: page.page.page_id,
        page_type: page.page.page_type,
        title: page.page.title,
        status: 'stale',
        updated_at: page.updated_at,
        summary: `${page.page.page_id}: ${page.page.title}`,
      }));
      const contradictionItems = store.listOpenPreferenceContradictions(reviewQueueLimit).map<ContradictionItem>((summary, index) => {
        const match = /^Preference conflict on (.*?): ([^:]+) -> (.+)$/u.exec(summary);
        const scope_ref = match?.[1] ?? 'workspace';
        const key = match?.[2] ?? `conflict_${index + 1}`;
        const values = (match?.[3] ?? '')
          .split(' | ')
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        return {
          contradiction_id: `contradiction:${scope_ref}:${key}:${index + 1}`,
          kind: 'preference_conflict',
          scope_ref,
          key,
          values,
          summary,
          updated_at: new Date().toISOString(),
        };
      });
      return {
        operation: 'review-queue',
        status: 'ready',
        pending_review: pendingReview,
        stale_pages: staleItems.map((item) => ({
          page_id: item.page_id,
          page_type: item.page_type,
          title: item.title,
          status: item.status,
        })),
        open_contradictions: contradictionItems.map((item) => item.summary),
        review_queue_items: pendingReview.map<ReviewQueueItem>((candidate) => ({
          candidate_id: candidate.candidate_id,
          status: candidate.status,
          subject: candidate.subject,
          summary: candidate.summary,
          created_at: candidate.created_at,
        })),
        stale_items: staleItems,
        contradiction_items: contradictionItems,
      };
    },
    sourceStatus(): LocalSourceStatusResult {
      return buildSourceStatusResult({
        sourceAdaptersEnabled: options.sourceAdaptersEnabled,
        jcpLiveReader,
      });
    },
    health(): WaypathHealthResult {
      return healthCheck(store, {
        sourceAdaptersEnabled: options.sourceAdaptersEnabled,
        jcpLiveReader,
      });
    },
    inspectPage(pageId: string): InspectPageResult {
      const page = store.getKnowledgePage(pageId);
      if (!page) {
        return {
          operation: 'inspect-page',
          status: 'missing',
          message: `Knowledge page not found: ${pageId}`,
        };
      }
      return {
        operation: 'inspect-page',
        status: 'ready',
        message: `Loaded knowledge page ${pageId}`,
        page,
      };
    },
    inspectCandidate(candidateId: string): InspectCandidateResult {
      const candidate = store.getPromotionCandidate(candidateId);
      if (!candidate) {
        return {
          operation: 'inspect-candidate',
          status: 'missing',
          message: `Promotion candidate not found: ${candidateId}`,
        };
      }
      return {
        operation: 'inspect-candidate',
        status: 'ready',
        message: `Loaded promotion candidate ${candidateId}`,
        candidate,
      };
    },
    resolveContradiction(key: string, keepPreferenceId: string, scopeRef?: string, notes?: string) {
      const result = resolveContradictionEngine(store, {
        key,
        scope_ref: scopeRef ?? null,
        keep_preference_id: keepPreferenceId,
        resolution_notes: notes ?? null,
      });
      const resolvedCount = result.side_effects.filter((e) => e.kind === 'truth_superseded').length;
      return {
        operation: 'resolve-contradiction' as const,
        status: 'ready' as const,
        message: result.message,
        kept_preference_id: keepPreferenceId,
        resolved_count: resolvedCount,
      };
    },
    refreshPage(pageId: string) {
      const result = refreshKnowledgePage(store, pageId, { jcpLiveReader });
      return {
        operation: 'refresh-page' as const,
        status: (result.refreshed ? 'ready' : 'missing') as 'ready' | 'missing',
        message: result.refreshed
          ? `Page ${pageId} refreshed: ${result.previous_status} → ${result.new_status}`
          : `Page ${pageId} not found`,
        page_id: pageId,
        previous_status: result.previous_status,
        new_status: result.new_status,
      };
    },
    explain(query: string): ExplainResult {
      const truthResults = queryTruthDirect(query, { store });
      const archiveResults = searchTruthKernel(query, {
        store,
        ...(options.recallWeights ? { recallWeights: options.recallWeights } : {}),
      });
      return {
        operation: 'explain',
        status: 'ready',
        query,
        truth_results: truthResults.map((r) => toExplainItem(r, store, true)),
        archive_results: archiveResults.map((r) => toExplainItem(r, store, false)),
      };
    },
    graphQuery(entityId: string, pattern?: GraphTraversalPattern): GraphQueryResult {
      const result = pattern
        ? executePattern(store, { pattern, seed_entity_id: entityId })
        : expandGraphContext(store, [entityId], { maxDepth: 2, maxResults: 20 });

      return {
        operation: 'graph-query',
        status: 'ready',
        message: `Graph expansion from ${entityId}${pattern ? ` (pattern: ${pattern})` : ''}`,
        result: {
          seed_entities: [...result.seed_entities],
          expanded_entities: result.expanded_entities.map((e) => ({
            entity_id: e.entity_id,
            name: e.name,
            entity_type: e.entity_type,
            status: e.status,
            summary: e.summary,
            state_json: e.state_json,
            canonical_page_id: e.canonical_page_id,
            created_at: e.created_at,
            updated_at: e.updated_at,
          })),
          expanded_relationships: result.expanded_relationships.map((r) => ({
            relationship_id: r.relationship_id,
            from_entity_id: r.from_entity_id,
            relation_type: r.relation_type,
            to_entity_id: r.to_entity_id,
            weight: r.weight,
            status: r.status,
            created_at: r.created_at,
            updated_at: r.updated_at,
          })),
          traversal_paths: result.traversal_paths.map((p) => ({
            seed_entity_id: p.seed_entity_id,
            steps: [...p.steps],
            terminal_entity_ids: [...p.terminal_entity_ids],
          })),
          related_decisions: result.related_decisions.map((d) => ({
            decision_id: d.decision_id,
            title: d.title,
            statement: d.statement,
            status: d.status,
            scope_entity_id: d.scope_entity_id,
            effective_at: d.effective_at,
            superseded_by: d.superseded_by,
            provenance_id: d.provenance_id,
            created_at: d.created_at,
            updated_at: d.updated_at,
          })),
        },
      };
    },
  };
}

function toExplainItem(
  result: ScoredResult,
  store: ReturnType<typeof createTruthKernelStorage>,
  isTruth: boolean,
): ExplainResultItem {
  const { candidate, score, breakdown } = result;

  // Look up provenance_id from the original record based on source_type
  let provenanceId: string | null = null;
  if (candidate.source_type === 'decision') {
    provenanceId = store.getDecision(candidate.id)?.provenance_id ?? null;
  } else if (candidate.source_type === 'memory') {
    provenanceId = store.getPromotedMemory(candidate.id)?.provenance_id ?? null;
  }

  let provenanceChain: ExplainResultItem['provenance_chain'] = null;
  if (provenanceId) {
    const prov = store.getProvenance(provenanceId);
    if (prov) {
      provenanceChain = [{
        provenance_id: provenanceId,
        source_ref: prov.source_ref,
        promoted_at: prov.promoted_at ?? null,
        promoted_by: prov.promoted_by ?? null,
        confidence: prov.confidence ?? null,
      }];
    }
  }

  return {
    id: candidate.id,
    title: candidate.title,
    source_system: candidate.source_system,
    source_kind: candidate.source_kind,
    score_breakdown: {
      keyword: breakdown.keyword,
      graph: breakdown.graph,
      provenance: breakdown.provenance,
      lexical: breakdown.lexical,
      total: isTruth ? score : breakdown.rrf_fused,
    },
    provenance_chain: provenanceChain,
    graph_path: null,
  };
}

function detectPageInput(
  store: ReturnType<typeof createTruthKernelStorage>,
  subject: string,
): {
  page_type: 'session_brief' | 'project_page' | 'entity_page' | 'decision_page';
  project?: string;
  subject: string;
  anchor_entity_id?: string;
  anchor_decision_id?: string;
} {
  const normalizedSubject = subject.trim();

  if (normalizedSubject.startsWith('project:')) {
    return {
      page_type: 'project_page',
      project: normalizedSubject.slice('project:'.length),
      subject: normalizedSubject,
      anchor_entity_id: normalizedSubject,
    };
  }

  if (normalizedSubject.startsWith('decision:')) {
    return {
      page_type: 'decision_page',
      subject: normalizedSubject,
      anchor_decision_id: normalizedSubject,
    };
  }

  if (store.getEntity(normalizedSubject) || /^[a-z][a-z0-9_-]*:/iu.test(normalizedSubject)) {
    return {
      page_type: 'entity_page',
      subject: normalizedSubject,
      anchor_entity_id: normalizedSubject,
    };
  }

  return {
    page_type: 'session_brief',
    project: normalizedSubject,
    subject: normalizedSubject,
  };
}

function buildEvidenceQuery(
  project?: string,
  objective?: string,
  activeTask?: string,
): string {
  return [project, objective, activeTask]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(' ');
}

/**
 * Append archive evidence as a supplementary appendix.
 * Truth highlights stay in the main context pack; archive evidence is attached only
 * when live archive providers returned bundle items.
 */
function withEvidenceAppendix(
  pack: SessionStartResult['context_pack'],
  query: string,
  store: ReturnType<typeof createTruthKernelStorage>,
  recallWeights?: RecallWeightOverrides,
  jcpLiveReader?: ReturnType<typeof createJcpLiveReader>,
): SessionStartResult['context_pack'] {
  if (!query.trim()) return pack;

  const evidenceBundle = buildLocalArchiveBundle(
    query,
    store,
    {
      ...(recallWeights ? { weights: recallWeights } : {}),
      jcpLiveReader,
    },
  );

  // Only persist and attach if the bundle has items beyond what truth highlights already cover
  if (evidenceBundle.items.length === 0) return pack;

  store.upsertEvidenceBundle(evidenceBundle);
  return {
    ...pack,
    evidence_appendix: {
      enabled: true,
      bundles: [evidenceBundle.bundle_id],
    },
  };
}

function makeSessionId(input: SessionStartInput): string {
  const project = input.project?.trim() || 'waypath';
  const activeTask = input.activeTask?.trim() || 'codex-host-shim-skeleton';
  return `${project}:${activeTask}`;
}
