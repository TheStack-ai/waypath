export {
  RELATION_TYPES,
  PATTERN_CONFIGS,
  type RelationType,
  type TraversalStep,
  type TraversalPath,
  type TraversalOptions,
  type GraphExpansionResult,
  type TraversalPattern,
  type PatternTraversalRequest,
} from './types.js';

export {
  traverseFromEntity,
  expandGraphContext,
  executePattern,
} from './traversal.js';
