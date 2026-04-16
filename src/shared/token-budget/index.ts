// Token-budget module: score, rank, and select memory candidates
// within a model-tier-aware token budget.

// --- Types ---

export type MemoryType = 'profile' | 'durable-fact' | 'task-state' | 'preferences' | 'ephemeral';

export type ModelTier = 'opus-1m' | 'opus' | 'sonnet' | 'haiku';

export interface BudgetCandidate {
  readonly id: string;
  readonly content: string;
  readonly memoryType: MemoryType;
  readonly relevanceScore: number;   // 0-1
  readonly freshnessScore: number;   // 0-1 (computed by computeFreshness)
  readonly importanceScore: number;  // 0-1
  readonly accessFrequency: number;  // 0-1
  readonly updatedAt?: string;       // ISO timestamp
}

export interface ScoredCandidate {
  readonly candidate: BudgetCandidate;
  readonly tokenEstimate: number;
  readonly finalScore: number;
  readonly density: number;  // finalScore / tokenEstimate
}

export interface SelectionResult {
  readonly selected: readonly ScoredCandidate[];
  readonly excluded: readonly ScoredCandidate[];
  readonly totalTokens: number;
  readonly budgetLimit: number;
  readonly saturationGap: boolean;  // true if all candidates fit
}

export interface TypeBudgetLimits {
  readonly profile?: number;
  readonly 'durable-fact'?: number;
  readonly 'task-state'?: number;
  readonly preferences?: number;
  readonly ephemeral?: number;
}

export interface SelectionOptions {
  readonly typeBudgets?: TypeBudgetLimits;
}

// --- Constants ---

const MODEL_BUDGETS: Readonly<Record<ModelTier, number>> = {
  'opus-1m': 80_000,
  'opus': 40_000,
  'sonnet': 24_000,
  'haiku': 12_000,
};

// Score weights (sum to 1.0)
const WEIGHT_RELEVANCE = 0.40;
const WEIGHT_FRESHNESS = 0.25;
const WEIGHT_IMPORTANCE = 0.20;
const WEIGHT_ACCESS = 0.15;

// Freshness decay half-lives in hours by MemoryType
const FRESHNESS_HALF_LIFE: Readonly<Record<MemoryType, number>> = {
  'profile': Infinity,
  'durable-fact': Infinity,
  'task-state': 24,
  'preferences': 168,   // 1 week
  'ephemeral': 4,
};

// --- Scoring functions ---

// CJK Unicode ranges for multi-byte token estimation
const CJK_RANGE = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

export function estimateTokens(content: string): number {
  if (content.length === 0) return 1;
  // Korean/CJK: ~2.0 chars/token, English: ~4.0 chars/token
  // Sample first 200 chars to detect language mix ratio
  const sample = content.slice(0, 200);
  let cjkCount = 0;
  for (const ch of sample) {
    if (CJK_RANGE.test(ch)) cjkCount++;
  }
  const cjkRatio = sample.length > 0 ? cjkCount / sample.length : 0;
  // Blend: CJK portion at 2.0 chars/token, rest at 4.0
  const charsPerToken = 2.0 * cjkRatio + 4.0 * (1 - cjkRatio);
  return Math.max(1, Math.ceil(content.length / charsPerToken));
}

