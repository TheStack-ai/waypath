import type { PromotionCandidateView } from '../contracts/index.js';
import { type SqliteTruthKernelStorage } from './truth-kernel/index.js';
import { submitCandidate, reviewCandidate } from '../promotion/index.js';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Backward-compatible wrapper: submit a promotion candidate by subject string.
 * Delegates to the promotion engine's submitCandidate.
 * Returns a PromotionCandidateView for callers that expect the legacy shape.
 */
export function submitPromotionCandidate(subject: string, store?: SqliteTruthKernelStorage): PromotionCandidateView {
  if (!store) {
    const candidateId = `promotion:${subject.replace(/\s+/g, '-').toLowerCase() || 'empty'}`;
    return {
      candidate_id: candidateId,
      subject,
      status: 'pending_review',
      summary: `Promotion candidate recorded for explicit review: ${subject}`,
      created_at: nowIso(),
    };
  }

  const result = submitCandidate(store, { subject });
  return result.candidate;
}

/**
 * Backward-compatible wrapper: review a promotion candidate by ID and status string.
 * Delegates to the promotion engine's reviewCandidate.
 * Returns a PromotionCandidateView for callers that expect the legacy shape.
 */
export function reviewPromotionCandidate(
  candidateId: string,
  status: PromotionCandidateView['status'],
  notes?: string,
  store?: SqliteTruthKernelStorage,
): PromotionCandidateView | undefined {
  if (!store) {
    return undefined;
  }

  const dbStatus =
    status === 'pending_review' ? 'pending' as const :
    status === 'accepted' ? 'accepted' as const :
    status === 'rejected' ? 'rejected' as const :
    status === 'needs_more_evidence' ? 'needs_more_evidence' as const :
    status === 'superseded' ? 'superseded' as const :
    'rejected' as const;

  const result = reviewCandidate(store, {
    candidate_id: candidateId,
    status: dbStatus,
    notes,
  });

  return result.success ? result.candidate : undefined;
}
