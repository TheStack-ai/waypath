/**
 * 4-Layer Dedup Pipeline
 * Adapted from gbrain's production dedup (content_chunk.rb).
 *
 * 1. By source: one result per unique ID with highest score
 * 2. By text similarity: remove results >threshold Jaccard similarity to kept results
 * 3. By type diversity: no source_type exceeds maxRatio of results
 * 4. By source cap: max N results per unique source ID
 */

import type { ScoredResult, DedupConfig } from './types.js';

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
const DEFAULT_MAX_TYPE_RATIO = 0.6;
const DEFAULT_MAX_PER_SOURCE = 2;

export function dedupResults(
  results: readonly ScoredResult[],
  config?: DedupConfig,
): ScoredResult[] {
  const threshold = config?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxRatio = config?.maxTypeRatio ?? DEFAULT_MAX_TYPE_RATIO;
  const maxPerSource = config?.maxPerSource ?? DEFAULT_MAX_PER_SOURCE;

  let deduped = [...results];

  // Layer 1: By unique ID (highest score wins)
  deduped = dedupById(deduped);

  // Layer 2: By text similarity (Jaccard on word sets)
  deduped = dedupByTextSimilarity(deduped, threshold);

  // Layer 3: By type diversity
  deduped = enforceTypeDiversity(deduped, maxRatio);

  // Layer 4: By source cap
  deduped = capPerSource(deduped, maxPerSource);

  return deduped;
}

/**
 * Layer 1: Keep only the highest-scoring entry per unique candidate ID.
 */
function dedupById(results: ScoredResult[]): ScoredResult[] {
  const byId = new Map<string, ScoredResult>();

  for (const r of results) {
    const existing = byId.get(r.candidate.id);
    if (!existing || r.score > existing.score) {
      byId.set(r.candidate.id, r);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}

/**
 * Layer 2: Remove results whose text is too similar to already-kept results.
 * Uses Jaccard similarity on word sets as a fast proxy.
 */
function dedupByTextSimilarity(results: ScoredResult[], threshold: number): ScoredResult[] {
  const kept: ScoredResult[] = [];

  for (const r of results) {
    const rWords = wordSet(r.candidate.title + ' ' + r.candidate.content);
    let tooSimilar = false;

    for (const k of kept) {
      const kWords = wordSet(k.candidate.title + ' ' + k.candidate.content);
      const jaccard = jaccardSimilarity(rWords, kWords);

      if (jaccard > threshold) {
        tooSimilar = true;
        break;
      }
    }

    if (!tooSimilar) {
      kept.push(r);
    }
  }

  return kept;
}

/**
 * Layer 3: No source_type exceeds maxRatio of total results.
 * Prevents entity-heavy or decision-heavy result flooding.
 */
function enforceTypeDiversity(results: ScoredResult[], maxRatio: number): ScoredResult[] {
  const maxPerType = Math.max(1, Math.ceil(results.length * maxRatio));
  const typeCounts = new Map<string, number>();
  const kept: ScoredResult[] = [];

  for (const r of results) {
    const count = typeCounts.get(r.candidate.source_type) ?? 0;
    if (count < maxPerType) {
      kept.push(r);
      typeCounts.set(r.candidate.source_type, count + 1);
    }
  }

  return kept;
}

/**
 * Layer 4: Cap results per unique source entity/page.
 */
function capPerSource(results: ScoredResult[], maxPerSource: number): ScoredResult[] {
  const sourceCounts = new Map<string, number>();
  const kept: ScoredResult[] = [];

  for (const r of results) {
    // Group by source_type:id prefix to handle related chunks
    const sourceKey = `${r.candidate.source_type}:${r.candidate.id.split(':').slice(0, 2).join(':')}`;
    const count = sourceCounts.get(sourceKey) ?? 0;
    if (count < maxPerSource) {
      kept.push(r);
      sourceCounts.set(sourceKey, count + 1);
    }
  }

  return kept;
}

function wordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
