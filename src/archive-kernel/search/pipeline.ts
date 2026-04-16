/**
 * Waypath Search Pipeline
 *
 * Combines 4 ranking dimensions via RRF fusion:
 * 1. Keyword
 * 2. Graph
 * 3. Provenance
 * 4. Lexical
 *
 * Then applies 4-layer dedup to produce final ranked results.
 */

import type { SqliteTruthKernelStorage } from '../../jarvis_fusion/truth-kernel/storage.js';
import type {
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from '../../jarvis_fusion/contracts.js';
import {
  toSourceKind,
  toSourceSystem,
  type RecallWeightOverrides,
  type SourceKind,
  type SourceSystem,
} from '../../contracts/index.js';
import type { SearchCandidate, ScoredResult, SearchOptions } from './types.js';
import type { RankedList } from './rrf.js';
import { rrfFusion } from './rrf.js';
import { dedupResults } from './dedup.js';
import { tokenize } from '../../shared/text.js';

export interface SearchPipelineOptions {
  readonly store: SqliteTruthKernelStorage;
  readonly recallWeights?: RecallWeightOverrides | undefined;
  /** Entity IDs to boost via graph scoring */
  readonly graphSeedEntityIds?: readonly string[] | undefined;
  /** Pre-computed graph depths: entity_id → depth from seed */
  readonly graphDepths?: ReadonlyMap<string, number> | undefined;
  /** Additional archive/evidence candidates gathered outside the truth store */
  readonly extraCandidates?: readonly SearchCandidate[] | undefined;
  /** Pre-ranked external candidate lists to merge via RRF */
  readonly extraRankedLists?: readonly RankedList[] | undefined;
}

const DEFAULT_SOURCE_SYSTEM_WEIGHTS: Readonly<Partial<Record<SourceSystem, number>>> = {
  'truth-kernel': 1.1,
  'jarvis-brain-db': 0.95,
  'jarvis-memory-db': 0.85,
  mempalace: 0.8,
  'demo-source': 0.3,
};

const DEFAULT_SOURCE_KIND_WEIGHTS: Readonly<Partial<Record<SourceKind, number>>> = {
  decision: 0.9,
  preference: 0.8,
  relationship: 0.7,
  memory: 0.6,
  entity: 0.55,
  evidence: 0.5,
};

const ARCHIVE_SOURCE_SYSTEMS = new Set<SourceSystem>([
  'jarvis-memory-db',
  'mempalace',
  'local-archive',
]);

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

  // Build FTS5 keyword scores for truth candidates using min-max normalized BM25.
  const ftsKeywordScores = new Map<string, number>();
  const ftsHits = store.searchWaypathFts(normalizedQuery, Math.max(candidates.length * 2, 40));
  if (ftsHits.length > 0) {
    const ranks = ftsHits.map((h) => Math.abs(h.rank)); // FTS5 rank is negative
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const range = maxRank - minRank || 1; // avoid division by zero
    for (let i = 0; i < ftsHits.length; i++) {
      const hit = ftsHits[i];
      if (!hit) continue;
      const normalized = 1 - (Math.abs(hit.rank) - minRank) / range; // higher = better
      ftsKeywordScores.set(hit.source_id, Math.max(0.01, normalized));
    }
  }

  // Score each candidate with a direct combined score (no RRF)
  const scored: ScoredResult[] = candidates.map((c) => {
    const titleLower = c.title.toLowerCase();
    const contentLower = c.content.toLowerCase();

    // Keyword score: prefer FTS5 BM25, fallback to string match
    let keyword = ftsKeywordScores.get(c.id) ?? 0;
    if (keyword === 0) {
      for (const token of tokens) {
        if (matchesWordBoundary(titleLower, token)) keyword += 3;
        if (matchesWordBoundary(contentLower, token)) keyword += 1;
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
      const inTitle = matchesWordBoundary(titleLower, token);
      const inContent = matchesWordBoundary(contentLower, token);
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
 * Archive/evidence RRF fusion pipeline.
 *
 * Canonical truth results must be queried via queryTruthDirect().
 */
export function searchTruthKernel(
  query: string,
  options: SearchPipelineOptions,
): ScoredResult[] {
  const { store, recallWeights, graphDepths, extraCandidates, extraRankedLists } = options;
  const searchOpts: SearchOptions = { limit: 40 };
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) return [];

  const tokens = tokenize(normalizedQuery);

  // Step 1: Gather archive/evidence candidates.
  const candidates = dedupeCandidates([
    ...gatherCandidates(store, searchOpts),
    ...(extraCandidates ?? []),
  ]);

  if (candidates.length === 0 && (!extraRankedLists || extraRankedLists.length === 0)) {
    return [];
  }

  // Step 2: Score on each dimension independently
  const keywordRanked = rankByKeyword(candidates, tokens, store);
  const graphRanked = rankByGraph(candidates, graphDepths);
  const provenanceRanked = rankByProvenance(candidates, recallWeights);
  const lexicalRanked = rankByLexical(candidates, tokens);

  // Step 3: Build ranked lists for RRF — always include all 4 dimensions
  // so RRF fusion weights remain consistent regardless of graph data availability.
  const rankedLists: RankedList[] = [
    { dimension: 'keyword', results: keywordRanked },
    { dimension: 'lexical', results: lexicalRanked },
    { dimension: 'provenance', results: provenanceRanked },
    { dimension: 'graph', results: graphRanked },
  ];
  if (extraRankedLists && extraRankedLists.length > 0) {
    rankedLists.push(...extraRankedLists);
  }

  // Step 4: RRF fusion across archive/evidence candidates only.
  const archiveResults = candidates.length > 0 || (extraRankedLists?.length ?? 0) > 0
    ? rrfFusion(rankedLists)
    : [];

  return dedupResults(archiveResults, { originalCount: archiveResults.length }).slice(0, searchOpts.limit ?? 20);
}

/**
 * Gather archive/evidence candidates persisted outside canonical truth tables.
 */
function gatherCandidates(
  store: SqliteTruthKernelStorage,
  opts: SearchOptions,
): SearchCandidate[] {
  const limit = (opts.limit ?? 20) * 3;
  const candidates: SearchCandidate[] = [];

  // Persisted evidence bundles from archive sources.
  for (const bundle of store.listEvidenceBundles(limit)) {
    for (const item of bundle.items) {
      const sourceSystem = toSourceSystem(
        (item.metadata as Record<string, unknown>).source_system,
        'local-archive',
      );
      if (!ARCHIVE_SOURCE_SYSTEMS.has(sourceSystem)) {
        continue;
      }
      candidates.push({
        id: item.evidence_id,
        title: item.title,
        content: `${item.title}\n${item.excerpt}`,
        source_type: 'evidence',
        source_system: sourceSystem,
        source_kind: toSourceKind(
          (item.metadata as Record<string, unknown>).source_kind,
          'evidence',
        ),
        confidence: item.confidence,
        graph_depth: null,
        graph_weight: null,
        metadata: item.metadata as Readonly<Record<string, unknown>>,
      });
    }
  }

  return candidates;
}

function dedupeCandidates(candidates: readonly SearchCandidate[]): SearchCandidate[] {
  const deduped = new Map<string, SearchCandidate>();
  for (const candidate of candidates) {
    deduped.set(candidate.id, candidate);
  }
  return [...deduped.values()];
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

    // Fallback: score candidates not in FTS index (evidence, pages) via word boundary match
    for (const c of candidates) {
      if (ftsMatchedIds.has(c.id)) continue;
      const titleLower = c.title.toLowerCase();
      const contentLower = c.content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (matchesWordBoundary(titleLower, token)) score += 3;
        if (matchesWordBoundary(contentLower, token)) score += 1;
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
      if (matchesWordBoundary(titleLower, token)) score += 3;
      if (matchesWordBoundary(contentLower, token)) score += 1;
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
      const inTitle = matchesWordBoundary(titleLower, token);
      const inContent = matchesWordBoundary(contentLower, token);
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

function matchesTokens(text: string, tokens: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return tokens.some((token) => matchesWordBoundary(haystack, token));
}

interface CandidateProvenance {
  readonly source_system: SourceSystem;
  readonly source_kind: SourceKind;
  readonly source_ref: string;
  readonly confidence: number | null;
}

function safeParseState(stateJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stateJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch (error) {
    console.warn(`[waypath] safeParseState: failed to parse state_json: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function resolveCandidateProvenance(
  provenanceRecord: ReturnType<SqliteTruthKernelStorage['getProvenance']> | undefined,
  fallbackKind: SourceKind,
  fallbackRef: string,
): CandidateProvenance {
  return {
    source_system: provenanceRecord?.source_system ?? 'truth-kernel',
    source_kind: provenanceRecord?.source_kind ?? fallbackKind,
    source_ref: provenanceRecord?.source_ref ?? fallbackRef,
    confidence: provenanceRecord?.confidence ?? null,
  };
}

function toEntityCandidate(
  store: SqliteTruthKernelStorage,
  entity: TruthEntityRecord,
): SearchCandidate {
  const entityState = safeParseState(entity.state_json);
  const provenanceId = typeof entityState.provenance_id === 'string' ? entityState.provenance_id : null;
  const provenance = resolveCandidateProvenance(
    provenanceId ? store.getProvenance(provenanceId) : undefined,
    'entity',
    `truth:${entity.entity_id}`,
  );
  return {
    id: entity.entity_id,
    title: entity.name,
    content: `${entity.name} (${entity.entity_type}): ${entity.summary}`,
    source_type: 'entity',
    source_system: provenance.source_system,
    source_kind: provenance.source_kind,
    confidence: provenance.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      entity_type: entity.entity_type,
      source_system: provenance.source_system,
      source_kind: provenance.source_kind,
      source_ref: provenance.source_ref,
    },
  };
}

function toDecisionCandidate(
  store: SqliteTruthKernelStorage,
  decision: TruthDecisionRecord,
): SearchCandidate {
  const provenance = resolveCandidateProvenance(
    decision.provenance_id ? store.getProvenance(decision.provenance_id) : undefined,
    'decision',
    `truth:${decision.decision_id}`,
  );
  return {
    id: decision.decision_id,
    title: decision.title,
    content: `${decision.title}: ${decision.statement}`,
    source_type: 'decision',
    source_system: provenance.source_system,
    source_kind: provenance.source_kind,
    confidence: provenance.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      scope_entity_id: decision.scope_entity_id,
      source_system: provenance.source_system,
      source_kind: provenance.source_kind,
      source_ref: provenance.source_ref,
    },
  };
}

function toPreferenceCandidate(
  store: SqliteTruthKernelStorage,
  preference: TruthPreferenceRecord,
): SearchCandidate {
  const provenance = resolveCandidateProvenance(
    preference.provenance_id ? store.getProvenance(preference.provenance_id) : undefined,
    'preference',
    `truth:${preference.preference_id}`,
  );
  return {
    id: preference.preference_id,
    title: `${preference.key}=${preference.value}`,
    content: `Preference ${preference.key}=${preference.value} (${preference.strength}) for ${preference.subject_ref ?? 'global'}`,
    source_type: 'preference',
    source_system: provenance.source_system,
    source_kind: provenance.source_kind,
    confidence: provenance.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      strength: preference.strength,
      subject_ref: preference.subject_ref,
      source_system: provenance.source_system,
      source_kind: provenance.source_kind,
      source_ref: provenance.source_ref,
    },
  };
}

function toMemoryCandidate(
  store: SqliteTruthKernelStorage,
  memory: TruthPromotedMemoryRecord,
): SearchCandidate {
  const provenance = resolveCandidateProvenance(
    memory.provenance_id ? store.getProvenance(memory.provenance_id) : undefined,
    'memory',
    `truth:${memory.memory_id}`,
  );
  return {
    id: memory.memory_id,
    title: memory.summary,
    content: `${memory.summary}\n${memory.content}`,
    source_type: 'memory',
    source_system: provenance.source_system,
    source_kind: provenance.source_kind,
    confidence: provenance.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      memory_type: memory.memory_type,
      access_tier: memory.access_tier,
      source_system: provenance.source_system,
      source_kind: provenance.source_kind,
      source_ref: provenance.source_ref,
    },
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
      candidates.push(toEntityCandidate(store, entity));
      continue;
    }

    if (hit.source_table === 'decisions') {
      const decision = store.getDecision(hit.source_id);
      if (!decision) continue;
      seen.add(hit.source_id);
      candidates.push(toDecisionCandidate(store, decision));
      continue;
    }

    const memory = store.getPromotedMemory(hit.source_id);
    if (!memory) continue;
    seen.add(hit.source_id);
    candidates.push(toMemoryCandidate(store, memory));
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
    candidates.push(toPreferenceCandidate(store, preference));
  }

  return candidates;
}

function matchesWordBoundary(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, 'i').test(haystack);
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
