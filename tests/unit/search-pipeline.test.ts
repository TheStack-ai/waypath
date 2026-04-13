import { createTruthKernelStorage, ensureTruthKernelSeedData, type SqliteTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel/index.js';
import { searchTruthKernel, queryTruthDirect } from '../../src/archive-kernel/search/index.js';
import { rrfFusion } from '../../src/archive-kernel/search/rrf.js';
import { dedupResults } from '../../src/archive-kernel/search/dedup.js';
import { chunkText } from '../../src/archive-kernel/chunker/index.js';
import { contentHash, hasChanged } from '../../src/archive-kernel/content-hash.js';
import type { SearchCandidate, ScoredResult } from '../../src/archive-kernel/search/types.js';
import { assert, assertEqual } from '../../src/shared/assert';

function nowIso(): string {
  return new Date().toISOString();
}

function createSeededStore(): SqliteTruthKernelStorage {
  const store = createTruthKernelStorage(':memory:');
  ensureTruthKernelSeedData(store, { project: 'alpha', objective: 'build v1', activeTask: 'implement' });

  // Add more data for meaningful search
  const ts = nowIso();
  store.upsertEntity({ entity_id: 'tool:react', entity_type: 'tool', name: 'React', summary: 'Frontend framework for building UI components', state_json: '{}', status: 'active', canonical_page_id: null, created_at: ts, updated_at: ts });
  store.upsertEntity({ entity_id: 'tool:sqlite', entity_type: 'tool', name: 'SQLite', summary: 'Local-first embedded database engine', state_json: '{}', status: 'active', canonical_page_id: null, created_at: ts, updated_at: ts });
  store.upsertDecision({ decision_id: 'decision:use-sqlite', title: 'Use SQLite for truth kernel', statement: 'SQLite chosen for local-first zero-dependency persistence.', status: 'active', scope_entity_id: 'project:alpha', effective_at: ts, superseded_by: null, provenance_id: null, created_at: ts, updated_at: ts });
  store.upsertPromotedMemory({ memory_id: 'memory:local-first', memory_type: 'semantic', access_tier: 'ops', summary: 'Local-first architecture is a core design principle', content: 'Waypath runs locally with zero npm dependencies and Node 25+ native SQLite.', subject_entity_id: 'project:alpha', status: 'active', provenance_id: null, created_at: ts, updated_at: ts });

  return store;
}

// --- RRF Tests ---

export function testRrfFusionMergesLists(): void {
  const candidateA: SearchCandidate = { id: 'a', title: 'A', content: 'Content A', source_type: 'entity', source_system: 'truth-kernel', source_kind: 'entity', confidence: null, graph_depth: null, graph_weight: null, metadata: {} };
  const candidateB: SearchCandidate = { id: 'b', title: 'B', content: 'Content B', source_type: 'decision', source_system: 'truth-kernel', source_kind: 'decision', confidence: null, graph_depth: null, graph_weight: null, metadata: {} };
  const candidateC: SearchCandidate = { id: 'c', title: 'C', content: 'Content C', source_type: 'memory', source_system: 'truth-kernel', source_kind: 'memory', confidence: null, graph_depth: null, graph_weight: null, metadata: {} };

  const results = rrfFusion([
    { dimension: 'keyword', results: [candidateA, candidateB] },
    { dimension: 'lexical', results: [candidateB, candidateC] },
  ]);

  // B appears in both lists → should have highest fused score
  if (results[0]?.candidate.id !== 'b') {
    throw new Error(`Expected B to rank first (appears in both lists), got ${results[0]?.candidate.id}`);
  }
  if (results.length !== 3) {
    throw new Error(`Expected 3 fused results, got ${results.length}`);
  }
}

export function testRrfScoreIsRankBased(): void {
  const c1: SearchCandidate = { id: '1', title: 'First', content: '', source_type: 'entity', source_system: 's', source_kind: 'k', confidence: null, graph_depth: null, graph_weight: null, metadata: {} };
  const c2: SearchCandidate = { id: '2', title: 'Second', content: '', source_type: 'entity', source_system: 's', source_kind: 'k', confidence: null, graph_depth: null, graph_weight: null, metadata: {} };

  const results = rrfFusion([
    { dimension: 'keyword', results: [c1, c2] },
  ]);

  // rank 0 → 1/(60+0) = 0.01667, rank 1 → 1/(60+1) = 0.01639
  if (results[0]?.score === undefined || results[1]?.score === undefined) throw new Error('Missing scores');
  if (results[0].score <= results[1].score) throw new Error('First-ranked should have higher score');
}

// --- Dedup Tests ---

export function testDedupById(): void {
  const candidate: SearchCandidate = { id: 'dup', title: 'Same', content: 'Same content', source_type: 'entity', source_system: 's', source_kind: 'k', confidence: null, graph_depth: null, graph_weight: null, metadata: {} };
  const r1: ScoredResult = { candidate, score: 0.5, breakdown: { keyword: 0.5, graph: 0, provenance: 0, lexical: 0, rrf_fused: 0.5 } };
  const r2: ScoredResult = { candidate, score: 0.8, breakdown: { keyword: 0.8, graph: 0, provenance: 0, lexical: 0, rrf_fused: 0.8 } };

  const deduped = dedupResults([r1, r2]);
  if (deduped.length !== 1) throw new Error(`Expected 1 after dedup, got ${deduped.length}`);
  if (deduped[0]?.score !== 0.8) throw new Error('Expected higher score kept');
}

export function testDedupTypeDiversity(): void {
  const results: ScoredResult[] = [];
  for (let i = 0; i < 10; i++) {
    results.push({
      candidate: { id: `e${i}`, title: `Entity ${i}`, content: `Unique content ${i} with different words`, source_type: 'entity', source_system: 's', source_kind: 'k', confidence: null, graph_depth: null, graph_weight: null, metadata: {} },
      score: 1 - i * 0.01,
      breakdown: { keyword: 0, graph: 0, provenance: 0, lexical: 0, rrf_fused: 0 },
    });
  }

  const deduped = dedupResults(results, { maxTypeRatio: 0.6 });
  // 10 results * 0.6 = max 6 entities
  if (deduped.length > 6) throw new Error(`Expected max 6 after type diversity, got ${deduped.length}`);
}

// --- Chunker Tests ---

export function testChunkShortText(): void {
  const chunks = chunkText('Hello world, this is a short text.');
  if (chunks.length !== 1) throw new Error(`Expected 1 chunk for short text, got ${chunks.length}`);
  if (chunks[0]?.text !== 'Hello world, this is a short text.') throw new Error('Short text should be unchanged');
}

export function testChunkLongText(): void {
  // Generate text with >300 words
  const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkText(words, { chunkSize: 300, chunkOverlap: 50 });

  if (chunks.length < 2) throw new Error(`Expected at least 2 chunks for 600-word text, got ${chunks.length}`);

  // Each chunk should be roughly 300 words (with some tolerance for merge/overlap)
  for (const chunk of chunks) {
    if (chunk.wordCount > 500) throw new Error(`Chunk too large: ${chunk.wordCount} words`);
  }
}

export function testChunkEmptyText(): void {
  const chunks = chunkText('');
  if (chunks.length !== 0) throw new Error(`Expected 0 chunks for empty text, got ${chunks.length}`);
}

export function testChunkParagraphBoundaries(): void {
  const text = 'First paragraph with enough words to matter.\n\nSecond paragraph with different content here.\n\nThird paragraph completes the set.';
  const chunks = chunkText(text, { chunkSize: 5, chunkOverlap: 0 });

  // Should split at paragraph boundaries
  if (chunks.length < 2) throw new Error(`Expected multiple chunks, got ${chunks.length}`);
}

// --- Content Hash Tests ---

export function testContentHashDeterministic(): void {
  const record = { name: 'test', value: 42, nested: { key: 'val' } };
  const h1 = contentHash(record);
  const h2 = contentHash(record);
  if (h1 !== h2) throw new Error('Content hash should be deterministic');
}

export function testContentHashDetectsChanges(): void {
  const h1 = contentHash({ name: 'test', value: 1 });
  const h2 = contentHash({ name: 'test', value: 2 });
  if (h1 === h2) throw new Error('Different records should have different hashes');
  if (!hasChanged(h2, h1)) throw new Error('hasChanged should return true for different hashes');
  if (hasChanged(h1, h1)) throw new Error('hasChanged should return false for same hash');
}

export function testContentHashKeyOrderIndependent(): void {
  const h1 = contentHash({ a: 1, b: 2 });
  const h2 = contentHash({ b: 2, a: 1 });
  if (h1 !== h2) throw new Error('Content hash should be key-order independent');
}

// --- Full Pipeline Tests ---

export function testSearchTruthKernel(): void {
  const store = createSeededStore();
  try {
    const ts = nowIso();
    store.upsertEvidenceBundle({
      bundle_id: 'bundle:archive:sqlite',
      query: 'SQLite local-first',
      generated_at: ts,
      items: [
        {
          evidence_id: 'evidence:mempalace:sqlite',
          source_ref: 'mempalace://projects/alpha.md',
          title: 'SQLite archive note',
          excerpt: 'SQLite local-first archive evidence from MemPalace.',
          observed_at: ts,
          confidence: 0.9,
          metadata: {
            source_system: 'mempalace',
            source_kind: 'project',
          },
        },
      ],
    });

    const results = searchTruthKernel('SQLite local-first', { store });

    if (results.length === 0) throw new Error('Expected search results for "SQLite local-first"');
    const sourceSystems = new Set(results.map((result) => result.candidate.source_system));
    if (sourceSystems.has('truth-kernel')) {
      throw new Error('searchTruthKernel should not read canonical truth tables');
    }
    const hasSqliteArchive = results.some((result) => result.candidate.title.includes('SQLite archive note'));
    if (!hasSqliteArchive) throw new Error('Expected archive evidence to be searchable');
  } finally {
    store.close();
  }
}

export function testSearchWithGraphScoring(): void {
  const store = createSeededStore();
  try {
    const ts = nowIso();
    store.upsertEvidenceBundle({
      bundle_id: 'bundle:archive:database',
      query: 'database',
      generated_at: ts,
      items: [
        {
          evidence_id: 'evidence:mempalace:scoped',
          source_ref: 'mempalace://projects/alpha.md',
          title: 'Scoped database evidence',
          excerpt: 'database workflow tied to alpha project',
          observed_at: ts,
          confidence: 0.8,
          metadata: {
            source_system: 'mempalace',
            source_kind: 'project',
            subject_ref: 'project:alpha',
          },
        },
        {
          evidence_id: 'evidence:mempalace:unscoped',
          source_ref: 'mempalace://projects/other.md',
          title: 'Generic database evidence',
          excerpt: 'database workflow with no graph linkage',
          observed_at: ts,
          confidence: 0.8,
          metadata: {
            source_system: 'mempalace',
            source_kind: 'project',
          },
        },
      ],
    });

    const graphDepths = new Map([
      ['project:alpha', 0],
    ]);

    const results = searchTruthKernel('database', {
      store,
      graphSeedEntityIds: ['project:alpha'],
      graphDepths,
    });

    if (results.length === 0) throw new Error('Expected results with graph scoring');
    const scopedIndex = results.findIndex((result) => result.candidate.id === 'evidence:mempalace:scoped');
    const unscopedIndex = results.findIndex((result) => result.candidate.id === 'evidence:mempalace:unscoped');
    if (scopedIndex === -1 || unscopedIndex === -1) {
      throw new Error('Expected both scoped and unscoped archive evidence in combined results');
    }
    if (scopedIndex >= unscopedIndex) {
      throw new Error(`Expected scoped archive evidence to outrank unscoped evidence, got ${scopedIndex} >= ${unscopedIndex}`);
    }
  } finally {
    store.close();
  }
}

export function testSearchEmptyQuery(): void {
  const store = createSeededStore();
  try {
    const results = searchTruthKernel('', { store });
    if (results.length !== 0) throw new Error('Expected no results for empty query');
  } finally {
    store.close();
  }
}

// --- Truth-Direct Query Tests ---

export function testQueryTruthDirectReturnsCanonicalOnly(): void {
  const store = createSeededStore();
  try {
    // Add a knowledge page and evidence bundle (derived data)
    const ts = nowIso();
    store.upsertKnowledgePage({
      page: { page_id: 'page:test', page_type: 'topic_brief', title: 'SQLite Topic Brief', status: 'canonical' },
      summary_markdown: 'SQLite is used throughout.',
      linked_entity_ids: ['tool:sqlite'],
      linked_decision_ids: [],
      linked_evidence_bundle_ids: [],
      updated_at: ts,
    });
    store.upsertEvidenceBundle({
      bundle_id: 'bundle:test',
      query: 'SQLite evidence',
      generated_at: ts,
      items: [{ evidence_id: 'ev:1', source_ref: 'test', title: 'SQLite Evidence', excerpt: 'Evidence about SQLite', observed_at: null, confidence: 0.8, metadata: {} }],
    });

    const results = queryTruthDirect('SQLite', { store });

    // Should return canonical truth (entities, decisions, memories) but NOT knowledge pages or evidence bundles
    const sourceTypes = new Set(results.map((r) => r.candidate.source_type));
    if (sourceTypes.has('page')) throw new Error('queryTruthDirect should not return knowledge pages');
    if (sourceTypes.has('evidence')) throw new Error('queryTruthDirect should not return evidence bundles');

    // Should find SQLite entity and related decision
    if (results.length === 0) throw new Error('Expected truth results for "SQLite"');
    const hasSqlite = results.some((r) => r.candidate.id.includes('sqlite'));
    if (!hasSqlite) throw new Error('Expected SQLite entity in truth-direct results');
  } finally {
    store.close();
  }
}

export function testQueryTruthDirectNoRrf(): void {
  const store = createSeededStore();
  try {
    const results = queryTruthDirect('SQLite local-first', { store });

    // All results should have rrf_fused = 0 (no RRF applied)
    for (const r of results) {
      if (r.breakdown.rrf_fused !== 0) throw new Error('queryTruthDirect should not use RRF fusion');
    }

    // Score should be a direct combined score, not RRF-fused
    if (results.length > 0 && results[0]!.score <= 0) {
      throw new Error('Expected positive score for matching results');
    }
  } finally {
    store.close();
  }
}

export function testTruthFirstRecallSufficiency(): void {
  const store = createSeededStore();
  try {
    const truthResults = queryTruthDirect('alpha', { store });
    if (truthResults.length < 1) throw new Error('Expected truth results for project "alpha"');

    const archiveResults = searchTruthKernel('alpha', { store });
    if (archiveResults.length !== 0) {
      throw new Error('Archive recall should not surface truth-table matches without archive evidence');
    }
  } finally {
    store.close();
  }
}

export function testQueryTruthDirectEmptyQuery(): void {
  const store = createSeededStore();
  try {
    const results = queryTruthDirect('', { store });
    if (results.length !== 0) throw new Error('Expected no results for empty query');
  } finally {
    store.close();
  }
}

// --- FTS5 Tests ---

export function testFtsIndexPopulated(): void {
  const store = createSeededStore();
  try {
    // Seed data + extra entities should be in FTS index
    const results = store.searchWaypathFts('SQLite', 10);
    assert(results.length > 0, 'Expected FTS hits for "SQLite"');
    const ids = results.map((r) => r.source_id);
    assert(ids.includes('tool:sqlite'), 'Expected tool:sqlite in FTS results');
    assert(ids.includes('decision:use-sqlite'), 'Expected decision:use-sqlite in FTS results');
    // All results should have record_type
    for (const r of results) {
      assert(r.source_type === 'entity' || r.source_type === 'decision' || r.source_type === 'preference' || r.source_type === 'memory', `Unexpected source_type: ${r.source_type}`);
    }
  } finally {
    store.close();
  }
}

export function testFtsUpsertUpdatesIndex(): void {
  const store = createSeededStore();
  try {
    const ts = nowIso();
    // Insert entity with unique term
    store.upsertEntity({ entity_id: 'tool:xyzunique', entity_type: 'tool', name: 'XyzUnique', summary: 'A very unique tool', state_json: '{}', status: 'active', canonical_page_id: null, created_at: ts, updated_at: ts });
    let results = store.searchWaypathFts('xyzunique', 10);
    assertEqual(results.length, 1);
    assertEqual(results[0]!.source_id, 'tool:xyzunique');

    // Update the entity — FTS should reflect new content
    store.upsertEntity({ entity_id: 'tool:xyzunique', entity_type: 'tool', name: 'XyzRenamed', summary: 'Renamed tool description', state_json: '{}', status: 'active', canonical_page_id: null, created_at: ts, updated_at: ts });
    results = store.searchWaypathFts('xyzunique', 10);
    assertEqual(results.length, 0); // old name no longer matches
    results = store.searchWaypathFts('xyzrenamed', 10);
    assertEqual(results.length, 1);
    assertEqual(results[0]!.source_id, 'tool:xyzunique');
  } finally {
    store.close();
  }
}

export function testFtsEmptyQueryReturnsNothing(): void {
  const store = createSeededStore();
  try {
    assertEqual(store.searchWaypathFts('', 10).length, 0);
    assertEqual(store.searchWaypathFts('   ', 10).length, 0);
  } finally {
    store.close();
  }
}

export function testFtsSearchUsedByPipeline(): void {
  const store = createSeededStore();
  try {
    // queryTruthDirect uses FTS5 internally now
    const results = queryTruthDirect('SQLite database', { store });
    assert(results.length > 0, 'Expected pipeline results using FTS');
    const topResult = results[0]!;
    assert(topResult.breakdown.keyword > 0, 'Expected positive keyword score from FTS');
    // SQLite entity or decision should be in top results
    const hasSqlite = results.some((r) => r.candidate.id.includes('sqlite'));
    assert(hasSqlite, 'Expected SQLite-related result from FTS-powered pipeline');
  } finally {
    store.close();
  }
}
