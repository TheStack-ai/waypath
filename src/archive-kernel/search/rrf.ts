/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Merges multiple ranked lists into a single ranking.
 * Each result gets: score = sum(1 / (K + rank_in_list))
 *
 * K = 60 (empirically tuned — same as gbrain/production systems).
 * This normalizes vector (0-1), keyword (0-∞), and graph (0-N) scores
 * onto a common scale based purely on relative rank position.
 */

import type { SearchCandidate, ScoredResult, ScoreBreakdown } from './types.js';

const RRF_K = 60;

export interface RankedList {
  readonly dimension: 'keyword' | 'graph' | 'provenance' | 'lexical';
  readonly results: readonly SearchCandidate[];
}

/**
 * Fuse multiple ranked lists into a single scored ranking via RRF.
 *
 * Each candidate's final score = sum across all lists of 1/(K + rank).
 * Candidates appearing in multiple lists get boosted naturally.
 */
export function rrfFusion(lists: readonly RankedList[]): ScoredResult[] {
  const scoreMap = new Map<string, {
    candidate: SearchCandidate;
    keyword: number;
    graph: number;
    provenance: number;
    lexical: number;
    total: number;
  }>();

  for (const list of lists) {
    for (let rank = 0; rank < list.results.length; rank++) {
      const candidate = list.results[rank];
      if (!candidate) continue;

      const rrfScore = 1 / (RRF_K + rank);
      const key = candidate.id;

      const existing = scoreMap.get(key);
      if (existing) {
        switch (list.dimension) {
          case 'keyword': existing.keyword += rrfScore; break;
          case 'graph': existing.graph += rrfScore; break;
          case 'provenance': existing.provenance += rrfScore; break;
          case 'lexical': existing.lexical += rrfScore; break;
        }
        existing.total += rrfScore;
      } else {
        scoreMap.set(key, {
          candidate,
          keyword: list.dimension === 'keyword' ? rrfScore : 0,
          graph: list.dimension === 'graph' ? rrfScore : 0,
          provenance: list.dimension === 'provenance' ? rrfScore : 0,
          lexical: list.dimension === 'lexical' ? rrfScore : 0,
          total: rrfScore,
        });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.total - a.total)
    .map((entry): ScoredResult => ({
      candidate: entry.candidate,
      score: entry.total,
      breakdown: {
        keyword: entry.keyword,
        graph: entry.graph,
        provenance: entry.provenance,
        lexical: entry.lexical,
        rrf_fused: entry.total,
      },
    }));
}
