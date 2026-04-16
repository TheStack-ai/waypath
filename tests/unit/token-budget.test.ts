import { assert, assertEqual } from '../../src/shared/assert';
import {
  estimateTokens,
  computeFreshness,
  scoreCandidate,
  selectMemories,
  formatScoreBreakdown,
  formatSelectionResult,
  toJsonDiagnostics,
  type BudgetCandidate,
  type MemoryType,
} from '../../src/shared/token-budget/index.js';

function makeCandidate(overrides: Partial<BudgetCandidate> & { id: string; content: string }): BudgetCandidate {
  return {
    memoryType: 'durable-fact',
    relevanceScore: 0.5,
    freshnessScore: 0.8,
    importanceScore: 0.5,
    accessFrequency: 0.3,
    ...overrides,
  };
}

// --- Scoring tests ---

export function testEstimateTokensCharDiv4RoundedUp(): void {
  // 10 chars / 4 = 2.5 → ceil → 3
  assertEqual(estimateTokens('abcdefghij'), 3);
  // 4 chars → exactly 1
  assertEqual(estimateTokens('abcd'), 1);
  // 1 char → ceil(0.25) = 1
  assertEqual(estimateTokens('a'), 1);
  // empty → minimum 1
  assertEqual(estimateTokens(''), 1);
  // 5 chars → ceil(1.25) = 2
  assertEqual(estimateTokens('hello'), 2);
}

export function testComputeFreshnessNeverDecaysForProfileAndDurableFact(): void {
  assertEqual(computeFreshness('profile', 0), 1.0);
  assertEqual(computeFreshness('profile', 1000), 1.0);
  assertEqual(computeFreshness('profile', 999999), 1.0);
  assertEqual(computeFreshness('durable-fact', 0), 1.0);
  assertEqual(computeFreshness('durable-fact', 500), 1.0);
}

export function testComputeFreshnessDecaysForTaskState(): void {
  // task-state half-life = 24h
  const atHalfLife = computeFreshness('task-state', 24);
  // Should be approximately 0.5
  assert(Math.abs(atHalfLife - 0.5) < 0.001, `expected ~0.5 at half-life, got ${atHalfLife}`);
  const atDoubleHL = computeFreshness('task-state', 48);
  assert(atDoubleHL < atHalfLife, 'expected more decay after more hours');
  assert(atDoubleHL > 0, 'expected non-zero after 48h');
}

export function testComputeFreshnessNearZeroForEphemeralAfterManyHours(): void {
  // ephemeral half-life = 4h, after 40h = 10 half-lives → 2^(-10) ≈ 0.001
  const value = computeFreshness('ephemeral', 40);
  assert(value < 0.01, `expected near-0 for ephemeral after 40h, got ${value}`);
  assert(value > 0, 'should not be exactly zero');
}

export function testScoreCandidateCombinesSignals(): void {
  const candidate = makeCandidate({
    id: 'test',
    content: 'x'.repeat(100),
    relevanceScore: 1.0,
    freshnessScore: 1.0,
    importanceScore: 1.0,
    accessFrequency: 1.0,
  });
  const scored = scoreCandidate(candidate);
  // All weights sum to 1.0 → finalScore should be 1.0
  assert(Math.abs(scored.finalScore - 1.0) < 0.001, `expected finalScore=1.0, got ${scored.finalScore}`);
  assertEqual(scored.tokenEstimate, 25); // 100/4 = 25
  // density = 1.0 / 25 = 0.04
  assert(Math.abs(scored.density - 0.04) < 0.001, `expected density=0.04, got ${scored.density}`);
}

export function testScoreCandidateClampsInputs(): void {
  const candidate = makeCandidate({
    id: 'clamp',
    content: 'test',
    relevanceScore: 2.0,   // should clamp to 1.0
    freshnessScore: -0.5,  // should clamp to 0.0
    importanceScore: 1.5,  // should clamp to 1.0
    accessFrequency: -1.0, // should clamp to 0.0
  });
  const scored = scoreCandidate(candidate);
  // relevance=1.0*0.40 + freshness=0.0*0.25 + importance=1.0*0.20 + access=0.0*0.15 = 0.60
  assert(Math.abs(scored.finalScore - 0.60) < 0.001, `expected clamped finalScore=0.60, got ${scored.finalScore}`);
}

