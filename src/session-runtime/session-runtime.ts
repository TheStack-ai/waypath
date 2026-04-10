import {
  type ContradictionItem,
  type RecallWeightOverrides,
  type ReviewQueueItem,
  type SessionContextPack,
  type SessionRuntime,
  type SessionStartInput,
  type StaleItem,
} from '../contracts';
import {
  createTruthKernelStorage,
  defaultTruthKernelStoreLocation,
  ensureTruthKernelSeedData,
  loadSessionStartSnapshot,
  type SessionStartSnapshot,
  type SqliteTruthKernelStorage,
} from '../jarvis_fusion/truth-kernel/index.js';
import { createRetrievalStrategy } from '../archive-kernel/retrieval/index.js';
import { expandGraphContext } from '../ontology-support/index.js';
import type {
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from '../jarvis_fusion/contracts.js';

const DEFAULT_FOCUS = {
  project: 'waypath',
  objective: 'bootstrap local-first runtime',
  activeTask: 'codex-host-shim-skeleton',
} as const;

export interface SessionRuntimeOptions {
  readonly storePath?: string;
  readonly store?: SqliteTruthKernelStorage;
  readonly autoSeed?: boolean;
  readonly recallWeights?: RecallWeightOverrides;
  readonly reviewQueueLimit?: number;
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

interface ScoredValue<T> {
  readonly value: T;
  readonly score: number;
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

function relationshipTypeWeight(relationType: string): number {
  switch (relationType) {
    case 'has_active_task':
      return 3.2;
    case 'uses_system':
    case 'uses_host':
    case 'uses_tool':
      return 2.7;
    case 'references_source':
      return 2.5;
    case 'supports':
      return 2.2;
    case 'works_at':
    case 'leads':
      return 1.8;
    default:
      return 1.1;
  }
}

function recordProvenance(
  store: SqliteTruthKernelStorage,
  provenanceId: string | null | undefined,
): ReturnType<SqliteTruthKernelStorage['getProvenance']> {
  return provenanceId ? store.getProvenance(provenanceId) : undefined;
}

function entityProvenance(
  store: SqliteTruthKernelStorage,
  entity: TruthEntityRecord,
): ReturnType<SqliteTruthKernelStorage['getProvenance']> {
  try {
    const parsed = JSON.parse(entity.state_json) as Record<string, unknown>;
    const provenanceId = typeof parsed.provenance_id === 'string' ? parsed.provenance_id : null;
    return recordProvenance(store, provenanceId);
  } catch {
    return undefined;
  }
}

function entityCategoryWeight(entity: TruthEntityRecord, projectEntityId: string): number {
  if (entity.entity_id === projectEntityId) return 6.5;
  if (entity.entity_id.includes(':source:')) return 5.8;
  switch (entity.entity_type) {
    case 'task':
      return 5.2;
    case 'system':
      return 4.8;
    case 'project':
      return 4.4;
    case 'tool':
      return 4.1;
    case 'person':
      return 3.7;
    default:
      return 3.3;
  }
}

const runtimeRetrievalStrategy = createRetrievalStrategy({
  profile: {
    sourceSystems: {
      'truth-kernel': 1.2,
      'jarvis-brain-db': 0.95,
      'jarvis-memory-db': 0.85,
      'demo-source': 0.35,
    },
    sourceKinds: {
      decision: 0.8,
      preference: 0.75,
      relationship: 0.7,
      memory: 0.65,
      database: 0.4,
    },
    missingSourceSystemWeight: 0.5,
    unknownSourceSystemWeight: 0.6,
    missingSourceKindWeight: 0.3,
    unknownSourceKindWeight: 0.5,
  },
});

function rankEntities(
  store: SqliteTruthKernelStorage,
  entities: readonly TruthEntityRecord[],
  relationships: readonly GraphRelationshipRow[],
  projectEntityId: string,
  strategy: ReturnType<typeof createRetrievalStrategy>,
  focusTokens: readonly string[],
  graphDepthMap?: ReadonlyMap<string, number>,
): readonly TruthEntityRecord[] {
  const connectionCounts = new Map<string, number>();
  for (const relationship of relationships) {
    connectionCounts.set(
      relationship.from_entity_id,
      (connectionCounts.get(relationship.from_entity_id) ?? 0) + 1,
    );
    connectionCounts.set(
      relationship.to_entity_id,
      (connectionCounts.get(relationship.to_entity_id) ?? 0) + 1,
    );
  }

  return entities
    .map<ScoredValue<TruthEntityRecord>>((entity) => {
      const provenance = entityProvenance(store, entity);
      // Depth-based graph relevance: depth 1 = 1.0, depth 2 = 0.5, depth 3 = 0.25
      const depth = graphDepthMap?.get(entity.entity_id);
      const depthScore = depth !== undefined ? 1.0 / Math.pow(2, depth - 1) : 0;
      const score = runtimeRetrievalStrategy.score({
        baseScore: entityCategoryWeight(entity, projectEntityId),
        sourceSystem: provenance?.source_system,
        sourceKind: provenance?.source_kind,
        provenanceConfidence: provenance?.confidence ?? 0.5,
        graphRelevance: (connectionCounts.get(entity.entity_id) ?? 0) * 0.45 + depthScore,
      }).total;
      return { value: entity, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.value.updated_at.localeCompare(left.value.updated_at);
    })
    .map((entry) => entry.value);
}

function rankDecisions(
  store: SqliteTruthKernelStorage,
  decisions: readonly TruthDecisionRecord[],
  entityScores: ReadonlyMap<string, number>,
  strategy: ReturnType<typeof createRetrievalStrategy>,
  focusTokens: readonly string[],
): readonly TruthDecisionRecord[] {
  return decisions
    .map<ScoredValue<TruthDecisionRecord>>((decision) => {
      const provenance = recordProvenance(store, decision.provenance_id);
      const scopeScore = decision.scope_entity_id ? entityScores.get(decision.scope_entity_id) ?? 0 : 0;
      return {
        value: decision,
        score: runtimeRetrievalStrategy.score({
          baseScore: 4,
          sourceSystem: provenance?.source_system,
          sourceKind: provenance?.source_kind,
          provenanceConfidence: provenance?.confidence ?? 0.5,
          graphRelevance: scopeScore * 0.18,
        }).total,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.value.updated_at.localeCompare(left.value.updated_at);
    })
    .map((entry) => entry.value);
}

function rankPreferences(
  store: SqliteTruthKernelStorage,
  preferences: readonly TruthPreferenceRecord[],
  entityScores: ReadonlyMap<string, number>,
  strategy: ReturnType<typeof createRetrievalStrategy>,
  focusTokens: readonly string[],
): readonly TruthPreferenceRecord[] {
  return preferences
    .map<ScoredValue<TruthPreferenceRecord>>((preference) => {
      const provenance = recordProvenance(store, preference.provenance_id);
      const subjectScore = preference.subject_ref ? entityScores.get(preference.subject_ref) ?? 0 : 0;
      const strengthBoost =
        preference.strength === 'high' ? 1.1 : preference.strength === 'medium' ? 0.7 : 0.3;
      return {
        value: preference,
        score: runtimeRetrievalStrategy.score({
          baseScore: 3.6 + strengthBoost,
          sourceSystem: provenance?.source_system,
          sourceKind: provenance?.source_kind,
          provenanceConfidence: provenance?.confidence ?? 0.5,
          graphRelevance: subjectScore * 0.16,
        }).total,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.value.updated_at.localeCompare(left.value.updated_at);
    })
    .map((entry) => entry.value);
}

function rankPromotedMemories(
  store: SqliteTruthKernelStorage,
  memories: readonly TruthPromotedMemoryRecord[],
  entityScores: ReadonlyMap<string, number>,
  strategy: ReturnType<typeof createRetrievalStrategy>,
  focusTokens: readonly string[],
): readonly TruthPromotedMemoryRecord[] {
  return memories
    .map<ScoredValue<TruthPromotedMemoryRecord>>((memory) => {
      const provenance = recordProvenance(store, memory.provenance_id);
      const subjectScore = memory.subject_entity_id ? entityScores.get(memory.subject_entity_id) ?? 0 : 0;
      return {
        value: memory,
        score: runtimeRetrievalStrategy.score({
          baseScore: 3.4,
          sourceSystem: provenance?.source_system,
          sourceKind: provenance?.source_kind,
          provenanceConfidence: provenance?.confidence ?? 0.5,
          graphRelevance: subjectScore * 0.14,
        }).total,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.value.updated_at.localeCompare(left.value.updated_at);
    })
    .map((entry) => entry.value);
}

function buildReviewQueue(store: SqliteTruthKernelStorage, limit: number): ReviewQueueItem[] {
  return store
    .listPromotionCandidates(limit)
    .filter(
      (
        candidate,
      ): candidate is {
        candidate_id: string;
        subject: string;
        status: 'pending_review' | 'needs_more_evidence';
        summary: string;
        created_at: string;
      } => candidate.status === 'pending_review' || candidate.status === 'needs_more_evidence',
    )
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      status: candidate.status,
      subject: candidate.subject,
      summary: candidate.summary,
      created_at: candidate.created_at,
    }));
}

function buildStaleItems(store: SqliteTruthKernelStorage, limit: number): StaleItem[] {
  return store
    .listKnowledgePages(limit, 'stale')
    .map((page) => ({
      page_id: page.page.page_id,
      page_type: page.page.page_type,
      title: page.page.title,
      status: 'stale',
      updated_at: page.updated_at,
      summary: `${page.page.page_id}: ${page.page.title}`,
    }));
}

function buildContradictionItems(
  store: SqliteTruthKernelStorage,
  limit: number,
  projectEntityId: string,
): ContradictionItem[] {
  return store.listOpenPreferenceContradictions(limit, projectEntityId).map((summary, index) => {
    const match = /^Preference conflict on (.*?): ([^:]+) -> (.+)$/u.exec(summary);
    const scope_ref = match?.[1] ?? 'workspace';
    const key = match?.[2] ?? `conflict_${index + 1}`;
    const values = (match?.[3] ?? '')
      .split(' | ')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return {
      contradiction_id: `contradiction:${scope_ref}:${key}:${index + 1}`,
      kind: 'preference_conflict',
      scope_ref,
      key,
      values,
      summary,
      updated_at: new Date().toISOString(),
    };
  });
}

function formatGraphRelationships(
  decisions: readonly TruthDecisionRecord[],
  preferences: readonly TruthPreferenceRecord[],
  promotedMemories: readonly TruthPromotedMemoryRecord[],
  persistedRelationships: readonly GraphRelationshipRow[],
  entitiesById: ReadonlyMap<string, TruthEntityRecord>,
  entityScores: ReadonlyMap<string, number>,
  strategy: ReturnType<typeof createRetrievalStrategy>,
  focusTokens: readonly string[],
): string[] {
  const relationshipSummaries = [
    ...persistedRelationships.map<ScoredValue<string>>((relationship) => {
      const from = buildEntityLabel(relationship.from_entity_id, entitiesById);
      const to = buildEntityLabel(relationship.to_entity_id, entitiesById);
      const summary = `${from} -[${relationship.relation_type}]-> ${to}`;
      const endpointScore =
        (entityScores.get(relationship.from_entity_id) ?? 0) +
        (entityScores.get(relationship.to_entity_id) ?? 0);
      return {
        value: summary,
        score: strategy.score({
          title: summary,
          baseScore: relationshipTypeWeight(relationship.relation_type),
          graphRelevance: (relationship.weight ?? 0) + endpointScore * 0.08,
        }).total,
      };
    }),
    ...decisions
      .filter((decision) => decision.scope_entity_id !== null)
      .map<ScoredValue<string>>((decision) => ({
        value: `Decision "${decision.title}" scoped to ${buildEntityLabel(decision.scope_entity_id!, entitiesById)}`,
        score: 2.6 + (entityScores.get(decision.scope_entity_id!) ?? 0) * 0.1,
      })),
    ...preferences
      .filter((preference) => preference.subject_ref !== null)
      .map<ScoredValue<string>>((preference) => ({
        value: `Preference "${preference.key}=${preference.value}" applies to ${buildEntityLabel(preference.subject_ref!, entitiesById)}`,
        score: 2.2 + (entityScores.get(preference.subject_ref!) ?? 0) * 0.08,
      })),
    ...promotedMemories
      .filter((memory) => memory.subject_entity_id !== null)
      .map<ScoredValue<string>>((memory) => ({
        value: `Memory "${memory.summary}" linked to ${buildEntityLabel(memory.subject_entity_id!, entitiesById)}`,
        score: 1.9 + (entityScores.get(memory.subject_entity_id!) ?? 0) * 0.06,
      })),
  ];

  return uniqueStrings(
    relationshipSummaries
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.value),
  );
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

function buildFocusTokens(project: string, objective: string, activeTask: string): string[] {
  return [project, objective, activeTask]
    .join(' ')
    .split(/\s+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

export function createSessionRuntime(options: SessionRuntimeOptions = {}): SessionRuntime {
  const store = options.store ?? createTruthKernelStorage(options.storePath ?? defaultTruthKernelStoreLocation());
  const reviewQueueLimit = options.reviewQueueLimit ?? 8;

  return {
    buildContextPack(input: SessionStartInput): SessionContextPack {
      const project = input.project?.trim() || DEFAULT_FOCUS.project;
      const objective = input.objective?.trim() || DEFAULT_FOCUS.objective;
      const activeTask = input.activeTask?.trim() || DEFAULT_FOCUS.activeTask;
      const projectEntityId = `project:${project}`;
      const seedEntities = normalizeList(input.seedEntities);
      const focusTokens = buildFocusTokens(project, objective, activeTask);
      const retrievalStrategy = createRetrievalStrategy(
        {
          query: focusTokens.join(' '),
          ...(options.recallWeights ? { weights: options.recallWeights } : {}),
        },
      );

      if (options.autoSeed ?? true) {
        ensureTruthKernelSeedData(store, { project, objective, activeTask });
      }

      const snapshot = loadSessionStartSnapshot(store, { projectEntityId });
      const expanded = expandSnapshot(store, snapshot, projectEntityId);

      // Ontology-aware graph expansion first (seeds: project + explicit seed entities)
      // Must happen before rankEntities so depth scores can inform ranking
      const initialSeeds = uniqueStrings([projectEntityId, ...seedEntities]);
      const graphExpansion = expandGraphContext(store, initialSeeds, { maxDepth: 2, maxResults: 15 });

      // Build depth map: entity_id → minimum traversal depth (depth 1 = direct neighbor)
      const graphDepthMap = new Map<string, number>();
      for (const path of graphExpansion.traversal_paths) {
        for (const step of path.steps) {
          const existing = graphDepthMap.get(step.entity_id);
          if (existing === undefined || step.depth < existing) {
            graphDepthMap.set(step.entity_id, step.depth);
          }
        }
      }

      const rankedEntities = rankEntities(
        store,
        expanded.entities,
        expanded.persistedRelationships,
        projectEntityId,
        retrievalStrategy,
        focusTokens,
        graphDepthMap,
      );
      const entityScores = new Map(
        rankedEntities.map((entity, index) => [entity.entity_id, rankedEntities.length - index] as const),
      );
      const rankedDecisions = rankDecisions(store, expanded.decisions, entityScores, retrievalStrategy, focusTokens);
      const rankedPreferences = rankPreferences(store, expanded.preferences, entityScores, retrievalStrategy, focusTokens);
      const rankedPromotedMemories = rankPromotedMemories(
        store,
        expanded.promotedMemories,
        entityScores,
        retrievalStrategy,
        focusTokens,
      );
      const entitiesById = new Map(
        rankedEntities.map((entity) => [entity.entity_id, entity] as const),
      );

      // Merge graph expansion decisions into ranked decisions (dedup by decision_id)
      const graphOnlyDecisions = graphExpansion.related_decisions.filter(
        (d) => !rankedDecisions.some((rd) => rd.decision_id === d.decision_id),
      );
      const allDecisions = [...rankedDecisions, ...graphOnlyDecisions];

      const relatedEntityIds = uniqueStrings([
        ...seedEntities,
        ...rankedEntities.map((entity) => entity.entity_id),
        ...expanded.persistedRelationships.flatMap((relationship) => [
          relationship.from_entity_id,
          relationship.to_entity_id,
        ]),
        ...graphExpansion.expanded_entities.map((entity) => entity.entity_id),
      ]);
      const relatedEntityNames = rankedEntities.map((entity) => entity.name);
      const graphRelationships = formatGraphRelationships(
        rankedDecisions,
        rankedPreferences,
        rankedPromotedMemories,
        expanded.persistedRelationships,
        entitiesById,
        entityScores,
        retrievalStrategy,
        focusTokens,
      );

      // Build related_pages from store — graph-expanded entity matching + project scope
      const sessionBriefId = `page:session:${project}`;
      const graphEntityIdSet = new Set([
        projectEntityId,
        ...graphExpansion.expanded_entities.map((e) => e.entity_id),
        ...rankedEntities.map((e) => e.entity_id),
      ]);
      const storedProjectPages = store.listKnowledgePages(15)
        .filter(
          (p) =>
            p.page.page_type === 'project_page' ||
            p.linked_entity_ids.some((id) => graphEntityIdSet.has(id)),
        )
        .map((p) => ({
          page_id: p.page.page_id,
          page_type: p.page.page_type,
          title: p.page.title,
          status: p.page.status,
        }))
        .slice(0, 8);
      const relatedPages = [
        {
          page_id: sessionBriefId,
          page_type: 'session_brief' as const,
          title: `${project} session brief`,
          status: 'canonical' as const,
        },
        ...storedProjectPages.filter((p) => p.page_id !== sessionBriefId),
      ];

      return {
        session: {
          session_id: `${project}:${activeTask}`,
          host: 'codex',
          project,
          objective,
          active_task: activeTask,
        },
        current_focus: {
          project,
          objective,
          activeTask,
        },
        truth_highlights: {
          decisions: allDecisions.slice(0, 6).map((decision) => decision.title),
          preferences: rankedPreferences.slice(0, 6).map((preference) => `${preference.key}=${preference.value}`),
          entities: relatedEntityNames.slice(0, 8),
          promoted_memories: rankedPromotedMemories.slice(0, 6).map((memory) => memory.summary),
        },
        graph_context: {
          seed_entities:
            seedEntities.length > 0
              ? seedEntities
              : uniqueStrings([projectEntityId, ...rankedEntities.slice(0, 4).map((entity) => entity.entity_id)]),
          related_entities: relatedEntityIds.slice(0, 12),
          relationships: graphRelationships.slice(0, 12),
        },
        recent_changes: {
          recent_promotions: rankedPromotedMemories.map((memory) => memory.memory_id),
          superseded: rankedDecisions
            .filter((decision) => decision.superseded_by !== null)
            .map((decision) => decision.decision_id),
          open_contradictions: [...store.listOpenPreferenceContradictions(reviewQueueLimit, projectEntityId)],
          review_queue: buildReviewQueue(store, reviewQueueLimit).map((item) => `${item.candidate_id}: ${item.summary}`),
          stale_items: buildStaleItems(store, reviewQueueLimit).map((item) => item.summary),
          contradiction_items: buildContradictionItems(store, reviewQueueLimit, projectEntityId),
          review_queue_items: buildReviewQueue(store, reviewQueueLimit),
          stale_item_details: buildStaleItems(store, reviewQueueLimit),
        },
        evidence_appendix: {
          enabled: false,
          bundles: [],
        },
        related_pages: relatedPages,
      };
    },
  };
}
