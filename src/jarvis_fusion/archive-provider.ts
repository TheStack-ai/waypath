import {
  parseSourceKind,
  parseSourceSystem,
  toSourceKind,
  toSourceSystem,
  type EvidenceBundle,
  type EvidenceItem,
  type RecallWeightOverrides,
  type SourceKind,
  type SourceSystem,
} from '../contracts/index.js';
import { queryTruthDirect, searchTruthKernel, type RankedList } from '../archive-kernel/search/index.js';
import type { SearchCandidate } from '../archive-kernel/search/index.js';
import { rrfFusion } from '../archive-kernel/search/rrf.js';
import { createJcpLiveReader, type JcpLiveReader } from '../adapters/jcp/index.js';
import { MemPalaceArchiveProvider } from '../adapters/mempalace/index.js';
import type {
  TruthDecisionRecord,
  TruthEntityRecord,
  TruthPreferenceRecord,
  TruthPromotedMemoryRecord,
} from './contracts.js';
import { probeLocalSourceAdapters } from './source-readers-local.js';
import type { SqliteTruthKernelStorage } from './truth-kernel/index.js';
import { slugify } from '../shared/text.js';
import { nowIso } from '../shared/time.js';

export interface ArchiveSearchQuery {
  readonly query: string;
  readonly limit?: number;
}

export interface ArchiveSearchFilters {
  readonly sourceSystems?: readonly SourceSystem[];
  readonly sourceKinds?: readonly SourceKind[];
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

const ARCHIVE_SOURCE_SYSTEMS = new Set<SourceSystem>([
  'jarvis-memory-db',
  'mempalace',
  'local-archive',
]);

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