export function testScoreCandidateDensityIsScorePerToken(): void {
  const candidate = makeCandidate({
    id: 'dense',
    content: 'ab',  // 2 chars → 1 token
    relevanceScore: 0.8,
    freshnessScore: 0.6,
    importanceScore: 0.4,
    accessFrequency: 0.2,
  });
  const scored = scoreCandidate(candidate);
  const expectedScore = 0.8 * 0.40 + 0.6 * 0.25 + 0.4 * 0.20 + 0.2 * 0.15;
  assert(Math.abs(scored.density - expectedScore / scored.tokenEstimate) < 0.001,
    `expected density = finalScore/tokenEstimate`);
}

// --- Selection tests ---

export function testAllCandidatesFitSaturationGap(): void {
  const candidates: BudgetCandidate[] = [
    makeCandidate({ id: 'a', content: 'short' }),
    makeCandidate({ id: 'b', content: 'also short' }),
  ];
  const result = selectMemories(candidates, 'opus-1m');
  assertEqual(result.selected.length, 2);
  assertEqual(result.excluded.length, 0);
  assertEqual(result.saturationGap, true);
}

export function testBudgetExceededDensityGreedy(): void {
  // Create candidates where one is much denser
  const dense = makeCandidate({
    id: 'dense',
    content: 'hi',  // ~1 token, high density
    relevanceScore: 0.9,
    freshnessScore: 0.9,
    importanceScore: 0.9,
    accessFrequency: 0.9,
  });
  const fat = makeCandidate({
    id: 'fat',
    content: 'x'.repeat(200000),  // 50000 tokens
    relevanceScore: 0.9,
    freshnessScore: 0.9,
    importanceScore: 0.9,
    accessFrequency: 0.9,
  });
  // Use haiku budget (12000 tokens) so fat exceeds budget
  const result = selectMemories([dense, fat], 'haiku');
  assert(result.selected.some((s) => s.candidate.id === 'dense'), 'dense candidate should be selected');
  assert(result.excluded.some((s) => s.candidate.id === 'fat'), 'fat candidate should be excluded');
}

export function testTypeBudgetLimits(): void {
  const candidates: BudgetCandidate[] = [
    makeCandidate({ id: 'e1', content: 'ephemeral 1', memoryType: 'ephemeral', relevanceScore: 0.9 }),
    makeCandidate({ id: 'e2', content: 'ephemeral 2', memoryType: 'ephemeral', relevanceScore: 0.8 }),
    makeCandidate({ id: 'e3', content: 'ephemeral 3', memoryType: 'ephemeral', relevanceScore: 0.7 }),
    makeCandidate({ id: 'd1', content: 'durable 1', memoryType: 'durable-fact', relevanceScore: 0.6 }),
  ];
  const result = selectMemories(candidates, 'opus-1m', {
    typeBudgets: { ephemeral: 2 },
  });
  const selectedEphemerals = result.selected.filter((s) => s.candidate.memoryType === 'ephemeral');
  assert(selectedEphemerals.length <= 2, `expected max 2 ephemeral, got ${selectedEphemerals.length}`);
  assert(result.selected.some((s) => s.candidate.id === 'd1'), 'durable-fact should still be selected');
}

export function testEmptyCandidatesEmptyResult(): void {
  const result = selectMemories([], 'opus');
  assertEqual(result.selected.length, 0);
  assertEqual(result.excluded.length, 0);
  assertEqual(result.saturationGap, true);
  assertEqual(result.totalTokens, 0);
}

export function testSingleCandideLargerThanBudgetExcluded(): void {
  const huge = makeCandidate({
    id: 'huge',
    content: 'x'.repeat(200000),  // 50000 tokens, larger than haiku budget 12000
    relevanceScore: 1.0,
  });
  const result = selectMemories([huge], 'haiku');
  assertEqual(result.selected.length, 0);
  assertEqual(result.excluded.length, 1);
  assertEqual(result.saturationGap, false);
}

