export {
  type SearchCandidate,
  type ScoredResult,
  type ScoreBreakdown,
  type SearchOptions,
  type DedupConfig,
} from './types.js';

export { rrfFusion, type RankedList } from './rrf.js';
export { dedupResults } from './dedup.js';
export { searchTruthKernel, queryTruthDirect, type SearchPipelineOptions } from './pipeline.js';
