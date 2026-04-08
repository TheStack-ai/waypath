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
import { buildLocalArchiveBundle, createLocalArchiveProvider } from '../jarvis_fusion/archive-provider.js';
import { synthesizeSessionPage } from '../jarvis_fusion/page-service.js';
import { submitPromotionCandidate } from '../jarvis_fusion/promotion-service.js';

export interface FacadeOptions extends SessionRuntimeOptions {
  readonly runtime?: SessionRuntime;
}

export function createFacade(options: FacadeOptions = {}): FacadeApi {
  const runtime = options.runtime ?? createSessionRuntime(options);
  const archiveProvider = createLocalArchiveProvider();
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
      } as unknown as RecallResult;
    },
    page(subject: string): PageResult {
      const session = runtime.buildContextPack({ project: subject });
      const page = synthesizeSessionPage(session);
      return {
        operation: 'page',
        status: 'ready',
        message: `page synthesized for ${subject}`,
        page,
      } as unknown as PageResult;
    },
    promote(subject: string): PromoteResult {
      const candidate = submitPromotionCandidate(subject);
      return {
        operation: 'promote',
        status: 'ready',
        message: candidate.summary,
        candidate,
      } as unknown as PromoteResult;
    },
  };
}

function makeSessionId(input: SessionStartInput): string {
  const project = input.project?.trim() || 'jarvis-fusion-system';
  const activeTask = input.activeTask?.trim() || 'codex-host-shim-skeleton';
  return `${project}:${activeTask}`;
}
