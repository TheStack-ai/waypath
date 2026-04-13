/**
 * Search result types for the Waypath retrieval pipeline.
 *
 * The search pipeline supports multiple ranking dimensions:
 * - FTS keyword matching (SQLite FTS5)
 * - Graph-based scoring (ontology traversal depth/weight)
 * - Provenance scoring (source system/kind weights)
 * - Lexical scoring (token overlap fallback)
 *
 * Results are fused via RRF (Reciprocal Rank Fusion) to produce
 * a single ranking that respects all dimensions fairly.
 */

import type { SourceKind, SourceSystem } from '../../contracts/index.js';

export interface SearchCandidate {
  /** Unique identifier (entity_id, decision_id, memory_id, etc.) */
  readonly id: string;
  /** Human-readable title */
  readonly title: string;
  /** Full text content */
  readonly content: string;
  /** Source type for type-diversity enforcement */
  readonly source_type: 'entity' | 'decision' | 'preference' | 'memory' | 'evidence' | 'page';
  /** Source system (truth-kernel, jarvis-memory-db, etc.) */
  readonly source_system: SourceSystem;
  /** Source kind (decision, memory, relationship, etc.) */
  readonly source_kind: SourceKind;
  /** Provenance confidence (0-1) */
  readonly confidence: number | null;
  /** Graph depth from seed entity (0 = seed itself, null = not graph-derived) */
  readonly graph_depth: number | null;
  /** Graph edge weight that led to this result */
  readonly graph_weight: number | null;
  /** Additional metadata */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ScoredResult {
  readonly candidate: SearchCandidate;
  readonly score: number;
  /** Breakdown of how the score was computed */
  readonly breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  readonly keyword: number;
  readonly graph: number;
  readonly provenance: number;
  readonly lexical: number;
  readonly rrf_fused: number;
}

export interface SearchOptions {
  /** Max results to return (default 20) */
  readonly limit?: number;
  /** Filter by source type */
  readonly sourceTypeFilter?: readonly SearchCandidate['source_type'][];
  /** Whether to apply dedup layers (default true) */
  readonly dedup?: boolean;
  /** Dedup config overrides */
  readonly dedupConfig?: DedupConfig;
}

export interface DedupConfig {
  /** Jaccard similarity threshold for text dedup (default 0.85) */
  readonly similarityThreshold?: number;
  /** Max ratio of any single source_type in results (default 0.6) */
  readonly maxTypeRatio?: number;
  /** Max results per unique entity/page (default 2) */
  readonly maxPerSource?: number;
}
