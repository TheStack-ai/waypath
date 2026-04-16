import type { RecallWeightOverrides, SourceKind, SourceSystem } from '../../contracts/index.js';

export interface RetrievalCandidate {
  readonly title?: string;
  readonly excerpt?: string;
  readonly sourceRef?: string;
  readonly provenanceConfidence?: number | null | undefined;
  readonly sourceSystem?: SourceSystem | null | undefined;
  readonly sourceKind?: SourceKind | null | undefined;
  readonly graphRelevance?: number | null | undefined;
  readonly baseScore?: number | null | undefined;
}

export interface RetrievalScoreBreakdown {
  readonly base: number;
  readonly lexical: number;
  readonly provenance: number;
  readonly sourceSystem: number;
  readonly sourceKind: number;
  readonly graphRelevance: number;
  readonly vector: number;
  readonly total: number;
}

export interface RetrievalScoreContext<TCandidate extends RetrievalCandidate = RetrievalCandidate> {
  readonly query: string;
  readonly tokens: readonly string[];
  readonly candidate: TCandidate;
}

export type RetrievalVectorHook<TCandidate extends RetrievalCandidate = RetrievalCandidate> = (
  context: RetrievalScoreContext<TCandidate>,
) => number;

export interface RetrievalStrategyOptions<TCandidate extends RetrievalCandidate = RetrievalCandidate> {
  readonly query?: string;
  readonly weights?: RecallWeightOverrides | undefined;
  readonly profile?: RetrievalWeightProfile | undefined;
  readonly vectorHook?: RetrievalVectorHook<TCandidate>;
}

export interface RetrievalStrategy<TCandidate extends RetrievalCandidate = RetrievalCandidate> {
  readonly query: string;
  readonly tokens: readonly string[];
  score(candidate: TCandidate): RetrievalScoreBreakdown;
}

export interface RetrievalWeightProfile {
  readonly sourceSystems?: Readonly<Partial<Record<SourceSystem, number>>>;
  readonly sourceKinds?: Readonly<Partial<Record<SourceKind, number>>>;
  readonly missingSourceSystemWeight?: number;
  readonly unknownSourceSystemWeight?: number;
  readonly missingSourceKindWeight?: number;
  readonly unknownSourceKindWeight?: number;
}

const DEFAULT_SOURCE_SYSTEM_WEIGHTS: Readonly<Partial<Record<SourceSystem, number>>> = {
  'truth-kernel': 1.1,
  'jarvis-brain-db': 0.95,
  'jarvis-memory-db': 0.85,
  'demo-source': 0.3,
};

const DEFAULT_SOURCE_KIND_WEIGHTS: Readonly<Partial<Record<SourceKind, number>>> = {
  decision: 0.8,
  preference: 0.75,
  relationship: 0.65,
  memory: 0.6,
  database: 0.35,
};

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sourceSystemWeight(
  sourceSystem: SourceSystem | null | undefined,
  weights: RecallWeightOverrides | undefined,
  profile: RetrievalWeightProfile | undefined,
): number {
  const configured = sourceSystem ? weights?.sourceSystems?.[sourceSystem] : undefined;
  if (configured !== undefined) return configured;
  const profiled = sourceSystem ? profile?.sourceSystems?.[sourceSystem] : undefined;
  if (profiled !== undefined) return profiled;
  const builtin = sourceSystem ? DEFAULT_SOURCE_SYSTEM_WEIGHTS[sourceSystem] : undefined;
  if (builtin !== undefined) return builtin;

  return sourceSystem
    ? profile?.unknownSourceSystemWeight ?? 0.5
    : profile?.missingSourceSystemWeight ?? 0.4;
}

function sourceKindWeight(
  sourceKind: SourceKind | null | undefined,
  weights: RecallWeightOverrides | undefined,
  profile: RetrievalWeightProfile | undefined,
): number {
  const configured = sourceKind ? weights?.sourceKinds?.[sourceKind] : undefined;
  if (configured !== undefined) return configured;
  const profiled = sourceKind ? profile?.sourceKinds?.[sourceKind] : undefined;
  if (profiled !== undefined) return profiled;
  const builtin = sourceKind ? DEFAULT_SOURCE_KIND_WEIGHTS[sourceKind] : undefined;
  if (builtin !== undefined) return builtin;

  return sourceKind
    ? profile?.unknownSourceKindWeight ?? 0.45
    : profile?.missingSourceKindWeight ?? 0.25;
}

function matchesWordBoundary(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, 'i').test(haystack);
}

function lexicalScore(candidate: RetrievalCandidate, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;

  const title = candidate.title?.toLowerCase() ?? '';
  const haystack = [candidate.title, candidate.excerpt, candidate.sourceRef]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (matchesWordBoundary(haystack, token)) {
      score += matchesWordBoundary(title, token) ? 3 : 1;
    }
  }
  return score;
}

export function createRetrievalStrategy<TCandidate extends RetrievalCandidate = RetrievalCandidate>(
  options: RetrievalStrategyOptions<TCandidate> = {},
): RetrievalStrategy<TCandidate> {
  const query = options.query?.trim() ?? '';
  const tokens = tokenize(query);

  return {
    query,
    tokens,
    score(candidate: TCandidate): RetrievalScoreBreakdown {
      const lexical = lexicalScore(candidate, tokens);
      const provenance = finiteOrZero(candidate.provenanceConfidence);
      const sourceSystem = sourceSystemWeight(candidate.sourceSystem, options.weights, options.profile);
      const sourceKind = sourceKindWeight(candidate.sourceKind, options.weights, options.profile);
      const graphRelevance = finiteOrZero(candidate.graphRelevance);
      const base = finiteOrZero(candidate.baseScore);
      const vector = finiteOrZero(options.vectorHook?.({ query, tokens, candidate }));
      const matched = tokens.length === 0 || lexical > 0 || vector > 0;

      return {
        base,
        lexical,
        provenance,
        sourceSystem,
        sourceKind,
        graphRelevance,
        vector,
        total: matched
          ? base + lexical + provenance + sourceSystem + sourceKind + graphRelevance + vector
          : 0,
      };
    },
  };
}
