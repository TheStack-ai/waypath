import {
  type CodexBootstrapInput,
  type CodexBootstrapResult,
  type FacadeApi,
} from '../../contracts';
import { createFacade } from '../../facade';

export function createCodexHostShim(facade: FacadeApi = createFacade()) {
  return {
    host: 'codex' as const,
    bootstrap(input: CodexBootstrapInput = {}): CodexBootstrapResult {
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
        },
      };
    },
  };
}
