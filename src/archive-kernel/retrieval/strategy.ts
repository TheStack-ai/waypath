import type { RecallWeightOverrides } from '../../contracts/index.js';

export type RetrievalStrategyProfile = 'archive-recall' | 'session-runtime';

export interface RetrievalVectorHookInput {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly excerpt: string;
  readonly sourceRef: string;
  readonly tokens: readonly string[];
}

export interface RetrievalVectorHook {
  score(input: RetrievalVectorHookInput): number;
}

export interface RetrievalStrategyOptions {
  readonly profile?: RetrievalStrategyProfile;
  readonly weights?: RecallWeightOverrides;
  readonly lexicalWeight?: number;
  readonly vectorHook?: RetrievalVectorHook;
}

export interface RetrievalScoreInput {
  readonly id: string;
  readonly kind: string;
  readonly title?: string;
  readonly excerpt?: string;
  readonly sourceRef?: string;
  readonly sourceSystem?: string | null;
  readonly sourceKind?: string | null;
  readonly confidence?: number | null;
  readonly baseline?: number;
  readonly graphRelevance?: number;
  readonly enableLexical?: boolean;
  readonly enableSourceWeight?: boolean;
  readonly enableProvenance?: boolean;
  readonly enableVectorHook?: boolean;
}

export interface RetrievalScoreBreakdown {
  readonly baseline: number;
  readonly lexical: number;
  readonly provenance: number;
  readonly sourceWeight: number;
  readonly graphRelevance: number;
  readonly vector: number;
  readonly total: number;
}

export interface RetrievalStrategy {
  score(input: RetrievalScoreInput, query?: string | readonly string[]): RetrievalScoreBreakdown;
}

interface RetrievalProfileDefaults {
  readonly lexicalWeight: number;
  readonly requireLexicalMatch: boolean;
  readonly missingSourceSystemWeight: number;
  readonly unknownSourceSystemWeight: number;
  readonly missingSourceKindWeight: number;
  readonly unknownSourceKindWeight: number;
  readonly sourceSystemWeights: Readonly<Record<string, number>>;
  readonly sourceKindWeights: Readonly<Record<string, number>>;
}

const PROFILE_DEFAULTS: Readonly<Record<RetrievalStrategyProfile, RetrievalProfileDefaults>> = {
  'archive-recall': {
    lexicalWeight: 1,
    requireLexicalMatch: true,
    missingSourceSystemWeight: 0.4,
    unknownSourceSystemWeight: 0.5,
    missingSourceKindWeight: 0.25,
    unknownSourceKindWeight: 0.45,
    sourceSystemWeights: {
      'truth-kernel': 1.1,
      'jarvis-brain-db': 0.95,
      'jarvis-memory-db': 0.85,
      'demo-source': 0.3,
    },
    sourceKindWeights: {
      decision: 0.8,
      preference: 0.75,
      relationship: 0.65,
      memory: 0.6,
      database: 0.35,
    },
  },
  'session-runtime': {
    lexicalWeight: 0,
    requireLexicalMatch: false,
    missingSourceSystemWeight: 0.5,
    unknownSourceSystemWeight: 0.6,
    missingSourceKindWeight: 0.3,
    unknownSourceKindWeight: 0.5,
    sourceSystemWeights: {
      'truth-kernel': 1.2,
      'jarvis-brain-db': 0.95,
      'jarvis-memory-db': 0.85,
      'demo-source': 0.35,
    },
    sourceKindWeights: {
      decision: 0.8,
      preference: 0.75,
      relationship: 0.7,
      memory: 0.65,
      database: 0.4,
    },
  },
};

function tokenizeQuery(query: string | readonly string[] | undefined): string[] {
  if (!query) return [];
  const tokens = typeof query === 'string' ? query.split(/\s+/u) : [...query];
  return tokens
    .map((token: string) => token.trim().toLowerCase())
    .filter((token: string) => token.length > 0);
}

function resolveSourceSystemWeight(
  sourceSystem: string | null | undefined,
  defaults: RetrievalProfileDefaults,
  overrides: RecallWeightOverrides | undefined,
): number {
  const configured = sourceSystem ? overrides?.sourceSystems?.[sourceSystem] : undefined;
  if (configured !== undefined) return configured;
  if (!sourceSystem) return defaults.missingSourceSystemWeight;
  return defaults.sourceSystemWeights[sourceSystem] ?? defaults.unknownSourceSystemWeight;
}

function resolveSourceKindWeight(
  sourceKind: string | null | undefined,
  defaults: RetrievalProfileDefaults,
  overrides: RecallWeightOverrides | undefined,
): number {
  const configured = sourceKind ? overrides?.sourceKinds?.[sourceKind] : undefined;
  if (configured !== undefined) return configured;
  if (!sourceKind) return defaults.missingSourceKindWeight;
  return defaults.sourceKindWeights[sourceKind] ?? defaults.unknownSourceKindWeight;
}

function lexicalScore(
  title: string,
  haystack: string,
  tokens: readonly string[],
  lexicalWeight: number,
): number {
  if (tokens.length === 0 || lexicalWeight === 0) return 0;

  const normalizedTitle = title.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) continue;
    score += normalizedTitle.includes(token) ? 3 : 1;
  }
  return score * lexicalWeight;
}

export function createRetrievalStrategy(options: RetrievalStrategyOptions = {}): RetrievalStrategy {
  const profile = options.profile ?? 'archive-recall';
  const defaults = PROFILE_DEFAULTS[profile];
  const lexicalWeight = options.lexicalWeight ?? defaults.lexicalWeight;

  return {
    score(input: RetrievalScoreInput, query?: string | readonly string[]): RetrievalScoreBreakdown {
      const title = input.title ?? '';
      const excerpt = input.excerpt ?? '';
      const sourceRef = input.sourceRef ?? '';
      const tokens = tokenizeQuery(query);
      const haystack = `${title}\n${excerpt}\n${sourceRef}`.toLowerCase();
      const lexical =
        input.enableLexical === false ? 0 : lexicalScore(title, haystack, tokens, lexicalWeight);
      const sourceWeight =
        input.enableSourceWeight === false
          ? 0
          : resolveSourceSystemWeight(input.sourceSystem, defaults, options.weights) +
            resolveSourceKindWeight(input.sourceKind, defaults, options.weights);
      const provenance =
        input.enableProvenance === false ? 0 : (input.confidence ?? 0.5);
      const vector =
        input.enableVectorHook === false || !options.vectorHook
          ? 0
          : options.vectorHook.score({
              id: input.id,
              kind: input.kind,
              title,
              excerpt,
              sourceRef,
              tokens,
            });
      const baseline = input.baseline ?? 0;
      const graphRelevance = input.graphRelevance ?? 0;
      const total =
        defaults.requireLexicalMatch && tokens.length > 0 && lexical === 0
          ? 0
          : baseline + lexical + provenance + sourceWeight + graphRelevance + vector;

      return {
        baseline,
        lexical,
        provenance,
        sourceWeight,
        graphRelevance,
        vector,
        total,
      };
    },
  };
}
