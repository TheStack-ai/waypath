import type {
  EvidenceBundle,
  EvidenceItem,
  RecallWeightOverrides,
} from '../contracts/index.js';
import { queryTruthDirect, searchTruthKernel, type RankedList } from '../archive-kernel/search/index.js';
import type { SearchCandidate } from '../archive-kernel/search/index.js';
import { rrfFusion } from '../archive-kernel/search/rrf.js';
import { createJcpLiveReader, type JcpLiveReader } from '../adapters/jcp/index.js';
import type {
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from './contracts.js';
import type { SqliteTruthKernelStorage } from './truth-kernel/index.js';

export interface ArchiveSearchQuery {
  readonly query: string;
  readonly limit?: number;
}

export interface ArchiveSearchFilters {
  readonly sourceSystems?: readonly string[];
  readonly sourceKinds?: readonly string[];
  readonly minConfidence?: number;
}

export interface ArchiveHealth {
  readonly ok: boolean;
  readonly message: string;
}

export interface ArchiveProvider {
  search(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): Promise<EvidenceBundle>;
  getItem(evidenceId: string): Promise<EvidenceItem | null>;
  health(): Promise<ArchiveHealth>;
}

type ArchiveRecordKind = 'entity' | 'decision' | 'preference' | 'promoted_memory';

export interface LocalArchiveRuntimeOptions {
  readonly weights?: RecallWeightOverrides;
  readonly jcpLiveReader?: JcpLiveReader;
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.replace(/\s+/g, '-').toLowerCase() || 'empty';
}

function metadataStringValue(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function toItem(
  kind: ArchiveRecordKind,
  id: string,
  title: string,
  excerpt: string,
  observedAt: string | null,
  confidence: number | null,
  metadata: Record<string, unknown>,
): EvidenceItem {
  return {
    evidence_id: `evidence:${kind}:${id}`,
    source_ref: typeof metadata.source_ref === 'string' ? metadata.source_ref : `truth:${kind}:${id}`,
    title,
    excerpt,
    observed_at: observedAt,
    confidence,
    metadata,
  };
}

function mapEntityEvidence(
  store: SqliteTruthKernelStorage,
  entity: TruthEntityRecord,
): EvidenceItem {
  const provenance = entity.state_json ? safeParseState(entity.state_json) : {};
  const provenanceId = typeof provenance.provenance_id === 'string' ? provenance.provenance_id : null;
  const provenanceRecord = provenanceId ? store.getProvenance(provenanceId) : undefined;

  return toItem(
    'entity',
    entity.entity_id,
    `Entity: ${entity.name}`,
    entity.summary,
    provenanceRecord?.observed_at ?? entity.updated_at,
    provenanceRecord?.confidence ?? null,
    {
      source_system: provenanceRecord?.source_system ?? 'truth-kernel',
      source_kind: provenanceRecord?.source_kind ?? entity.entity_type,
      source_ref: provenanceRecord?.source_ref ?? `truth:${entity.entity_id}`,
      entity_id: entity.entity_id,
      entity_type: entity.entity_type,
    },
  );
}

function mapDecisionEvidence(
  store: SqliteTruthKernelStorage,
  decision: TruthDecisionRecord,
): EvidenceItem {
  const provenanceRecord = decision.provenance_id ? store.getProvenance(decision.provenance_id) : undefined;
  return toItem(
    'decision',
    decision.decision_id,
    `Decision: ${decision.title}`,
    decision.statement,
    provenanceRecord?.observed_at ?? decision.effective_at ?? decision.updated_at,
    provenanceRecord?.confidence ?? null,
    {
      source_system: provenanceRecord?.source_system ?? 'truth-kernel',
      source_kind: provenanceRecord?.source_kind ?? 'decision',
      source_ref: provenanceRecord?.source_ref ?? `truth:${decision.decision_id}`,
      decision_id: decision.decision_id,
      scope_entity_id: decision.scope_entity_id,
    },
  );
}

function mapPreferenceEvidence(
  store: SqliteTruthKernelStorage,
  preference: TruthPreferenceRecord,
): EvidenceItem {
  const provenanceRecord = preference.provenance_id ? store.getProvenance(preference.provenance_id) : undefined;
  return toItem(
    'preference',
    preference.preference_id,
    `Preference: ${preference.key}`,
    `${preference.key}=${preference.value} (${preference.strength})`,
    provenanceRecord?.observed_at ?? preference.updated_at,
    provenanceRecord?.confidence ?? null,
    {
      source_system: provenanceRecord?.source_system ?? 'truth-kernel',
      source_kind: provenanceRecord?.source_kind ?? 'preference',
      source_ref: provenanceRecord?.source_ref ?? `truth:${preference.preference_id}`,
      preference_id: preference.preference_id,
      subject_ref: preference.subject_ref,
    },
  );
}

function mapMemoryEvidence(
  store: SqliteTruthKernelStorage,
  memory: TruthPromotedMemoryRecord,
): EvidenceItem {
  const provenanceRecord = memory.provenance_id ? store.getProvenance(memory.provenance_id) : undefined;
  return toItem(
    'promoted_memory',
    memory.memory_id,
    `Memory: ${memory.summary}`,
    memory.content,
    provenanceRecord?.observed_at ?? memory.updated_at,
    provenanceRecord?.confidence ?? null,
    {
      source_system: provenanceRecord?.source_system ?? 'truth-kernel',
      source_kind: provenanceRecord?.source_kind ?? memory.memory_type,
      source_ref: provenanceRecord?.source_ref ?? `truth:${memory.memory_id}`,
      memory_id: memory.memory_id,
      subject_entity_id: memory.subject_entity_id,
      access_tier: memory.access_tier,
    },
  );
}

function collectStoreEvidence(store: SqliteTruthKernelStorage): EvidenceItem[] {
  return [
    ...store.listActiveEntities(24).map((entity) => mapEntityEvidence(store, entity)),
    ...store.listActiveDecisions(24).map((decision) => mapDecisionEvidence(store, decision)),
    ...store.listActivePreferences(24).map((preference) => mapPreferenceEvidence(store, preference)),
    ...store.listActivePromotedMemories(24).map((memory) => mapMemoryEvidence(store, memory)),
  ];
}

function passesFilters(item: EvidenceItem, filters: ArchiveSearchFilters | undefined): boolean {
  if (!filters) return true;

  const sourceSystem = metadataStringValue(item.metadata, 'source_system');
  const sourceKind = metadataStringValue(item.metadata, 'source_kind');

  if (filters.sourceSystems && (!sourceSystem || !filters.sourceSystems.includes(sourceSystem))) {
    return false;
  }

  if (filters.sourceKinds && (!sourceKind || !filters.sourceKinds.includes(sourceKind))) {
    return false;
  }

  if (filters.minConfidence !== undefined) {
    const confidence = item.confidence ?? 0;
    if (confidence < filters.minConfidence) return false;
  }

  return true;
}

function dedupEvidenceItems(items: readonly EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  const deduped: EvidenceItem[] = [];

  for (const item of items) {
    if (seen.has(item.evidence_id)) continue;
    seen.add(item.evidence_id);
    deduped.push(item);
  }

  return deduped;
}

function safeParseState(stateJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stateJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function makeBundleId(query: string): string {
  return `bundle:truth:${slugify(query)}:${nowIso()}`;
}

function buildEvidenceLookup(items: readonly EvidenceItem[]): ReadonlyMap<string, EvidenceItem> {
  const lookup = new Map<string, EvidenceItem>();
  for (const item of items) {
    const metadata = item.metadata as Record<string, unknown>;
    const candidateId =
      (typeof metadata.entity_id === 'string' && metadata.entity_id)
      || (typeof metadata.decision_id === 'string' && metadata.decision_id)
      || (typeof metadata.preference_id === 'string' && metadata.preference_id)
      || (typeof metadata.memory_id === 'string' && metadata.memory_id);
    if (candidateId) {
      lookup.set(candidateId, item);
    }
  }
  return lookup;
}

function toJcpMemoryCandidate(memory: ReturnType<JcpLiveReader['searchMemories']>[number]): SearchCandidate {
  return {
    id: `jcp:memory:${memory.id}`,
    title: memory.description ?? `JCP memory ${memory.id}`,
    content: `${memory.description ?? ''}\n${memory.content}`.trim(),
    source_type: 'memory',
    source_system: 'jarvis-memory-db',
    source_kind: memory.memory_type || 'memory',
    confidence: memory.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      raw_id: memory.id,
      source_system: 'jarvis-memory-db',
      source_kind: memory.memory_type || 'memory',
      source_ref: `jarvis-memory-db:memory:${memory.id}`,
      memory_type: memory.memory_type,
      access_tier: memory.access_tier,
      source: memory.source,
    },
  };
}

function toJcpEntityCandidate(entity: ReturnType<JcpLiveReader['searchEntities']>[number]): SearchCandidate {
  return {
    id: `jcp:entity:${entity.id}`,
    title: entity.name,
    content: `${entity.name} (${entity.entity_type})\n${entity.properties ?? ''}`.trim(),
    source_type: 'entity',
    source_system: 'jarvis-memory-db',
    source_kind: entity.entity_type || 'entity',
    confidence: entity.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      raw_id: entity.id,
      source_system: 'jarvis-memory-db',
      source_kind: entity.entity_type || 'entity',
      source_ref: `jarvis-memory-db:entity:${entity.id}`,
      entity_type: entity.entity_type,
      properties: entity.properties,
    },
  };
}

function toCandidateEvidenceItem(candidate: SearchCandidate): EvidenceItem {
  return {
    evidence_id: `evidence:${candidate.source_type}:${candidate.id}`,
    source_ref: typeof candidate.metadata.source_ref === 'string'
      ? candidate.metadata.source_ref
      : `${candidate.source_system}:${candidate.id}`,
    title: candidate.title,
    excerpt: candidate.content,
    observed_at: null,
    confidence: candidate.confidence,
    metadata: candidate.metadata as Record<string, unknown>,
  };
}

function buildJcpRankedLists(
  query: string,
  reader: JcpLiveReader | undefined,
): {
  readonly rankedLists: readonly RankedList[];
  readonly evidenceByCandidateId: ReadonlyMap<string, EvidenceItem>;
} {
  if (!reader || !reader.health().ok) {
    return { rankedLists: [], evidenceByCandidateId: new Map() };
  }

  const memoryCandidates = reader.searchMemories(query, 8).map(toJcpMemoryCandidate);
  const entityCandidates = reader.searchEntities(query, 8).map(toJcpEntityCandidate);
  const evidenceByCandidateId = new Map<string, EvidenceItem>();
  for (const candidate of [...memoryCandidates, ...entityCandidates]) {
    evidenceByCandidateId.set(candidate.id, toCandidateEvidenceItem(candidate));
  }

  const rankedLists: RankedList[] = [];
  if (memoryCandidates.length > 0) {
    rankedLists.push({ dimension: 'keyword', results: memoryCandidates });
  }
  if (entityCandidates.length > 0) {
    rankedLists.push({ dimension: 'keyword', results: entityCandidates });
  }

  return { rankedLists, evidenceByCandidateId };
}

/** Minimum number of truth-direct results to consider "sufficient" */
const TRUTH_SUFFICIENCY_THRESHOLD = 3;

/**
 * Build an evidence bundle using truth-first recall.
 *
 * Flow:
 * 1. Try queryTruthDirect() first — canonical truth data, no RRF
 * 2. If sufficient results (>= TRUTH_SUFFICIENCY_THRESHOLD), return them
 * 3. If insufficient, fall back to archive-internal RRF fusion
 *
 * This enforces the truth-first / archive-second principle:
 * RRF is only used for archive-internal result merging, never at the truth level.
 */
export function buildLocalArchiveBundle(
  query: string,
  store?: SqliteTruthKernelStorage,
  options: LocalArchiveRuntimeOptions = {},
): EvidenceBundle {
  const normalizedQuery = query.trim();

  if (!store) {
    return {
      bundle_id: `bundle:${slugify(query)}`,
      query,
      generated_at: nowIso(),
      items: query.trim().length === 0
        ? []
        : [
            {
              evidence_id: `evidence:${slugify(query)}`,
              source_ref: `local:${query}`,
              title: `Local recall placeholder for ${query}`,
              excerpt: `No external archive is wired yet, so this local provider returns a deterministic placeholder for ${query}.`,
              observed_at: null,
              confidence: 0.2,
              metadata: { provider: 'local-archive-provider' },
            },
          ],
    };
  }

  const evidenceItems = collectStoreEvidence(store);
  const truthEvidenceLookup = buildEvidenceLookup(evidenceItems);
  const jcpReader = options.jcpLiveReader ?? createJcpLiveReader();
  const jcpRanked = buildJcpRankedLists(normalizedQuery, jcpReader);

  // Step 1: Truth-first — direct query against canonical truth (no RRF)
  const truthResults = queryTruthDirect(normalizedQuery, {
    store,
    recallWeights: options.weights,
  });

  // Step 2: Check sufficiency — if truth has enough results, return them directly
  let searchResults = truthResults;
  if (truthResults.length < TRUTH_SUFFICIENCY_THRESHOLD) {
    // Step 3: Fall back to archive-internal RRF fusion (combines all sources including derived data)
    const archiveResults = searchTruthKernel(normalizedQuery, {
      store,
      recallWeights: options.weights,
      extraRankedLists: jcpRanked.rankedLists,
    });
    // Merge: truth results first (priority), then archive results that aren't duplicates
    const truthIds = new Set(truthResults.map((r) => r.candidate.id));
    searchResults = [
      ...truthResults,
      ...archiveResults.filter((r) => !truthIds.has(r.candidate.id)),
    ];
  } else if (jcpRanked.rankedLists.length > 0) {
    const truthIds = new Set(truthResults.map((result) => result.candidate.id));
    const jcpResults = rrfFusion(jcpRanked.rankedLists);
    searchResults = [
      ...truthResults,
      ...jcpResults.filter((result) => !truthIds.has(result.candidate.id)),
    ];
  }

  // Convert ScoredResults back to EvidenceItems for backward compatibility
  const pipelineItems: EvidenceItem[] = searchResults.map((sr) => {
    const existing = truthEvidenceLookup.get(sr.candidate.id) ?? jcpRanked.evidenceByCandidateId.get(sr.candidate.id);
    if (existing) return existing;
    return toCandidateEvidenceItem(sr.candidate);
  });

  return {
    bundle_id: makeBundleId(normalizedQuery),
    query: normalizedQuery,
    generated_at: nowIso(),
    items: dedupEvidenceItems(pipelineItems).slice(0, 8),
  };
}

export function createLocalArchiveProvider(
  store?: SqliteTruthKernelStorage,
  options: LocalArchiveRuntimeOptions = {},
): ArchiveProvider {
  return {
    async search(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): Promise<EvidenceBundle> {
      const bundle = buildLocalArchiveBundle(query.query, store, options);
      if (!filters) return query.limit === undefined ? bundle : { ...bundle, items: bundle.items.slice(0, query.limit) };

      const filtered = bundle.items.filter((item) => passesFilters(item, filters));
      return {
        ...bundle,
        items: query.limit === undefined ? filtered : filtered.slice(0, query.limit),
      };
    },
    async getItem(evidenceId: string): Promise<EvidenceItem | null> {
      const item = buildLocalArchiveBundle(evidenceId, store, options).items.find((candidate) => candidate.evidence_id === evidenceId);
      return item ?? null;
    },
    async health(): Promise<ArchiveHealth> {
      return {
        ok: true,
        message: store
          ? `truth-backed local archive provider ready with ${collectStoreEvidence(store).length} evidence item(s)`
          : 'local archive provider ready',
      };
    },
  };
}
