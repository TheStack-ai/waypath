import {
  type CodexBootstrapInput,
  type CodexBootstrapResult,
  type FacadeApi,
} from '../../contracts';
import { createFacade } from '../../facade';
import { defaultTruthKernelStoreLocation } from '../../jarvis_fusion/truth-kernel/index.js';

export interface CodexHostShimOptions {
  readonly facade?: FacadeApi;
}

export function createCodexHostShim(options: CodexHostShimOptions = {}) {
  return {
    host: 'codex' as const,
    bootstrap(input: CodexBootstrapInput = {}): CodexBootstrapResult {
      const storePath = input.storePath ?? defaultTruthKernelStoreLocation();
      const ownedFacade = options.facade ? null : createFacade({ storePath, autoSeed: true });
      const facade = (options.facade ?? ownedFacade)!;
      try {
        const session = facade.sessionStart({
          project: input.project,
          objective: input.objective,
          activeTask: input.activeTask ?? 'codex-host-shim-skeleton',
          seedEntities: input.seedEntities,
        });

        return {
          host: 'codex',
          status: 'bootstrapped',
          entry_point: 'src/host-shims/codex',
          command: 'codex',
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
