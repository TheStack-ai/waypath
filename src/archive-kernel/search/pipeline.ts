/**
 * Waypath Search Pipeline
 *
 * Combines 4 ranking dimensions via RRF fusion:
 * 1. Keyword (FTS5 on truth kernel tables)
 * 2. Graph (ontology traversal depth/weight)
 * 3. Provenance (source system/kind weights)
 * 4. Lexical (token overlap fallback)
 *
 * Then applies 4-layer dedup to produce final ranked results.
 *
 * This replaces the old string.includes() scoring with a real retrieval pipeline.
 */

import type { SqliteTruthKernelStorage } from '../../jarvis_fusion/truth-kernel/storage.js';
import type {
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from '../../jarvis_fusion/contracts.js';
import type { RecallWeightOverrides } from '../../contracts/index.js';
import type { SearchCandidate, ScoredResult, SearchOptions } from './types.js';
import type { RankedList } from './rrf.js';
import { rrfFusion } from './rrf.js';
import { dedupResults } from './dedup.js';

export interface SearchPipelineOptions {
  readonly store: SqliteTruthKernelStorage;
  readonly recallWeights?: RecallWeightOverrides | undefined;
  /** Entity IDs to boost via graph scoring */
  readonly graphSeedEntityIds?: readonly string[] | undefined;
  /** Pre-computed graph depths: entity_id → depth from seed */
  readonly graphDepths?: ReadonlyMap<string, number> | undefined;
  /** Pre-ranked external candidate lists to merge via RRF */
  readonly extraRankedLists?: readonly RankedList[] | undefined;
}

const DEFAULT_SOURCE_SYSTEM_WEIGHTS: Readonly<Record<string, number>> = {
  'truth-kernel': 1.1,
  'jarvis-brain-db': 0.95,
  'jarvis-memory-db': 0.85,
  'demo-source': 0.3,
};

const DEFAULT_SOURCE_KIND_WEIGHTS: Readonly<Record<string, number>> = {
  decision: 0.9,
  preference: 0.8,
  relationship: 0.7,
  memory: 0.6,
  entity: 0.55,
  evidence: 0.5,
};

/**
 * Query truth kernel directly — no RRF fusion.
 *
 * Scores candidates by combined keyword + provenance + lexical scoring.
 * This is the truth-first path: returns canonical truth results directly.
 * Use this before falling back to archive-internal RRF fusion.
 */
export function queryTruthDirect(
  query: string,
  options: SearchPipelineOptions,
): ScoredResult[] {
  const { store, recallWeights, graphDepths } = options;
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return [];

  const tokens = tokenize(normalizedQuery);

  // Canonical truth only: indexed entities/decisions/memories via FTS + matching preferences.
  const candidates = loadTruthDirectCandidates(store, normalizedQuery, tokens);
  if (candidates.length === 0) return [];

  // Build FTS5 keyword scores for truth candidates.
  const ftsKeywordScores = new Map<string, number>();
  const ftsHits = store.searchWaypathFts(normalizedQuery, Math.max(candidates.length * 2, 40));
  for (let index = 0; index < ftsHits.length; index += 1) {
    const hit = ftsHits[index];
    if (!hit) continue;
    // Order-based scoring is more stable than raw bm25 magnitudes across SQLite builds.
    ftsKeywordScores.set(hit.source_id, Math.max(1, ftsHits.length - index));
  }

  // Score each candidate with a direct combined score (no RRF)
  const scored: ScoredResult[] = candidates.map((c) => {
    const titleLower = c.title.toLowerCase();
    const contentLower = c.content.toLowerCase();

    // Keyword score: prefer FTS5 BM25, fallback to string match
    let keyword = ftsKeywordScores.get(c.id) ?? 0;
    if (keyword === 0) {
      for (const token of tokens) {
        if (titleLower.includes(token)) keyword += 3;
        if (contentLower.includes(token)) keyword += 1;
      }
    }

    // Graph score
    let graph = 0;
    if (graphDepths && graphDepths.size > 0) {
      const depth = graphDepths.get(c.id);
      const scopeId = c.metadata.scope_entity_id as string | undefined;
      const scopeDepth = scopeId ? graphDepths.get(scopeId) : undefined;
      const subjectRef = c.metadata.subject_ref as string | undefined;
      const subjectDepth = subjectRef ? graphDepths.get(subjectRef) : undefined;
      const bestDepth = minDefined(depth, scopeDepth, subjectDepth);
      if (bestDepth !== undefined) graph = 1 / (1 + bestDepth);
    }

    // Provenance score
    const systemWeight = recallWeights?.sourceSystems?.[c.source_system]
      ?? DEFAULT_SOURCE_SYSTEM_WEIGHTS[c.source_system]
      ?? 0.5;
    const kindWeight = recallWeights?.sourceKinds?.[c.source_kind]
      ?? DEFAULT_SOURCE_KIND_WEIGHTS[c.source_kind]
      ?? 0.4;
    const provenance = systemWeight + kindWeight + (c.confidence ?? 0);

    // Lexical coverage
    let matchCount = 0;
    let titleBonus = 0;
    for (const token of tokens) {
      const inTitle = titleLower.includes(token);
      const inContent = contentLower.includes(token);
      if (inTitle || inContent) matchCount++;
      if (inTitle) titleBonus += 0.5;
    }
    const lexical = tokens.length > 0 ? (matchCount / tokens.length) + titleBonus : 0;

    // Combined direct score: keyword-dominant, provenance and graph as boosters
    const total = keyword * 2.0 + provenance * 1.0 + graph * 3.0 + lexical * 0.5;

    return {
      candidate: c,
      score: total,
      breakdown: { keyword, graph, provenance, lexical, rrf_fused: 0 },
    };
  });

  return scored
    .filter((s) => s.score > 0 && s.breakdown.keyword > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.store ? 20 : 8);
}

/**
 * Archive-internal RRF fusion pipeline.
 *
 * Combines 4 ranking dimensions via Reciprocal Rank Fusion.
 * Use this only for archive-internal result merging — NOT as the primary
 * truth query path. Call queryTruthDirect() first for truth-first recall.
 */
export function searchTruthKernel(
  query: string,
  options: SearchPipelineOptions,
): ScoredResult[] {
  const { store, recallWeights, graphDepths, extraRankedLists } = options;
  const searchOpts: SearchOptions = { limit: 40 };
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) return [];

  const tokens = tokenize(normalizedQuery);

  // Step 1: Gather all candidates from truth tables
  const candidates = gatherCandidates(store, searchOpts);

  if (candidates.length === 0) return [];

  // Step 2: Score on each dimension independently
  const keywordRanked = rankByKeyword(candidates, tokens, store);
  const graphRanked = rankByGraph(candidates, graphDepths);
  const provenanceRanked = rankByProvenance(candidates, recallWeights);
  const lexicalRanked = rankByLexical(candidates, tokens);

  // Step 3: Build ranked lists for RRF
  const rankedLists: RankedList[] = [
    { dimension: 'keyword', results: keywordRanked },
    { dimension: 'lexical', results: lexicalRanked },
    { dimension: 'provenance', results: provenanceRanked },
  ];

  // Only include graph dimension if we have graph data
  if (graphDepths && graphDepths.size > 0) {
    rankedLists.push({ dimension: 'graph', results: graphRanked });
  }
  if (extraRankedLists && extraRankedLists.length > 0) {
    rankedLists.push(...extraRankedLists);
  }

  // Step 4: RRF fusion
  const fused = rrfFusion(rankedLists);

  // Step 5: Dedup
  const deduped = dedupResults(fused);

  return deduped.slice(0, searchOpts.limit ?? 20);
}

