import {
  type ContradictionItem,
  type FacadeApi,
  type FacadeDescription,
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
import { synthesizeSessionPage } from '../jarvis_fusion/page-service.js';
import { reviewPromotionCandidate, submitPromotionCandidate } from '../jarvis_fusion/promotion-service.js';
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
    verbs: ['session-start', 'recall', 'page', 'promote', 'review', 'review-queue', 'inspect-page', 'inspect-candidate'],
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
      const session = withEvidenceAppendix(
        runtime.buildContextPack({ project: subject }),
        buildEvidenceQuery(subject),
        store,
        options.recallWeights,
      );
      const page = synthesizeSessionPage(session, store);
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
      const candidate = submitPromotionCandidate(subject, store);
      return {
        operation: 'promote',
        status: 'ready',
        message: candidate.summary,
        candidate,
      };
    },
    review(candidateId: string, status: 'accepted' | 'pending_review' | 'rejected' | 'needs_more_evidence' | 'superseded', notes?: string): ReviewResult {
      const candidate = reviewPromotionCandidate(candidateId, status, notes, store);
      if (!candidate) {
        return {
          operation: 'review',
          status: 'missing',
          message: `Promotion candidate not found: ${candidateId}`,
        };
      }

      return {
        operation: 'review',
        status: 'ready',
        message: candidate.summary,
        candidate,
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
