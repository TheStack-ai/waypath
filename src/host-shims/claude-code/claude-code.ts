import {
  type ClaudeCodeBootstrapInput,
  type ClaudeCodeBootstrapResult,
  type FacadeApi,
} from '../../contracts';
import { createFacade } from '../../facade';
import { defaultTruthKernelStoreLocation } from '../../jarvis_fusion/truth-kernel/index.js';

export interface ClaudeCodeHostShimOptions {
  readonly facade?: FacadeApi;
}

export function createClaudeCodeHostShim(options: ClaudeCodeHostShimOptions = {}) {
  return {
    host: 'claude-code' as const,
    bootstrap(input: ClaudeCodeBootstrapInput = {}): ClaudeCodeBootstrapResult {
      const storePath = input.storePath ?? defaultTruthKernelStoreLocation();
      const ownedFacade = options.facade ? null : createFacade({ storePath, autoSeed: true });
      const facade = (options.facade ?? ownedFacade)!;
      try {
        const session = facade.sessionStart({
          project: input.project,
          objective: input.objective,
          activeTask: input.activeTask ?? 'claude-code-host-shim-skeleton',
          seedEntities: input.seedEntities,
        });

        return {
          host: 'claude-code',
          status: 'bootstrapped',
          entry_point: 'src/host-shims/claude-code',
          command: 'claude-code',
          session_id: input.sessionId ?? session.session_id,
          facade: facade.describe(),
          session: {
            ...session,
            session_id: input.sessionId ?? session.session_id,
            context_pack: {
              ...session.context_pack,
              session: {
                ...session.context_pack.session,
                session_id: input.sessionId ?? session.session_id,
              },
            },
          },
          store_path: storePath,
        };
      } finally {
        ownedFacade?.close();
      }
    },
  };
}