/**
 * Gather canonical truth candidates only: entities, decisions, preferences, memories.
 * Excludes evidence_bundles and knowledge_pages (those are derived, not canonical truth).
 */
function gatherTruthCandidates(
  store: SqliteTruthKernelStorage,
  limit = 60,
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];

  for (const entity of store.listActiveEntities(limit)) {
    candidates.push(toEntityCandidate(entity));
  }

  for (const decision of store.listActiveDecisions(limit)) {
    candidates.push(toDecisionCandidate(decision));
  }

  for (const pref of store.listActivePreferences(limit)) {
    candidates.push(toPreferenceCandidate(pref));
  }

  for (const mem of store.listActivePromotedMemories(limit)) {
    candidates.push(toMemoryCandidate(mem));
  }

  return candidates;
}

/**
 * Gather ALL candidates from truth kernel tables including derived data.
 * Used by archive-internal RRF pipeline which combines all sources.
 */
function gatherCandidates(
  store: SqliteTruthKernelStorage,
  opts: SearchOptions,
): SearchCandidate[] {
  const limit = (opts.limit ?? 20) * 3;
  const candidates = gatherTruthCandidates(store, limit);

  // Evidence bundles (archive-derived)
  for (const bundle of store.listEvidenceBundles(limit)) {
    for (const item of bundle.items) {
      candidates.push({
        id: item.evidence_id,
        title: item.title,
        content: `${item.title}\n${item.excerpt}`,
        source_type: 'evidence',
        source_system: String((item.metadata as Record<string, unknown>).source_system ?? 'archive'),
        source_kind: String((item.metadata as Record<string, unknown>).source_kind ?? 'evidence'),
        confidence: item.confidence,
        graph_depth: null,
        graph_weight: null,
        metadata: item.metadata as Readonly<Record<string, unknown>>,
      });
    }
  }

  // Knowledge pages (derived)
  for (const page of store.listKnowledgePages(limit)) {
    candidates.push({
      id: page.page.page_id,
      title: page.page.title,
      content: page.summary_markdown,
      source_type: 'page',
      source_system: 'truth-kernel',
      source_kind: 'page',
      confidence: null,
      graph_depth: null,
      graph_weight: null,
      metadata: { page_type: page.page.page_type, status: page.page.status },
    });
  }

  return candidates;
}