  const sourceSystem = parseSourceSystem(metadataStringValue(item.metadata, 'source_system'));
  const sourceKind = parseSourceKind(metadataStringValue(item.metadata, 'source_kind'));

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

function makeArchiveBundleId(query: string): string {
  return `bundle:archive:${slugify(query)}:${nowIso()}`;
}

function makeTruthBundleId(query: string): string {
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

function isArchiveSourceSystem(sourceSystem: SourceSystem | null): boolean {
  return sourceSystem !== null && ARCHIVE_SOURCE_SYSTEMS.has(sourceSystem);
}

function mergeEvidenceLookups(
  ...lookups: readonly ReadonlyMap<string, EvidenceItem>[]
): ReadonlyMap<string, EvidenceItem> {
  const merged = new Map<string, EvidenceItem>();
  for (const lookup of lookups) {
    for (const [key, value] of lookup.entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

function toArchiveCandidate(item: EvidenceItem): SearchCandidate {
  return {
    id: item.evidence_id,
    title: item.title,
    content: item.excerpt,
    source_type: 'evidence',
    source_system: toSourceSystem(metadataStringValue(item.metadata, 'source_system'), 'local-archive'),
    source_kind: toSourceKind(metadataStringValue(item.metadata, 'source_kind'), 'evidence'),
    confidence: item.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      ...item.metadata,
      evidence_id: item.evidence_id,
      observed_at: item.observed_at,
      source_ref: item.source_ref,
    },
  };
}

function toJcpMemoryCandidate(memory: ReturnType<JcpLiveReader['searchMemories']>[number]): SearchCandidate {
  return {
    id: `jcp:memory:${memory.id}`,
    title: memory.description ?? `JCP memory ${memory.id}`,
    content: `${memory.description ?? ''}\n${memory.content}`.trim(),
    source_type: 'memory',
    source_system: 'jarvis-memory-db',
    source_kind: toSourceKind(memory.memory_type, 'memory'),
    confidence: memory.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      raw_id: memory.id,
      source_system: 'jarvis-memory-db',
      source_kind: toSourceKind(memory.memory_type, 'memory'),
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
    source_kind: toSourceKind(entity.entity_type, 'entity'),
    confidence: entity.confidence,
    graph_depth: null,
    graph_weight: null,
    metadata: {
      raw_id: entity.id,
      source_system: 'jarvis-memory-db',
      source_kind: toSourceKind(entity.entity_type, 'entity'),
      source_ref: `jarvis-memory-db:entity:${entity.id}`,
      entity_type: entity.entity_type,
      properties: entity.properties,
    },
  };
}

function toCandidateEvidenceItem(candidate: SearchCandidate): EvidenceItem {
  const metadata = candidate.metadata as Record<string, unknown>;
  return {
    evidence_id: typeof metadata.evidence_id === 'string'
      ? metadata.evidence_id
      : `evidence:${candidate.source_type}:${candidate.id}`,
    source_ref: typeof metadata.source_ref === 'string'
      ? metadata.source_ref
      : `${candidate.source_system}:${candidate.id}`,
    title: candidate.title,
    excerpt: candidate.content,
    observed_at: typeof metadata.observed_at === 'string' ? metadata.observed_at : null,
    confidence: candidate.confidence,
    metadata,
  };
}

function buildJcpRankedLists(
  query: string,
  reader: JcpLiveReader | undefined,
): {
  readonly candidates: readonly SearchCandidate[];
  readonly rankedLists: readonly RankedList[];
  readonly evidenceByCandidateId: ReadonlyMap<string, EvidenceItem>;
} {
  if (!reader || !reader.health().ok) {
    return { candidates: [], rankedLists: [], evidenceByCandidateId: new Map() };
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

  return {
    candidates: [...memoryCandidates, ...entityCandidates],
    rankedLists,
    evidenceByCandidateId,
  };
}

function buildMemPalaceEvidenceItems(query: string): readonly EvidenceItem[] {
  const probe = probeLocalSourceAdapters().find((source) => source.reader === 'mempalace');
  if (!probe?.path || !probe.available) {
    return [];
  }

  const provider = new MemPalaceArchiveProvider(probe.path);
  if (!provider.healthSync().ok) {
    return [];
  }

  const bundle = provider.searchSync({ query, limit: 8 });
  return bundle.items.map((item) => ({
    ...item,
    metadata: {
      ...item.metadata,
      source_system: 'mempalace',
    },
  }));
}

export function buildTruthDirectBundle(
  query: string,
  store?: SqliteTruthKernelStorage,
  options: LocalArchiveRuntimeOptions = {},
): EvidenceBundle {
  const normalizedQuery = query.trim();

  if (!store) {
    return {
      bundle_id: makeTruthBundleId(normalizedQuery),
      query: normalizedQuery,
      generated_at: nowIso(),
      items: [],
    };
  }

  const evidenceItems = collectStoreEvidence(store);
  const truthEvidenceLookup = buildEvidenceLookup(evidenceItems);
  const truthResults = queryTruthDirect(normalizedQuery, {
    store,
    recallWeights: options.weights,
  });

  const pipelineItems: EvidenceItem[] = truthResults.map((result) =>
    truthEvidenceLookup.get(result.candidate.id) ?? toCandidateEvidenceItem(result.candidate),
  );

  return {
    bundle_id: makeTruthBundleId(normalizedQuery),
    query: normalizedQuery,
    generated_at: nowIso(),
    items: dedupEvidenceItems(pipelineItems).slice(0, 8),
  };
}

/**
 * Build an archive evidence bundle from live/archive sources only.
 *
 * Canonical truth recall is intentionally excluded. Truth kernel results are
 * queried separately via queryTruthDirect()/buildTruthDirectBundle().
 */
export function buildLocalArchiveBundle(
  query: string,
  store?: SqliteTruthKernelStorage,
  options: LocalArchiveRuntimeOptions = {},
): EvidenceBundle {
  const normalizedQuery = query.trim();
  const jcpRanked = buildJcpRankedLists(normalizedQuery, options.jcpLiveReader ?? createJcpLiveReader());
  const mempalaceItems = buildMemPalaceEvidenceItems(normalizedQuery);
  const mempalaceCandidates = mempalaceItems.map(toArchiveCandidate);
  const archiveEvidenceLookup = mergeEvidenceLookups(
    jcpRanked.evidenceByCandidateId,
    new Map(mempalaceItems.map((item) => [item.evidence_id, item] as const)),
  );
  const extraCandidates = [...jcpRanked.candidates, ...mempalaceCandidates];
  const extraRankedLists: RankedList[] = [
    ...jcpRanked.rankedLists,
    ...(mempalaceCandidates.length > 0 ? [{ dimension: 'keyword', results: mempalaceCandidates }] : []),
  ];

  const searchResults = store
    ? searchTruthKernel(normalizedQuery, {
        store,
        recallWeights: options.weights,
        extraCandidates,
        extraRankedLists,
      })
    : rrfFusion(extraRankedLists);

  const pipelineItems = searchResults
    .map((result) => archiveEvidenceLookup.get(result.candidate.id) ?? toCandidateEvidenceItem(result.candidate))
    .filter((item) => isArchiveSourceSystem(parseSourceSystem(metadataStringValue(item.metadata, 'source_system'))));

  return {
    bundle_id: makeArchiveBundleId(normalizedQuery),
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
          ? 'local archive provider ready for archive-only recall'
          : 'local archive provider ready',
      };
    },
  };
}
