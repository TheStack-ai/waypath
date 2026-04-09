import type { RecallWeightOverrides } from '../../contracts/index.js';

export interface RetrievalCandidate {
  readonly title?: string;
  readonly excerpt?: string;
  readonly sourceRef?: string;
  readonly provenanceConfidence?: number | null;
  readonly sourceSystem?: string | null;
  readonly sourceKind?: string | null;
  readonly graphRelevance?: number | null;
  readonly baseScore?: number | null;
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
  readonly weights?: RecallWeightOverrides;
  readonly vectorHook?: RetrievalVectorHook<TCandidate>;
}

export interface RetrievalStrategy<TCandidate extends RetrievalCandidate = RetrievalCandidate> {
  readonly query: string;
  readonly tokens: readonly string[];
  score(candidate: TCandidate): RetrievalScoreBreakdown;
}

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
  sourceSystem: string | null | undefined,
  weights: RecallWeightOverrides | undefined,
): number {
  const configured = sourceSystem ? weights?.sourceSystems?.[sourceSystem] : undefined;
  if (configured !== undefined) return configured;

  switch (sourceSystem) {
    case 'truth-kernel':
      return 1.1;
    case 'jarvis-brain-db':
      return 0.95;
    case 'jarvis-memory-db':
      return 0.85;
    case 'demo-source':
      return 0.3;
    default:
      return sourceSystem ? 0.5 : 0.4;
  }
}

function sourceKindWeight(
  sourceKind: string | null | undefined,
  weights: RecallWeightOverrides | undefined,
): number {
  const configured = sourceKind ? weights?.sourceKinds?.[sourceKind] : undefined;
  if (configured !== undefined) return configured;

  switch (sourceKind) {
    case 'decision':
      return 0.8;
    case 'preference':
      return 0.75;
    case 'relationship':
      return 0.65;
    case 'memory':
      return 0.6;
    case 'database':
      return 0.35;
    default:
      return sourceKind ? 0.45 : 0.25;
  }
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
    if (haystack.includes(token)) {
      score += title.includes(token) ? 3 : 1;
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
      const sourceSystem = sourceSystemWeight(candidate.sourceSystem, options.weights);
      const sourceKind = sourceKindWeight(candidate.sourceKind, options.weights);
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
