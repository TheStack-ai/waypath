import type {
  EvidenceBundle,
  EvidenceItem,
  RecallWeightOverrides,
} from '../contracts/index.js';
import { createRetrievalStrategy } from '../archive-kernel/retrieval/index.js';
import { queryTruthDirect, searchTruthKernel } from '../archive-kernel/search/index.js';
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

interface RankedEvidenceItem {
  readonly item: EvidenceItem;
  readonly score: number;
}

export interface LocalArchiveRuntimeOptions {
  readonly weights?: RecallWeightOverrides;
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

function metadataNumberValue(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function sortRankedItems(items: readonly RankedEvidenceItem[]): EvidenceItem[] {
  return [...items]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightObserved = right.item.observed_at ?? '';
      const leftObserved = left.item.observed_at ?? '';
      return rightObserved.localeCompare(leftObserved);
    })
    .map((entry) => entry.item);
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
    });
    // Merge: truth results first (priority), then archive results that aren't duplicates
    const truthIds = new Set(truthResults.map((r) => r.candidate.id));
    searchResults = [
      ...truthResults,
      ...archiveResults.filter((r) => !truthIds.has(r.candidate.id)),
    ];
  }

  // Convert ScoredResults back to EvidenceItems for backward compatibility
  const pipelineItems: EvidenceItem[] = searchResults.map((sr) => {
    const existing = evidenceItems.find((item) =>
      item.evidence_id.endsWith(sr.candidate.id) || item.title.includes(sr.candidate.title),
    );
    if (existing) return existing;

    return toItem(
      sr.candidate.source_type === 'entity' ? 'entity'
        : sr.candidate.source_type === 'decision' ? 'decision'
        : sr.candidate.source_type === 'preference' ? 'preference'
        : 'promoted_memory',
      sr.candidate.id,
      sr.candidate.title,
      sr.candidate.content,
      null,
      sr.candidate.confidence,
      sr.candidate.metadata as Record<string, unknown>,
    );
  });

  return {
    bundle_id: makeBundleId(normalizedQuery),
    query: normalizedQuery,
    generated_at: nowIso(),
    items: pipelineItems.slice(0, 8),
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
