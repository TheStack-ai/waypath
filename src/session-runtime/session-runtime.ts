import {
  type SessionContextPack,
  type SessionRuntime,
  type SessionStartInput,
} from '../contracts';
import {
  createTruthKernelStorage,
  defaultTruthKernelStoreLocation,
  ensureTruthKernelSeedData,
  loadSessionStartSnapshot,
  type SqliteTruthKernelStorage,
} from '../jarvis_fusion/truth-kernel/index.js';

const DEFAULT_FOCUS = {
  project: 'jarvis-fusion-system',
  objective: 'bootstrap local-first runtime',
  activeTask: 'codex-host-shim-skeleton',
} as const;

export interface SessionRuntimeOptions {
  readonly storePath?: string;
  readonly store?: SqliteTruthKernelStorage;
  readonly autoSeed?: boolean;
}

function normalizeList(values: readonly string[] | undefined): string[] {
  return values ? [...values] : [];
}

export function createSessionRuntime(options: SessionRuntimeOptions = {}): SessionRuntime {
  const store = options.store ?? createTruthKernelStorage(options.storePath ?? defaultTruthKernelStoreLocation());

  return {
    buildContextPack(input: SessionStartInput): SessionContextPack {
      const project = input.project?.trim() || DEFAULT_FOCUS.project;
      const objective = input.objective?.trim() || DEFAULT_FOCUS.objective;
      const activeTask = input.activeTask?.trim() || DEFAULT_FOCUS.activeTask;
      const projectEntityId = `project:${project}`;
      const seedEntities = normalizeList(input.seedEntities);

      if (options.autoSeed ?? true) {
        ensureTruthKernelSeedData(store, { project, objective, activeTask });
      }

      const snapshot = loadSessionStartSnapshot(store, { projectEntityId });
      const relatedEntityIds = snapshot.entities.map((entity) => entity.entity_id);
      const relatedEntityNames = snapshot.entities.map((entity) => entity.name);

      return {
        current_focus: {
          project,
          objective,
          activeTask,
        },
        truth_highlights: {
          decisions: snapshot.decisions.map((decision) => decision.title),
          preferences: snapshot.preferences.map((preference) => `${preference.key}=${preference.value}`),
          entities: relatedEntityNames,
          promoted_memories: snapshot.promotedMemories.map((memory) => memory.summary),
        },
        graph_context: {
          seed_entities: seedEntities.length > 0 ? seedEntities : relatedEntityIds,
          related_entities: relatedEntityIds,
          relationships: snapshot.decisions.map((decision) => `${projectEntityId}:decision:${decision.decision_id}`),
        },
        recent_changes: {
          recent_promotions: snapshot.promotedMemories.map((memory) => memory.memory_id),
          superseded: snapshot.decisions
            .filter((decision) => decision.superseded_by !== null)
            .map((decision) => decision.decision_id),
          open_contradictions: [],
        },
        evidence_appendix: {
          enabled: false,
          bundles: [],
        },
      };
    },
  };
}