/**
 * Rank by keyword matching via FTS5 MATCH.
 *
 * Uses the waypath_fts index for BM25-based ranking when a store is provided.
 * Falls back to in-memory string.includes() scoring for candidates not in FTS
 * (e.g. evidence bundles, knowledge pages gathered at query time).
 */
function rankByKeyword(
  candidates: readonly SearchCandidate[],
  tokens: readonly string[],
  store?: SqliteTruthKernelStorage,
): SearchCandidate[] {
  if (tokens.length === 0) return [...candidates];

  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  // FTS5 path: use BM25 ranking from the index
  if (store) {
    const query = tokens.join(' ');
    const ftsHits = store.searchWaypathFts(query, candidates.length || 100);
    const ftsScored: { candidate: SearchCandidate; score: number }[] = [];
    const ftsMatchedIds = new Set<string>();

    for (const hit of ftsHits) {
      const c = candidateMap.get(hit.source_id);
      if (!c) continue;
      ftsMatchedIds.add(hit.source_id);
      ftsScored.push({ candidate: c, score: Math.max(1, ftsHits.length - ftsScored.length) });
    }

    // Fallback: score candidates not in FTS index (evidence, pages) via string match
    for (const c of candidates) {
      if (ftsMatchedIds.has(c.id)) continue;
      const titleLower = c.title.toLowerCase();
      const contentLower = c.content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (titleLower.includes(token)) score += 3;
        if (contentLower.includes(token)) score += 1;
      }
      if (score > 0) ftsScored.push({ candidate: c, score: score * 0.0001 });
    }

    return ftsScored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.candidate);
  }

  // Pure in-memory fallback (no store)
  const scored = candidates.map((c) => {
    const titleLower = c.title.toLowerCase();
    const contentLower = c.content.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (titleLower.includes(token)) score += 3;
      if (contentLower.includes(token)) score += 1;
    }
    return { candidate: c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);
}

/**
 * Rank by graph proximity — closer to seed entities = higher rank.
 * Depth 0 (seed) = highest, depth 1 = high, depth 2+ = progressively lower.
 */