export function computeFreshness(memoryType: MemoryType, hoursOld: number): number {
  const halfLife = FRESHNESS_HALF_LIFE[memoryType];
  if (!Number.isFinite(halfLife)) return 1.0;
  if (hoursOld <= 0) return 1.0;
  // Exponential decay: 2^(-hoursOld / halfLife)
  return Math.pow(2, -hoursOld / halfLife);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreCandidate(candidate: BudgetCandidate): ScoredCandidate {
  const relevance = clamp01(candidate.relevanceScore);
  const freshness = clamp01(candidate.freshnessScore);
  const importance = clamp01(candidate.importanceScore);
  const access = clamp01(candidate.accessFrequency);

  const finalScore =
    relevance * WEIGHT_RELEVANCE +
    freshness * WEIGHT_FRESHNESS +
    importance * WEIGHT_IMPORTANCE +
    access * WEIGHT_ACCESS;

  const tokenEstimate = estimateTokens(candidate.content);
  const density = finalScore / tokenEstimate;

  return {
    candidate,
    tokenEstimate,
    finalScore,
    density,
  };
}

// --- Selection ---

export function selectMemories(
  candidates: readonly BudgetCandidate[],
  modelTier: ModelTier = 'opus-1m',
  options?: SelectionOptions,
): SelectionResult {
  const budgetLimit = MODEL_BUDGETS[modelTier];

  if (candidates.length === 0) {
    return { selected: [], excluded: [], totalTokens: 0, budgetLimit, saturationGap: true };
  }

  const scored = candidates.map(scoreCandidate);
  // Sort by density descending (greedy knapsack), break ties by finalScore then id
  const sorted = [...scored].sort((a, b) =>
    b.density - a.density || b.finalScore - a.finalScore || a.candidate.id.localeCompare(b.candidate.id),
  );

  const selected: ScoredCandidate[] = [];
  const excluded: ScoredCandidate[] = [];
  let totalTokens = 0;

  // Track per-type counts for type budget limits
  const typeCounts = new Map<MemoryType, number>();

  for (const item of sorted) {
    const newTotal = totalTokens + item.tokenEstimate;
    if (newTotal > budgetLimit) {
      excluded.push(item);
      continue;
    }

    // Check type budget limit
    if (options?.typeBudgets) {
      const typeLimit = options.typeBudgets[item.candidate.memoryType];
      if (typeLimit !== undefined) {
        const currentCount = typeCounts.get(item.candidate.memoryType) ?? 0;
        if (currentCount >= typeLimit) {
          excluded.push(item);
          continue;
        }
      }
    }

    selected.push(item);
    totalTokens = newTotal;
    typeCounts.set(
      item.candidate.memoryType,
      (typeCounts.get(item.candidate.memoryType) ?? 0) + 1,
    );
  }

  const saturationGap = excluded.length === 0;

  return { selected, excluded, totalTokens, budgetLimit, saturationGap };
}

// --- Explain / diagnostics ---

export interface ScoreBreakdown {
  readonly id: string;
  readonly memoryType: MemoryType;
  readonly relevance: number;
  readonly freshness: number;
  readonly importance: number;
  readonly access: number;
  readonly finalScore: number;
  readonly tokenEstimate: number;
  readonly density: number;
}

export function formatScoreBreakdown(scored: ScoredCandidate): ScoreBreakdown {
  const c = scored.candidate;
  return {
    id: c.id,
    memoryType: c.memoryType,
    relevance: clamp01(c.relevanceScore),
    freshness: clamp01(c.freshnessScore),
    importance: clamp01(c.importanceScore),
    access: clamp01(c.accessFrequency),
    finalScore: scored.finalScore,
    tokenEstimate: scored.tokenEstimate,
    density: scored.density,
  };
}

export interface SelectionSummary {
  readonly selectedCount: number;
  readonly excludedCount: number;
  readonly totalTokens: number;
  readonly budgetLimit: number;
  readonly saturationGap: boolean;
  readonly selected: readonly ScoreBreakdown[];
  readonly excluded: readonly ScoreBreakdown[];
}

export function formatSelectionResult(result: SelectionResult): SelectionSummary {
  return {
    selectedCount: result.selected.length,
    excludedCount: result.excluded.length,
    totalTokens: result.totalTokens,
    budgetLimit: result.budgetLimit,
    saturationGap: result.saturationGap,
    selected: result.selected.map(formatScoreBreakdown),
    excluded: result.excluded.map(formatScoreBreakdown),
  };
}

export interface JsonDiagnostics {
  readonly budgetLimit: number;
  readonly totalTokens: number;
  readonly saturationGap: boolean;
  readonly selectedCount: number;
  readonly excludedCount: number;
  readonly items: readonly ScoreBreakdown[];
}

export function toJsonDiagnostics(result: SelectionResult): JsonDiagnostics {
  return {
    budgetLimit: result.budgetLimit,
    totalTokens: result.totalTokens,
    saturationGap: result.saturationGap,
    selectedCount: result.selected.length,
    excludedCount: result.excluded.length,
    items: [...result.selected, ...result.excluded].map(formatScoreBreakdown),
  };
}
