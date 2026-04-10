export {
  type TruthPayload,
  type PromotionSubmission,
  type ReviewDecision,
  type PromotionSideEffect,
  type PromotionResult,
  type SubmitResult,
  type ContradictionResolution,
} from './types.js';

export {
  submitCandidate,
  reviewCandidate,
  listPendingCandidates,
  resolveContradiction,
} from './promotion-engine.js';
