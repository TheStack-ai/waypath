import type { TruthEntityRecord, TruthRelationshipRecord, TruthDecisionRecord } from '../jarvis_fusion/contracts.js';

export const RELATION_TYPES = [
  'relates_to',
  'depends_on',
  'blocks',
  'supports',
  'uses',
  'owned_by',
  'decided_by',
  'about',
  'implements',
  'supersedes',
  'contradicts',
  'evidence_for',
  'preferred_by',
  'has_active_task',
  'uses_system',
] as const;

export type RelationType = typeof RELATION_TYPES[number];

export interface TraversalStep {
  readonly entity_id: string;
  readonly entity_name: string;
  readonly entity_type: string;
  readonly relation_type: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly depth: number;
  readonly weight: number | null;
}

export interface TraversalPath {
  readonly seed_entity_id: string;
  readonly steps: readonly TraversalStep[];
  readonly terminal_entity_ids: readonly string[];
}

export interface TraversalOptions {
  readonly maxDepth?: number;
  readonly maxResults?: number;
  readonly relationFilter?: readonly string[];
  readonly directionFilter?: 'outgoing' | 'incoming' | 'both';
  readonly statusFilter?: readonly string[];
  /** Relation-type weights for BFS priority. Higher = explored first. */
  readonly relationWeights?: Readonly<Record<string, number>>;
}

export interface GraphExpansionResult {
  readonly seed_entities: readonly string[];
  readonly expanded_entities: readonly TruthEntityRecord[];
  readonly expanded_relationships: readonly TruthRelationshipRecord[];
  readonly traversal_paths: readonly TraversalPath[];
  readonly related_decisions: readonly TruthDecisionRecord[];
}

export type TraversalPattern =
  | 'project_context'
  | 'person_context'
  | 'system_reasoning'
  | 'contradiction_lookup';

export interface PatternTraversalRequest {
  readonly pattern: TraversalPattern;
  readonly seed_entity_id: string;
  readonly options?: TraversalOptions;
}

export const PATTERN_CONFIGS: Readonly<Record<TraversalPattern, TraversalOptions>> = {
  project_context: {
    maxDepth: 3,
    maxResults: 25,
    directionFilter: 'both',
    relationWeights: {
      has_active_task: 3.0,
      uses: 2.5,
      depends_on: 2.0,
      implements: 1.8,
      owned_by: 1.5,
      decided_by: 1.5,
      relates_to: 1.0,
      supports: 1.0,
      about: 0.8,
    },
  },
  person_context: {
    maxDepth: 3,
    maxResults: 20,
    directionFilter: 'both',
    relationWeights: {
      owned_by: 3.0,
      decided_by: 2.5,
      preferred_by: 2.0,
      has_active_task: 1.5,
      uses: 1.0,
      relates_to: 0.8,
    },
  },
  system_reasoning: {
    maxDepth: 3,
    maxResults: 20,
    directionFilter: 'both',
    relationWeights: {
      relates_to: 2.5,
      implements: 2.5,
      uses: 2.0,
      depends_on: 2.0,
      supports: 1.5,
      about: 1.0,
      decided_by: 0.8,
    },
  },
  contradiction_lookup: {
    maxDepth: 2,
    maxResults: 15,
    relationFilter: ['supersedes', 'contradicts', 'evidence_for', 'about'],
    directionFilter: 'both',
    statusFilter: ['active'],
    relationWeights: {
      supersedes: 3.0,
      contradicts: 3.0,
      evidence_for: 2.0,
      about: 1.0,
    },
  },
};
