export interface PromotionReviewResult {
  readonly candidate_id: string;
  readonly status: 'accepted' | 'pending_review';
  readonly summary: string;
}

export function submitPromotionCandidate(subject: string): PromotionReviewResult {
  return {
    candidate_id: `promotion:${subject.replace(/\s+/g, '-').toLowerCase() || 'empty'}`,
    status: 'pending_review',
    summary: `Promotion candidate recorded for explicit review: ${subject}`,
  };
}