export function testModelTierAffectsBudgetSize(): void {
  // Check that higher tiers allow more candidates
  const candidates: BudgetCandidate[] = Array.from({ length: 50 }, (_, i) =>
    makeCandidate({
      id: `item-${i}`,
      content: 'x'.repeat(2000),  // 500 tokens each
      relevanceScore: 0.5,
    }),
  );
  const haikuResult = selectMemories(candidates, 'haiku');       // 12000 tokens
  const sonnetResult = selectMemories(candidates, 'sonnet');     // 24000 tokens
  const opusResult = selectMemories(candidates, 'opus');         // 40000 tokens
  const opus1mResult = selectMemories(candidates, 'opus-1m');    // 80000 tokens

  assert(haikuResult.selected.length < sonnetResult.selected.length,
    'sonnet should fit more than haiku');
  assert(sonnetResult.selected.length < opusResult.selected.length,
    'opus should fit more than sonnet');
  assert(opusResult.selected.length <= opus1mResult.selected.length,
    'opus-1m should fit at least as many as opus');
}

// --- Explain tests ---

export function testFormatScoreBreakdownIncludesAllComponents(): void {
  const candidate = makeCandidate({
    id: 'explain-test',
    content: 'test content here',
    memoryType: 'task-state',
    relevanceScore: 0.7,
    freshnessScore: 0.6,
    importanceScore: 0.5,
    accessFrequency: 0.4,
  });
  const scored = scoreCandidate(candidate);
  const breakdown = formatScoreBreakdown(scored);

  assertEqual(breakdown.id, 'explain-test');
  assertEqual(breakdown.memoryType, 'task-state');
  assert(Math.abs(breakdown.relevance - 0.7) < 0.001, 'relevance mismatch');
  assert(Math.abs(breakdown.freshness - 0.6) < 0.001, 'freshness mismatch');
  assert(Math.abs(breakdown.importance - 0.5) < 0.001, 'importance mismatch');
  assert(Math.abs(breakdown.access - 0.4) < 0.001, 'access mismatch');
  assert(breakdown.finalScore > 0, 'expected positive finalScore');
  assert(breakdown.tokenEstimate > 0, 'expected positive tokenEstimate');
  assert(breakdown.density > 0, 'expected positive density');
}

export function testFormatSelectionResultIncludesBudgetStats(): void {
  const candidates: BudgetCandidate[] = [
    makeCandidate({ id: 'a', content: 'hello world' }),
    makeCandidate({ id: 'b', content: 'x'.repeat(200000), relevanceScore: 0.1 }),
  ];
  const result = selectMemories(candidates, 'haiku');
  const summary = formatSelectionResult(result);

  assert(summary.budgetLimit > 0, 'expected budgetLimit > 0');
  assertEqual(summary.selectedCount, summary.selected.length);
  assertEqual(summary.excludedCount, summary.excluded.length);
  assertEqual(summary.selectedCount + summary.excludedCount, 2);
  assert(typeof summary.saturationGap === 'boolean', 'expected saturationGap boolean');
  assert(summary.totalTokens >= 0, 'expected totalTokens >= 0');
}

export function testToJsonDiagnosticsReturnsSerializable(): void {
  const candidates: BudgetCandidate[] = [
    makeCandidate({ id: 'x', content: 'data' }),
  ];
  const result = selectMemories(candidates, 'sonnet');
  const diagnostics = toJsonDiagnostics(result);

  // Must be JSON-serializable (no circular refs, no functions)
  const json = JSON.stringify(diagnostics);
  const parsed = JSON.parse(json) as typeof diagnostics;
  assertEqual(parsed.budgetLimit, diagnostics.budgetLimit);
  assertEqual(parsed.totalTokens, diagnostics.totalTokens);
  assertEqual(parsed.selectedCount, diagnostics.selectedCount);
  assertEqual(parsed.excludedCount, diagnostics.excludedCount);
  assertEqual(parsed.items.length, diagnostics.items.length);
  assert(typeof parsed.saturationGap === 'boolean', 'expected saturationGap after JSON roundtrip');
}
