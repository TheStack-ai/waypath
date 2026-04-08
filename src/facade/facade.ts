import {
  type FacadeApi,
  type FacadeDescription,
  type PageResult,
  type PromoteResult,
  type RecallResult,
  type SessionRuntime,
  type SessionStartInput,
  type SessionStartResult,
} from '../contracts';
import { createSessionRuntime, type SessionRuntimeOptions } from '../session-runtime';
import { buildLocalArchiveBundle } from '../jarvis_fusion/archive-provider.js';
import { synthesizeSessionPage } from '../jarvis_fusion/page-service.js';
import { submitPromotionCandidate } from '../jarvis_fusion/promotion-service.js';
import { createTruthKernelStorage, defaultTruthKernelStoreLocation } from '../jarvis_fusion/truth-kernel/index.js';

export interface FacadeOptions extends SessionRuntimeOptions {
  readonly runtime?: SessionRuntime;
}

export function createFacade(options: FacadeOptions = {}): FacadeApi {
  const store = options.store ?? createTruthKernelStorage(options.storePath ?? defaultTruthKernelStoreLocation(), { autoMigrate: true });
  const runtime = options.runtime ?? createSessionRuntime({ ...options, store });
  const description: FacadeDescription = {
    name: 'jarvis-fusion-facade',
    host_shims: ['codex'],
    verbs: ['session-start', 'recall', 'page', 'promote'],
    access_layer: 'operator-facing',
    session_runtime: 'local-first',
  };

  return {
    describe(): FacadeDescription {
      return description;
    },
    sessionStart(input: SessionStartInput): SessionStartResult {
      return {
        operation: 'session-start',
        session_id: makeSessionId(input),
        context_pack: runtime.buildContextPack(input),
      };
    },
    recall(query: string): RecallResult {
      const bundle = buildLocalArchiveBundle(query);
      return {
        operation: 'recall',
        status: 'ready',
        message: `archive recall prepared for ${query}`,
        bundle,
      };
    },
    page(subject: string): PageResult {
      const session = runtime.buildContextPack({ project: subject });
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
  };
}

function makeSessionId(input: SessionStartInput): string {
  const project = input.project?.trim() || 'jarvis-fusion-system';
  const activeTask = input.activeTask?.trim() || 'codex-host-shim-skeleton';
  return `${project}:${activeTask}`;
}
