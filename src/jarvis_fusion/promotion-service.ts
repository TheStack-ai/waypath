import type { PromotionCandidateView } from '../contracts/index.js';
import { type SqliteTruthKernelStorage } from './truth-kernel/index.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function submitPromotionCandidate(subject: string, store?: SqliteTruthKernelStorage): PromotionCandidateView {
  const candidate: PromotionCandidateView = {
    candidate_id: `promotion:${subject.replace(/\s+/g, '-').toLowerCase() || 'empty'}`,
    subject,
    status: 'pending_review',
    summary: `Promotion candidate recorded for explicit review: ${subject}`,
    created_at: nowIso(),
  };

  if (store) {
    store.createPromotionCandidate(candidate);
    return store.getPromotionCandidate(candidate.candidate_id) ?? candidate;
  }

  return candidate;
}

export function reviewPromotionCandidate(
  candidateId: string,
  status: PromotionCandidateView['status'],
  notes?: string,
  store?: SqliteTruthKernelStorage,
): PromotionCandidateView | undefined {
  if (!store) {
    return undefined;
  }

  return store.reviewPromotionCandidate(candidateId, status, notes);
}
