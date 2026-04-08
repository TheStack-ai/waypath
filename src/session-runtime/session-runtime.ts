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
  type SessionStartSnapshot,
  type SqliteTruthKernelStorage,
} from '../jarvis_fusion/truth-kernel/index.js';
import type {
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from '../jarvis_fusion/contracts.js';

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

interface GraphRelationshipRow {
  readonly relationship_id: string;
  readonly from_entity_id: string;
  readonly relation_type: string;
  readonly to_entity_id: string;
  readonly weight: number | null;
}

function dedupeBy<T>(values: readonly T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(value);
  }
  return deduped;
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
  }
  return deduped;
}

function buildInClause(prefix: string, values: readonly string[]): {
  readonly sql: string;
  readonly params: Readonly<Record<string, unknown>>;
} {
  const params: Record<string, unknown> = {};
  const placeholders = values.map((value, index) => {
    const key = `${prefix}_${index}`;
    params[key] = value;
    return `:${key}`;
  });
  return {
    sql: placeholders.join(', '),
    params,
  };
}

function listProjectScopedEntities(
  store: SqliteTruthKernelStorage,
  projectEntityId: string,
): readonly TruthEntityRecord[] {
  return store.all<TruthEntityRecord>(
    `SELECT * FROM entities
      WHERE status = 'active'
        AND (entity_id = :project_entity_id OR entity_id LIKE :project_prefix)
      ORDER BY updated_at DESC
      LIMIT 10`,
    {
      project_entity_id: projectEntityId,
      project_prefix: `${projectEntityId}:%`,
    },
  );
}

function listProjectScopedDecisions(
  store: SqliteTruthKernelStorage,
  projectEntityId: string,
): readonly TruthDecisionRecord[] {
  return store.all<TruthDecisionRecord>(
    `SELECT * FROM decisions
      WHERE status = 'active'
        AND (
          scope_entity_id IS NULL
          OR scope_entity_id = :project_entity_id
          OR scope_entity_id LIKE :project_prefix
        )
      ORDER BY updated_at DESC
      LIMIT 10`,
    {
      project_entity_id: projectEntityId,
      project_prefix: `${projectEntityId}:%`,
    },
  );
}

function listProjectScopedPreferences(
  store: SqliteTruthKernelStorage,
  projectEntityId: string,
): readonly TruthPreferenceRecord[] {
  return store.all<TruthPreferenceRecord>(
    `SELECT * FROM preferences
      WHERE status = 'active'
        AND (
          subject_ref IS NULL
          OR subject_ref = :project_entity_id
          OR subject_ref LIKE :project_prefix
        )
      ORDER BY updated_at DESC
      LIMIT 10`,
    {
      project_entity_id: projectEntityId,
      project_prefix: `${projectEntityId}:%`,
    },
  );
}

function listProjectScopedPromotedMemories(
  store: SqliteTruthKernelStorage,
  projectEntityId: string,
): readonly TruthPromotedMemoryRecord[] {
  return store.all<TruthPromotedMemoryRecord>(
    `SELECT * FROM promoted_memories
      WHERE status = 'active'
        AND (
          subject_entity_id IS NULL
          OR subject_entity_id = :project_entity_id
          OR subject_entity_id LIKE :project_prefix
        )
      ORDER BY updated_at DESC
      LIMIT 10`,
    {
      project_entity_id: projectEntityId,
      project_prefix: `${projectEntityId}:%`,
    },
  );
}

function listConnectedRelationships(
  store: SqliteTruthKernelStorage,
  entityIds: readonly string[],
): readonly GraphRelationshipRow[] {
  if (entityIds.length === 0) return [];
  const clause = buildInClause('entity_id', entityIds);

  try {
    return store.all<GraphRelationshipRow>(
      `SELECT relationship_id, from_entity_id, relation_type, to_entity_id, weight
        FROM relationships
        WHERE status = 'active'
          AND (
            from_entity_id IN (${clause.sql})
            OR to_entity_id IN (${clause.sql})
          )
        ORDER BY updated_at DESC
        LIMIT 12`,
      clause.params,
    );
  } catch {
    return [];
  }
}

function loadReferencedEntities(
  store: SqliteTruthKernelStorage,
  entityIds: readonly string[],
): readonly TruthEntityRecord[] {
  return entityIds
    .map((entityId) => store.getEntity(entityId))
    .filter((entity): entity is TruthEntityRecord => Boolean(entity));
}

function buildEntityLabel(
  entityId: string,
  entitiesById: ReadonlyMap<string, TruthEntityRecord>,
): string {
  const entity = entitiesById.get(entityId);
  return entity ? `${entity.name} (${entity.entity_id})` : entityId;
}

