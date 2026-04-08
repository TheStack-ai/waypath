import {
  type SessionContextPack,
  type SessionRuntime,
  type SessionStartInput,
} from '../contracts';

const DEFAULT_FOCUS = {
  project: 'jarvis-fusion-system',
  objective: 'bootstrap local-first runtime',
  activeTask: 'codex-host-shim-skeleton',
} as const;

function normalizeList(values: readonly string[] | undefined): string[] {
  return values ? [...values] : [];
}

export function createSessionRuntime(): SessionRuntime {
  return {
    buildContextPack(input: SessionStartInput): SessionContextPack {
      const project = input.project?.trim() || DEFAULT_FOCUS.project;
      const objective = input.objective?.trim() || DEFAULT_FOCUS.objective;
      const activeTask = input.activeTask?.trim() || DEFAULT_FOCUS.activeTask;
      const seedEntities = normalizeList(input.seedEntities);

      return {
        current_focus: {
          project,
          objective,
          activeTask,
        },
        truth_highlights: {
          decisions: [],
          preferences: [],
          entities: seedEntities,
          promoted_memories: [],
        },
        graph_context: {
          seed_entities: seedEntities,
          related_entities: [],
          relationships: [],
        },
        recent_changes: {
          recent_promotions: [],
          superseded: [],
          open_contradictions: [],
        },
        evidence_appendix: {
          enabled: true,
          bundles: [],
        },
      };
    },
  };
}
