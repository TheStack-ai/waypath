import type { TruthEntityRecord, TruthRelationshipRecord, TruthDecisionRecord } from '../jarvis_fusion/contracts.js';
import type { SqliteTruthKernelStorage } from '../jarvis_fusion/truth-kernel/storage.js';
import type {
  TraversalStep,
  TraversalPath,
  TraversalOptions,
  GraphExpansionResult,
  PatternTraversalRequest,
} from './types.js';
import { PATTERN_CONFIGS } from './types.js';

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_RELATIONSHIP_LIMIT = 50;

interface BfsQueueEntry {
  readonly entityId: string;
  readonly depth: number;
  readonly parentRelation: TruthRelationshipRecord | null;
  readonly direction: 'outgoing' | 'incoming';
  readonly priority: number;
}

function getRelationWeight(
  relationType: string,
  weights: Readonly<Record<string, number>> | undefined,
): number {
  if (!weights) return 1.0;
  return weights[relationType] ?? 0.5;
}

function insertByPriority(queue: BfsQueueEntry[], entry: BfsQueueEntry): void {
  let i = queue.length;
  while (i > 0 && (queue[i - 1]?.priority ?? 0) < entry.priority) {
    i--;
  }
  queue.splice(i, 0, entry);
}

function matchesRelationFilter(
  relationType: string,
  filter: readonly string[] | undefined,
): boolean {
  if (!filter || filter.length === 0) return true;
  return filter.includes(relationType);
}

function matchesDirectionFilter(
  direction: 'outgoing' | 'incoming',
  filter: 'outgoing' | 'incoming' | 'both' | undefined,
): boolean {
  if (!filter || filter === 'both') return true;
  return direction === filter;
}

function resolveDirection(
  relationship: TruthRelationshipRecord,
  fromEntityId: string,
): 'outgoing' | 'incoming' {
  return relationship.from_entity_id === fromEntityId ? 'outgoing' : 'incoming';
}

function resolveTargetEntityId(
  relationship: TruthRelationshipRecord,
  fromEntityId: string,
): string {
  return relationship.from_entity_id === fromEntityId
    ? relationship.to_entity_id
    : relationship.from_entity_id;
}

/**
 * BFS graph traversal from a seed entity.
 * Walks entity-relationship graph up to maxDepth hops,
 * collecting TraversalSteps and deduplicating visited nodes.
 */
export function traverseFromEntity(
  store: SqliteTruthKernelStorage,
  seedEntityId: string,
  options: TraversalOptions = {},
): TraversalPath {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const visited = new Set<string>([seedEntityId]);
  const steps: TraversalStep[] = [];

  const queue: BfsQueueEntry[] = [{
    entityId: seedEntityId,
    depth: 0,
    parentRelation: null,
    direction: 'outgoing',
    priority: 10.0,
  }];

  while (queue.length > 0 && steps.length < maxResults) {
    const entry = queue.shift();
    if (!entry) break;

    if (entry.depth > maxDepth) continue;

    const relationships = store.listRelationshipsForEntity(
      entry.entityId,
      DEFAULT_RELATIONSHIP_LIMIT,
    );

    for (const rel of relationships) {
      if (steps.length >= maxResults) break;

      const direction = resolveDirection(rel, entry.entityId);
      if (!matchesDirectionFilter(direction, options.directionFilter)) continue;
      if (!matchesRelationFilter(rel.relation_type, options.relationFilter)) continue;

      const targetId = resolveTargetEntityId(rel, entry.entityId);
      if (visited.has(targetId)) continue;

      visited.add(targetId);

      const targetEntity = store.getEntity(targetId);
      if (!targetEntity) continue;

      if (options.statusFilter && options.statusFilter.length > 0) {
        if (!options.statusFilter.includes(targetEntity.status)) continue;
      }

      const relWeight = getRelationWeight(rel.relation_type, options.relationWeights);

      steps.push({
        entity_id: targetId,
        entity_name: targetEntity.name,
        entity_type: targetEntity.entity_type,
        relation_type: rel.relation_type,
        direction,
        depth: entry.depth + 1,
        weight: rel.weight,
      });

      if (entry.depth + 1 < maxDepth) {
        insertByPriority(queue, {
          entityId: targetId,
          depth: entry.depth + 1,
          parentRelation: rel,
          direction,
          priority: relWeight * (rel.weight ?? 1.0),
        });
      }
    }
  }

  const terminalIds = steps
    .filter((step) => step.depth === maxDepth || !hasOutgoingEdges(store, step.entity_id, visited))
    .map((step) => step.entity_id);

  return {
    seed_entity_id: seedEntityId,
    steps,
    terminal_entity_ids: [...new Set(terminalIds)],
  };
}