function formatGraphRelationships(
  decisions: readonly TruthDecisionRecord[],
  preferences: readonly TruthPreferenceRecord[],
  promotedMemories: readonly TruthPromotedMemoryRecord[],
  persistedRelationships: readonly GraphRelationshipRow[],
  entitiesById: ReadonlyMap<string, TruthEntityRecord>,
): string[] {
  const relationshipSummaries = [
    ...persistedRelationships.map((relationship) => {
      const from = buildEntityLabel(relationship.from_entity_id, entitiesById);
      const to = buildEntityLabel(relationship.to_entity_id, entitiesById);
      return `${from} -[${relationship.relation_type}]-> ${to}`;
    }),
    ...decisions
      .filter((decision) => decision.scope_entity_id !== null)
      .map(
        (decision) =>
          `Decision "${decision.title}" scoped to ${buildEntityLabel(decision.scope_entity_id!, entitiesById)}`,
      ),
    ...preferences
      .filter((preference) => preference.subject_ref !== null)
      .map(
        (preference) =>
          `Preference "${preference.key}=${preference.value}" applies to ${buildEntityLabel(preference.subject_ref!, entitiesById)}`,
      ),
    ...promotedMemories
      .filter((memory) => memory.subject_entity_id !== null)
      .map(
        (memory) =>
          `Memory "${memory.summary}" linked to ${buildEntityLabel(memory.subject_entity_id!, entitiesById)}`,
      ),
  ];

  return uniqueStrings(relationshipSummaries);
}

function expandSnapshot(
  store: SqliteTruthKernelStorage,
  snapshot: SessionStartSnapshot,
  projectEntityId: string,
) {
  const scopedEntities = listProjectScopedEntities(store, projectEntityId);
  const decisions = dedupeBy(
    [...snapshot.decisions, ...listProjectScopedDecisions(store, projectEntityId)],
    (decision) => decision.decision_id,
  );
  const preferences = dedupeBy(
    [...snapshot.preferences, ...listProjectScopedPreferences(store, projectEntityId)],
    (preference) => preference.preference_id,
  );
  const promotedMemories = dedupeBy(
    [...snapshot.promotedMemories, ...listProjectScopedPromotedMemories(store, projectEntityId)],
    (memory) => memory.memory_id,
  );

  const referencedEntityIds = uniqueStrings([
    projectEntityId,
    ...scopedEntities.map((entity) => entity.entity_id),
    ...decisions.map((decision) => decision.scope_entity_id),
    ...preferences.map((preference) => preference.subject_ref),
    ...promotedMemories.map((memory) => memory.subject_entity_id),
  ]);
  const persistedRelationships = listConnectedRelationships(store, referencedEntityIds);
  const relationshipEntityIds = uniqueStrings(
    persistedRelationships.flatMap((relationship) => [
      relationship.from_entity_id,
      relationship.to_entity_id,
    ]),
  );
  const entities = dedupeBy(
    [...snapshot.entities, ...scopedEntities, ...loadReferencedEntities(store, relationshipEntityIds)],
    (entity) => entity.entity_id,
  );

  return {
    entities,
    decisions,
    preferences,
    promotedMemories,
    persistedRelationships,
  };
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
      const expanded = expandSnapshot(store, snapshot, projectEntityId);
      const entitiesById = new Map(
        expanded.entities.map((entity) => [entity.entity_id, entity] as const),
      );
      const relatedEntityIds = uniqueStrings([
        ...seedEntities,
        ...expanded.entities.map((entity) => entity.entity_id),
        ...expanded.persistedRelationships.flatMap((relationship) => [
          relationship.from_entity_id,
          relationship.to_entity_id,
        ]),
      ]);
      const relatedEntityNames = expanded.entities.map((entity) => entity.name);
      const graphRelationships = formatGraphRelationships(
        expanded.decisions,
        expanded.preferences,
        expanded.promotedMemories,
        expanded.persistedRelationships,
        entitiesById,
      );

      return {
        current_focus: {
          project,
          objective,
          activeTask,
        },
        truth_highlights: {
          decisions: expanded.decisions.map((decision) => decision.title),
          preferences: expanded.preferences.map((preference) => `${preference.key}=${preference.value}`),
          entities: relatedEntityNames,
          promoted_memories: expanded.promotedMemories.map((memory) => memory.summary),
        },
        graph_context: {
          seed_entities:
            seedEntities.length > 0
              ? seedEntities
              : uniqueStrings([projectEntityId, ...expanded.entities.map((entity) => entity.entity_id)]),
          related_entities: relatedEntityIds,
          relationships: graphRelationships,
        },
        recent_changes: {
          recent_promotions: expanded.promotedMemories.map((memory) => memory.memory_id),
          superseded: expanded.decisions
            .filter((decision) => decision.superseded_by !== null)
            .map((decision) => decision.decision_id),
          open_contradictions: [],
        },
        evidence_appendix: {
          enabled: false,
          bundles: [],
        },
        related_pages: [
          {
            page_id: `page:session:${project}`,
            page_type: 'session_brief',
            title: `${project} session brief`,
            status: 'canonical',
          },
        ],
      };
    },
  };
}
