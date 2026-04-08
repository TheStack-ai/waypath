import {
  type FacadeApi,
  type FacadeDescription,
  type InspectCandidateResult,
  type InspectPageResult,
  type PageResult,
  type PromoteResult,
  type ReviewQueueResult,
  type ReviewResult,
  type RecallResult,
  type SessionRuntime,
  type SessionStartInput,
  type SessionStartResult,
} from '../contracts';
import { createSessionRuntime, type SessionRuntimeOptions } from '../session-runtime';
import { buildLocalArchiveBundle } from '../jarvis_fusion/archive-provider.js';
import { synthesizeSessionPage } from '../jarvis_fusion/page-service.js';
import { reviewPromotionCandidate, submitPromotionCandidate } from '../jarvis_fusion/promotion-service.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from '../jarvis_fusion/truth-kernel/index.js';

export interface FacadeOptions extends SessionRuntimeOptions {
  readonly runtime?: SessionRuntime;
}

export type ManagedFacadeApi = FacadeApi & {
  close(): void;
};

export function createFacade(options: FacadeOptions = {}): ManagedFacadeApi {
  const store = options.store ?? createTruthKernelStorage(options.storePath ?? defaultTruthKernelStoreLocation(), { autoMigrate: true });
  const runtime = options.runtime ?? createSessionRuntime({ ...options, store });
  const description: FacadeDescription = {
    name: 'jarvis-fusion-facade',
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
      const session = withEvidenceAppendix(
        runtime.buildContextPack(input),
        buildEvidenceQuery(input.project, input.objective, input.activeTask),
        store,
      );
      return {
        operation: 'session-start',
        session_id: makeSessionId(input),
        context_pack: session,
      };
    },
    recall(query: string): RecallResult {
      const bundle = buildLocalArchiveBundle(query, store);
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
      return {
        operation: 'review-queue',
        status: 'ready',
        pending_review: store
          .listPromotionCandidates(25)
          .filter((candidate) => candidate.status === 'pending_review' || candidate.status === 'needs_more_evidence'),
        stale_pages: store.listKnowledgePages(25, 'stale').map((page) => page.page),
        open_contradictions: [...store.listOpenPreferenceContradictions(25)],
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
): SessionStartResult['context_pack'] {
  const evidenceBundle = buildLocalArchiveBundle(query, store);
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
  const project = input.project?.trim() || 'jarvis-fusion-system';
  const activeTask = input.activeTask?.trim() || 'codex-host-shim-skeleton';
  return `${project}:${activeTask}`;
}