function hasOutgoingEdges(
  store: SqliteTruthKernelStorage,
  entityId: string,
  visited: Set<string>,
): boolean {
  const rels = store.listRelationshipsForEntity(entityId, 5);
  return rels.some((rel) => {
    const targetId = resolveTargetEntityId(rel, entityId);
    return !visited.has(targetId);
  });
}

/**
 * Expands multiple seed entities into a full GraphExpansionResult.
 * Traverses from each seed, deduplicates across all paths,
 * and collects related decisions scoped to discovered entities.
 */
export function expandGraphContext(
  store: SqliteTruthKernelStorage,
  seedEntityIds: readonly string[],
  options: TraversalOptions = {},
): GraphExpansionResult {
  const uniqueSeeds = [...new Set(seedEntityIds.filter((id) => id.trim().length > 0))];
  if (uniqueSeeds.length === 0) {
    return {
      seed_entities: [],
      expanded_entities: [],
      expanded_relationships: [],
      traversal_paths: [],
      related_decisions: [],
    };
  }

  const paths: TraversalPath[] = [];
  const allEntityIds = new Set<string>(uniqueSeeds);

  for (const seedId of uniqueSeeds) {
    const path = traverseFromEntity(store, seedId, options);
    paths.push(path);
    for (const step of path.steps) {
      allEntityIds.add(step.entity_id);
    }
  }

  // Collect full entity records
  const expandedEntities: TruthEntityRecord[] = [];
  for (const entityId of allEntityIds) {
    const entity = store.getEntity(entityId);
    if (entity) {
      expandedEntities.push(entity);
    }
  }

  // Collect relationships between discovered entities — scale limit with entity count to avoid silent truncation
  const relationshipLimit = Math.max(DEFAULT_RELATIONSHIP_LIMIT, allEntityIds.size * 5);
  const expandedRelationships = store
    .listRelationshipsForEntities([...allEntityIds], relationshipLimit)
    .filter((rel) => allEntityIds.has(rel.from_entity_id) && allEntityIds.has(rel.to_entity_id));

  // Collect decisions scoped to discovered entities
  const relatedDecisions: TruthDecisionRecord[] = [];
  const seenDecisionIds = new Set<string>();
  for (const entityId of allEntityIds) {
    const decisions = store.listActiveDecisions(5, entityId);
    for (const decision of decisions) {
      if (!seenDecisionIds.has(decision.decision_id)) {
        seenDecisionIds.add(decision.decision_id);
        relatedDecisions.push(decision);
      }
    }
  }

  return {
    seed_entities: uniqueSeeds,
    expanded_entities: expandedEntities,
    expanded_relationships: expandedRelationships,
    traversal_paths: paths,
    related_decisions: relatedDecisions,
  };
}

/**
 * Executes a predefined traversal pattern (A-D from docs/13).
 */
export function executePattern(
  store: SqliteTruthKernelStorage,
  request: PatternTraversalRequest,
): GraphExpansionResult {
  const patternConfig = PATTERN_CONFIGS[request.pattern];
  const mergedOptions: TraversalOptions = {
    ...patternConfig,
    ...request.options,
  };

  return expandGraphContext(store, [request.seed_entity_id], mergedOptions);
}
