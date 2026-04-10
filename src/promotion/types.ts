import type {
  PromotionAction,
  CandidateReviewStatus,
  TruthEntityRecord,
  TruthDecisionRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from '../jarvis_fusion/contracts.js';
import type { PromotionCandidateView, SourceAnchor } from '../contracts/index.js';

/**
 * Discriminated union of truth records that can be created/updated/superseded during promotion.
 * When provided in ReviewDecision.payload, the engine writes exactly this record to the truth store.
 */
export type TruthPayload =
  | { readonly kind: 'entity'; readonly data: Omit<TruthEntityRecord, 'created_at' | 'updated_at'> }
  | { readonly kind: 'decision'; readonly data: Omit<TruthDecisionRecord, 'created_at' | 'updated_at'> }
  | { readonly kind: 'preference'; readonly data: Omit<TruthPreferenceRecord, 'created_at' | 'updated_at'> }
  | { readonly kind: 'memory'; readonly data: Omit<TruthPromotedMemoryRecord, 'created_at' | 'updated_at'> };

export interface PromotionSubmission {
  readonly subject: string;
  readonly claim_text?: string;
  readonly claim_type?: string;
  readonly proposed_action?: PromotionAction;
  readonly target_object_type?: string;
  readonly target_object_id?: string;
  readonly subject_entity_id?: string;
  readonly evidence_bundle_id?: string;
  /** Optional source anchor for provenance recording on submit */
  readonly source?: SourceAnchor;
  readonly confidence?: number | null;
  readonly notes?: string | null;
}

export interface ReviewDecision {
  readonly candidate_id: string;
  readonly status: CandidateReviewStatus;
  readonly notes?: string | undefined;
  /** Who is reviewing — defaults to 'operator' if omitted */
  readonly reviewer?: string;
  /**
   * When provided, the engine writes exactly this truth record on acceptance.
   * When omitted, falls back to creating a promoted_memory from the candidate's subject.
   */
  readonly payload?: TruthPayload | null;
}

export type PromotionSideEffect =
  | { readonly kind: 'truth_created'; readonly object_type: string; readonly object_id: string }
  | { readonly kind: 'truth_updated'; readonly object_type: string; readonly object_id: string }
  | { readonly kind: 'truth_superseded'; readonly old_id: string; readonly new_id: string }
  | { readonly kind: 'provenance_recorded'; readonly provenance_id: string }
  | { readonly kind: 'page_marked_stale'; readonly page_id: string }
  | { readonly kind: 'contradiction_detected'; readonly key: string; readonly scope: string };

export interface PromotionResult {
  readonly candidate: PromotionCandidateView;
  readonly side_effects: readonly PromotionSideEffect[];
  readonly success: boolean;
  readonly message: string;
}

/** Returned alongside PromotionResult from submitCandidate — IDs of created records */
export interface SubmitResult {
  readonly claim_id: string;
  readonly candidate_id: string;
  readonly provenance_id: string | null;
}

/** Input to resolveContradiction */
export interface ContradictionResolution {
  readonly key: string;
  readonly scope_ref: string | null;
  readonly keep_preference_id: string;
  readonly resolution_notes: string | null;
}
