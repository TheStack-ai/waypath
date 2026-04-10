import {
  type ContradictionItem,
  type FacadeApi,
  type FacadeDescription,
  type GraphQueryResult,
  type GraphTraversalPattern,
  type InspectCandidateResult,
  type InspectPageResult,
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
  type StaleItem,
} from '../contracts';
import { createSessionRuntime, type SessionRuntimeOptions } from '../session-runtime';
import { buildLocalArchiveBundle } from '../jarvis_fusion/archive-provider.js';
import { synthesizePage } from '../knowledge-pages/index.js';
import { submitCandidate, reviewCandidate } from '../promotion/index.js';
import { expandGraphContext, executePattern } from '../ontology-support/index.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from '../jarvis_fusion/truth-kernel/index.js';

export interface FacadeOptions extends SessionRuntimeOptions {
  readonly runtime?: SessionRuntime;
  readonly reviewQueueLimit?: number;
}

export type ManagedFacadeApi = FacadeApi & {
  close(): void;
};

export function createFacade(options: FacadeOptions = {}): ManagedFacadeApi {
  const store = options.store ?? createTruthKernelStorage(options.storePath ?? defaultTruthKernelStoreLocation(), { autoMigrate: true });
  const runtime = options.runtime ?? createSessionRuntime({ ...options, store });
  const description: FacadeDescription = {
    name: 'waypath-facade',
    host_shims: ['codex'],
    verbs: ['session-start', 'recall', 'page', 'promote', 'review', 'review-queue', 'inspect-page', 'inspect-candidate', 'graph-query'],
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
      const bundle = buildLocalArchiveBundle(
        query,
        store,
        options.recallWeights ? { weights: options.recallWeights } : undefined,
      );
      store.upsertEvidenceBundle(bundle);
      return {
        operation: 'recall',
        status: 'ready',
        message: `archive recall prepared for ${query}`,
        bundle,
      };
    },
    page(subject: string): PageResult {
      const page = synthesizePage(store, {
        page_type: 'session_brief',
        project: subject,
        subject,
      });
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

function buildEvidenceQuery(
  project?: string,
  objective?: string,
  activeTask?: string,
): string {
  return [project, objective, activeTask]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(' ');
}

function withEvidenceAppendix(
  pack: SessionStartResult['context_pack'],
  query: string,
  store: ReturnType<typeof createTruthKernelStorage>,
  recallWeights?: RecallWeightOverrides,
): SessionStartResult['context_pack'] {
  const evidenceBundle = buildLocalArchiveBundle(
    query,
    store,
    recallWeights ? { weights: recallWeights } : undefined,
  );
  store.upsertEvidenceBundle(evidenceBundle);
  return evidenceBundle.items.length > 0
    ? {
        ...pack,
        evidence_appendix: {
          enabled: true,
          bundles: [evidenceBundle.bundle_id],
        },
      }
    : pack;
}

function makeSessionId(input: SessionStartInput): string {
  const project = input.project?.trim() || 'waypath';
  const activeTask = input.activeTask?.trim() || 'codex-host-shim-skeleton';
  return `${project}:${activeTask}`;
}