function rankByGraph(
  candidates: readonly SearchCandidate[],
  graphDepths: ReadonlyMap<string, number> | undefined,
): SearchCandidate[] {
  if (!graphDepths || graphDepths.size === 0) return [];

  const scored = candidates.map((c) => {
    // Check if this candidate's ID matches a graph entity
    const depth = graphDepths.get(c.id);

    // Also check if metadata has a scope_entity_id that's in the graph
    const scopeId = c.metadata.scope_entity_id as string | undefined;
    const scopeDepth = scopeId ? graphDepths.get(scopeId) : undefined;

    const subjectRef = c.metadata.subject_ref as string | undefined;
    const subjectDepth = subjectRef ? graphDepths.get(subjectRef) : undefined;

    const bestDepth = minDefined(depth, scopeDepth, subjectDepth);
    if (bestDepth === undefined) return { candidate: c, score: 0 };

    // Score inversely proportional to depth: 1/(1+depth)
    const score = 1 / (1 + bestDepth);
    return { candidate: c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);
}

/**
 * Rank by provenance — source system/kind weights determine priority.
 * truth-kernel > jarvis-brain-db > jarvis-memory-db > demo.
 */
function rankByProvenance(
  candidates: readonly SearchCandidate[],
  overrides?: RecallWeightOverrides,
): SearchCandidate[] {
  const scored = candidates.map((c) => {
    const systemWeight = overrides?.sourceSystems?.[c.source_system]
      ?? DEFAULT_SOURCE_SYSTEM_WEIGHTS[c.source_system]
      ?? 0.5;
    const kindWeight = overrides?.sourceKinds?.[c.source_kind]
      ?? DEFAULT_SOURCE_KIND_WEIGHTS[c.source_kind]
      ?? 0.4;
    const confidenceBoost = c.confidence ?? 0;

    const score = systemWeight + kindWeight + confidenceBoost;
    return { candidate: c, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);
}

/**
 * Rank by lexical token overlap — simple fallback scoring.
 */
function rankByLexical(
  candidates: readonly SearchCandidate[],
  tokens: readonly string[],
): SearchCandidate[] {
  if (tokens.length === 0) return [...candidates];

  const scored = candidates.map((c) => {
    const titleLower = c.title.toLowerCase();
    const contentLower = c.content.toLowerCase();
    let matchCount = 0;
    let titleBonus = 0;
    for (const token of tokens) {
      const inTitle = titleLower.includes(token);
      const inContent = contentLower.includes(token);
      if (inTitle || inContent) matchCount++;
      if (inTitle) titleBonus += 0.5;
    }
    const coverage = matchCount / tokens.length;
    return { candidate: c, score: coverage + titleBonus };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);
}

function tokenize(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1); // Skip single-char tokens
}

function matchesTokens(text: string, tokens: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function toEntityCandidate(
  entity: TruthEntityRecord,
): SearchCandidate {
  return {
    id: entity.entity_id,
    title: entity.name,
    content: `${entity.name} (${entity.entity_type}): ${entity.summary}`,
    source_type: 'entity',
    source_system: 'truth-kernel',
    source_kind: 'entity',
    confidence: null,
    graph_depth: null,
    graph_weight: null,
    metadata: { entity_type: entity.entity_type },
  };
}

function toDecisionCandidate(
  decision: TruthDecisionRecord,
): SearchCandidate {
  return {
    id: decision.decision_id,
    title: decision.title,
    content: `${decision.title}: ${decision.statement}`,
    source_type: 'decision',
    source_system: 'truth-kernel',
    source_kind: 'decision',
    confidence: null,
    graph_depth: null,
    graph_weight: null,
    metadata: { scope_entity_id: decision.scope_entity_id },
  };
}

function toPreferenceCandidate(
  preference: TruthPreferenceRecord,
): SearchCandidate {
  return {
    id: preference.preference_id,
    title: `${preference.key}=${preference.value}`,
    content: `Preference ${preference.key}=${preference.value} (${preference.strength}) for ${preference.subject_ref ?? 'global'}`,
    source_type: 'preference',
    source_system: 'truth-kernel',
    source_kind: 'preference',
    confidence: null,
    graph_depth: null,
    graph_weight: null,
    metadata: { strength: preference.strength, subject_ref: preference.subject_ref },
  };
}

function toMemoryCandidate(
  memory: TruthPromotedMemoryRecord,
): SearchCandidate {
  return {
    id: memory.memory_id,
    title: memory.summary,
    content: `${memory.summary}\n${memory.content}`,
    source_type: 'memory',
    source_system: 'truth-kernel',
    source_kind: 'memory',
    confidence: null,
    graph_depth: null,
    graph_weight: null,
    metadata: { memory_type: memory.memory_type, access_tier: memory.access_tier },
  };
}

function loadTruthDirectCandidates(
  store: SqliteTruthKernelStorage,
  query: string,
  tokens: readonly string[],
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const seen = new Set<string>();

  for (const hit of store.searchWaypathFts(query, 80)) {
    if (seen.has(hit.source_id)) continue;

    if (hit.source_table === 'entities') {
      const entity = store.getEntity(hit.source_id);
      if (!entity) continue;
      seen.add(hit.source_id);
      candidates.push(toEntityCandidate(entity));
      continue;
    }

    if (hit.source_table === 'decisions') {
      const decision = store.getDecision(hit.source_id);
      if (!decision) continue;
      seen.add(hit.source_id);
      candidates.push(toDecisionCandidate(decision));
      continue;
    }

    const memory = store.getPromotedMemory(hit.source_id);
    if (!memory) continue;
    seen.add(hit.source_id);
    candidates.push(toMemoryCandidate(memory));
  }

  for (const preference of store.listActivePreferences(40)) {
    const text = `${preference.key} ${preference.value} ${preference.subject_ref ?? ''}`;
    if (!matchesTokens(text, tokens)) {
      continue;
    }
    if (seen.has(preference.preference_id)) {
      continue;
    }
    seen.add(preference.preference_id);
    candidates.push(toPreferenceCandidate(preference));
  }

  return candidates;
}

function minDefined(...values: (number | undefined)[]): number | undefined {
  let min: number | undefined;
  for (const v of values) {
    if (v !== undefined && (min === undefined || v < min)) {
      min = v;
    }
  }
  return min;
}
