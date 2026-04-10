import { runFacadeUnitTest } from './unit/facade.test';
import { runPageServiceUnitTest } from './unit/page-service.test';
import { runSessionRuntimeUnitTest } from './unit/session-runtime.test';
import { runSourceReadersLocalUnitTest } from './unit/source-readers-local.test';
import { runTruthKernelUnitTest } from './unit/truth-kernel.test';
import { runSourceReaderBootstrapUnitTest } from './unit/source-reader-bootstrap.test';
import { runArchiveProviderUnitTest } from './unit/archive-provider.test';
import { runMemPalaceProviderUnitTest } from './unit/mempalace-provider.test';
import { runJcpLiveReaderUnitTest } from './unit/jcp-live-reader.test';
import { runRetrievalStrategyUnitTest } from './unit/retrieval-strategy.test';
import { runRuntimeConfigUnitTest } from './unit/runtime-config.test';
import {
  testSubmitCandidateCreatesRecords,
  testReviewAcceptedCreatesTruth,
  testReviewRejectedNoTruthChanges,
  testReviewNotFound,
  testListPendingCandidates,
  testAcceptedPromotionMarksPageStale,
  testSubmitWithEvidenceBundleLinkage,
  testResolveContradictionSetsInactive,
  testReviewWithPayloadRecordsProvenance,
} from './unit/promotion-engine.test';
import {
  testSynthesizeProjectPage,
  testSynthesizeEntityPage,
  testSynthesizeDecisionPage,
  testSynthesizeSessionBrief,
  testSynthesizeTopicBrief,
  testRefreshPage,
  testMarkPagesStale,
  testEmptyStoreProducesValidPage,
  testPageFilePersistence,
  testInMemoryStoreSkipsFilePersistence,
} from './unit/knowledge-pages.test';
import {
  testRrfFusionMergesLists,
  testRrfScoreIsRankBased,
  testDedupById,
  testDedupTypeDiversity,
  testChunkShortText,
  testChunkLongText,
  testChunkEmptyText,
  testChunkParagraphBoundaries,
  testContentHashDeterministic,
  testContentHashDetectsChanges,
  testContentHashKeyOrderIndependent,
  testSearchTruthKernel,
  testSearchWithGraphScoring,
  testSearchEmptyQuery,
  testQueryTruthDirectReturnsCanonicalOnly,
  testQueryTruthDirectNoRrf,
  testTruthFirstRecallSufficiency,
  testQueryTruthDirectEmptyQuery,
  testFtsIndexPopulated,
  testFtsUpsertUpdatesIndex,
  testFtsEmptyQueryReturnsNothing,
  testFtsSearchUsedByPipeline,
} from './unit/search-pipeline.test';
import {
  testTraversalDepth1,
  testTraversalDepth2,
  testTraversalDepth3,
  testTraversalDeduplication,
  testTraversalCircularReference,
  testTraversalEmptyGraph,
  testTraversalRelationFilter,
  testExpandGraphContext,
  testExpandGraphContextMultipleSeeds,
  testExpandGraphContextEmpty,
  testPatternProjectContext,
  testPatternPersonContext,
  testPatternSystemReasoning,
  testPatternContradictionLookup,
  testContradictionLookupFiltersSuperseded,
  testMaxResultsLimit,
} from './unit/ontology-support.test';
import {
  runClaudeCodeCliIntegrationTest,
  runCodexCliIntegrationTest,
  runPageCliIntegrationTest,
  runPromoteCliIntegrationTest,
  runRecallCliIntegrationTest,
  runReviewCliIntegrationTest,
  runReviewQueueCliIntegrationTest,
  runInspectCliIntegrationTest,
} from './integration/codex-cli.test';
import { runImportSeedCliIntegrationTest } from './integration/import-seed-cli.test';
import {
  runImportLocalCliIntegrationTest,
  runSourceStatusCliIntegrationTest,
} from './integration/import-local-cli.test';

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const tests: TestCase[] = [
  { name: 'facade unit', run: runFacadeUnitTest },
  { name: 'page service unit', run: runPageServiceUnitTest },
  { name: 'session runtime unit', run: runSessionRuntimeUnitTest },
  { name: 'source-readers-local unit', run: runSourceReadersLocalUnitTest },
  { name: 'truth-kernel unit', run: runTruthKernelUnitTest },
  { name: 'source-reader bootstrap unit', run: runSourceReaderBootstrapUnitTest },
  { name: 'archive provider unit', run: runArchiveProviderUnitTest },
  { name: 'mempalace provider unit', run: runMemPalaceProviderUnitTest },
  { name: 'jcp live reader unit', run: runJcpLiveReaderUnitTest },
  { name: 'retrieval strategy unit', run: runRetrievalStrategyUnitTest },
  { name: 'runtime config unit', run: runRuntimeConfigUnitTest },
  { name: 'codex cli integration', run: runCodexCliIntegrationTest },
  { name: 'claude-code cli integration', run: runClaudeCodeCliIntegrationTest },
  { name: 'recall cli integration', run: runRecallCliIntegrationTest },
  { name: 'page cli integration', run: runPageCliIntegrationTest },
  { name: 'promote cli integration', run: runPromoteCliIntegrationTest },
  { name: 'review cli integration', run: runReviewCliIntegrationTest },
  { name: 'review-queue cli integration', run: runReviewQueueCliIntegrationTest },
  { name: 'inspect cli integration', run: runInspectCliIntegrationTest },
  { name: 'import-seed cli integration', run: runImportSeedCliIntegrationTest },
  { name: 'import-local cli integration', run: runImportLocalCliIntegrationTest },
  { name: 'source-status cli integration', run: runSourceStatusCliIntegrationTest },
  { name: 'promotion: submit creates records', run: testSubmitCandidateCreatesRecords },
  { name: 'promotion: accepted creates truth', run: testReviewAcceptedCreatesTruth },
  { name: 'promotion: rejected no truth changes', run: testReviewRejectedNoTruthChanges },
  { name: 'promotion: not found', run: testReviewNotFound },
  { name: 'promotion: list pending', run: testListPendingCandidates },
  { name: 'promotion: accepted marks page stale', run: testAcceptedPromotionMarksPageStale },
  { name: 'promotion: submit with evidence bundle linkage', run: testSubmitWithEvidenceBundleLinkage },
  { name: 'promotion: resolve contradiction sets inactive', run: testResolveContradictionSetsInactive },
  { name: 'promotion: review with payload records provenance', run: testReviewWithPayloadRecordsProvenance },
  { name: 'knowledge-pages: project page', run: testSynthesizeProjectPage },
  { name: 'knowledge-pages: entity page', run: testSynthesizeEntityPage },
  { name: 'knowledge-pages: decision page', run: testSynthesizeDecisionPage },
  { name: 'knowledge-pages: session brief', run: testSynthesizeSessionBrief },
  { name: 'knowledge-pages: topic brief', run: testSynthesizeTopicBrief },
  { name: 'knowledge-pages: refresh page', run: testRefreshPage },
  { name: 'knowledge-pages: mark stale', run: testMarkPagesStale },
  { name: 'knowledge-pages: empty store', run: testEmptyStoreProducesValidPage },
  { name: 'knowledge-pages: file persistence', run: testPageFilePersistence },
  { name: 'knowledge-pages: in-memory skips file', run: testInMemoryStoreSkipsFilePersistence },
  { name: 'search: RRF fusion merges lists', run: testRrfFusionMergesLists },
  { name: 'search: RRF score is rank-based', run: testRrfScoreIsRankBased },
  { name: 'search: dedup by ID', run: testDedupById },
  { name: 'search: dedup type diversity', run: testDedupTypeDiversity },
  { name: 'search: chunk short text', run: testChunkShortText },
  { name: 'search: chunk long text', run: testChunkLongText },
  { name: 'search: chunk empty text', run: testChunkEmptyText },
  { name: 'search: chunk paragraph boundaries', run: testChunkParagraphBoundaries },
  { name: 'search: content hash deterministic', run: testContentHashDeterministic },
  { name: 'search: content hash detects changes', run: testContentHashDetectsChanges },
  { name: 'search: content hash key-order independent', run: testContentHashKeyOrderIndependent },
  { name: 'search: truth kernel pipeline', run: testSearchTruthKernel },
  { name: 'search: pipeline with graph scoring', run: testSearchWithGraphScoring },
  { name: 'search: empty query', run: testSearchEmptyQuery },
  { name: 'search: truth-direct canonical only', run: testQueryTruthDirectReturnsCanonicalOnly },
  { name: 'search: truth-direct no RRF', run: testQueryTruthDirectNoRrf },
  { name: 'search: truth-first recall sufficiency', run: testTruthFirstRecallSufficiency },
  { name: 'search: truth-direct empty query', run: testQueryTruthDirectEmptyQuery },
  { name: 'search: FTS5 index populated', run: testFtsIndexPopulated },
  { name: 'search: FTS5 upsert updates index', run: testFtsUpsertUpdatesIndex },
  { name: 'search: FTS5 empty query returns nothing', run: testFtsEmptyQueryReturnsNothing },
  { name: 'search: FTS5 used by pipeline', run: testFtsSearchUsedByPipeline },
  { name: 'ontology: traversal depth 1', run: testTraversalDepth1 },
  { name: 'ontology: traversal depth 2', run: testTraversalDepth2 },
  { name: 'ontology: traversal depth 3', run: testTraversalDepth3 },
  { name: 'ontology: deduplication', run: testTraversalDeduplication },
  { name: 'ontology: circular reference', run: testTraversalCircularReference },
  { name: 'ontology: empty graph', run: testTraversalEmptyGraph },
  { name: 'ontology: relation filter', run: testTraversalRelationFilter },
  { name: 'ontology: expand graph context', run: testExpandGraphContext },
  { name: 'ontology: multiple seeds', run: testExpandGraphContextMultipleSeeds },
  { name: 'ontology: empty seeds', run: testExpandGraphContextEmpty },
  { name: 'ontology: pattern project_context', run: testPatternProjectContext },
  { name: 'ontology: pattern person_context', run: testPatternPersonContext },
  { name: 'ontology: pattern system_reasoning', run: testPatternSystemReasoning },
  { name: 'ontology: pattern contradiction_lookup', run: testPatternContradictionLookup },
  { name: 'ontology: contradiction filters superseded', run: testContradictionLookupFiltersSuperseded },
  { name: 'ontology: maxResults limit', run: testMaxResultsLimit },
];

async function main(): Promise<void> {
  let failures = 0;
  for (const test of tests) {
    try {
      await test.run();
      process.stdout.write(`PASS ${test.name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`FAIL ${test.name}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  if (failures === 0) {
    process.stdout.write(`PASS ${tests.length} tests\n`);
    return;
  }

  process.stderr.write(`FAIL ${failures}/${tests.length} tests\n`);
  process.exitCode = 1;
}

void main();
