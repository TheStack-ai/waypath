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
import { createSessionRuntime } from '../session-runtime';

function makeStubResult(operation: 'recall' | 'page' | 'promote', message: string): RecallResult | PageResult | PromoteResult {
  return {
    operation,
    status: 'stub',
    message,
  };
}

export function createFacade(runtime: SessionRuntime = createSessionRuntime()): FacadeApi {
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
      return makeStubResult('recall', `recall routing is not yet wired for query: ${query}`) as RecallResult;
    },
    page(subject: string): PageResult {
      return makeStubResult('page', `page synthesis is not yet wired for subject: ${subject}`) as PageResult;
    },
    promote(subject: string): PromoteResult {
      return makeStubResult('promote', `promotion workflow is not yet wired for subject: ${subject}`) as PromoteResult;
    },
  };
}

function makeSessionId(input: SessionStartInput): string {
  const project = input.project?.trim() || 'jarvis-fusion-system';
  const activeTask = input.activeTask?.trim() || 'codex-host-shim-skeleton';
  return `${project}:${activeTask}`;
}
