import {
  parseSourceKind,
  parseSourceSystem,
  type SourceKind,
  type SourceSystem,
} from '../contracts/index.js';
import type {
  ArchiveHealth,
  ArchivePointerMeta,
  ArchiveProvider,
  ArchiveSearchFilters,
  ArchiveSearchQuery,
  EvidenceBundle,
  EvidenceItem,
  JsonObject,
} from '../jarvis_fusion/contracts.js';
import { createEmptyEvidenceBundle } from './recall-boundary.js';
import { tokenize } from '../shared/text.js';
import { nowIso } from '../shared/time.js';

export interface LocalArchiveRecordInput {
  readonly evidence_id: string;
  readonly source_ref: string;
  readonly title: string;
  readonly excerpt: string;
  readonly observed_at?: string | null;
  readonly confidence?: number | null;
  readonly metadata?: JsonObject;
}

export interface LocalArchiveProviderOptions {
  readonly items?: readonly LocalArchiveRecordInput[];
  readonly sourceSystem?: SourceSystem;
  readonly sourceKind?: SourceKind;
  readonly defaultLimit?: number;
}

interface RankedEvidenceItem {
  readonly item: EvidenceItem;
  readonly score: number;
}

function metadataStringValue(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function toEvidenceItem(
  input: LocalArchiveRecordInput,
  defaults: Pick<Required<LocalArchiveProviderOptions>, 'sourceSystem' | 'sourceKind'>,
): EvidenceItem {
  return {
    evidence_id: input.evidence_id,
    source_ref: input.source_ref,
    title: input.title,
    excerpt: input.excerpt,
    observed_at: input.observed_at ?? null,
    confidence: input.confidence ?? null,
    metadata: {
      source_system: defaults.sourceSystem,
      source_kind: defaults.sourceKind,
      ...(input.metadata ?? {}),
    },
  };
}

function passesFilters(item: EvidenceItem, filters: ArchiveSearchFilters | undefined): boolean {
  if (!filters) {
    return true;
  }

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
    if (confidence < filters.minConfidence) {
      return false;
    }
  }

  return true;
}

function scoreItem(item: EvidenceItem, tokens: readonly string[]): number {
  const haystack = `${item.title}\n${item.excerpt}\n${item.source_ref}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += item.title.toLowerCase().includes(token) ? 3 : 1;
    }
  }

  if (score === 0 && tokens.length > 0) {
    return 0;
  }

  return score + (item.confidence ?? 0);
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

function makeBundleId(): string {
  return `bundle:local:${nowIso()}`;
}

export function createLocalArchiveProvider(options: LocalArchiveProviderOptions = {}): ArchiveProvider {
  const defaults = {
    sourceSystem: options.sourceSystem ?? 'local-archive',
    sourceKind: options.sourceKind ?? 'snapshot',
  } as const;
  const defaultLimit = options.defaultLimit ?? 5;
  const items = new Map<string, EvidenceItem>();

  for (const input of options.items ?? []) {
    const item = toEvidenceItem(input, defaults);
    items.set(item.evidence_id, item);
  }

  return {
    async search(query: ArchiveSearchQuery, filters?: ArchiveSearchFilters): Promise<EvidenceBundle> {
      const normalizedQuery = query.query.trim();
      if (normalizedQuery.length === 0) {
        return createEmptyEvidenceBundle(normalizedQuery);
      }

      const tokens = tokenize(normalizedQuery);
      const ranked = [...items.values()]
        .filter((item) => passesFilters(item, filters))
        .map((item) => ({ item, score: scoreItem(item, tokens) }))
        .filter((entry) => entry.score > 0);

      const limit = query.limit ?? defaultLimit;
      return {
        bundle_id: makeBundleId(),
        query: normalizedQuery,
        items: sortRankedItems(ranked).slice(0, limit),
        generated_at: nowIso(),
      };
    },
    async getItem(evidenceId: string): Promise<EvidenceItem | null> {
      return items.get(evidenceId) ?? null;
    },
    async ingestPointer(meta: ArchivePointerMeta): Promise<string> {
      const evidenceId = `evidence:${items.size + 1}`;
      const item: EvidenceItem = {
        evidence_id: evidenceId,
        source_ref: meta.source_ref,
        title: meta.source_ref,
        excerpt: meta.notes ?? '',
        observed_at: null,
        confidence: null,
        metadata: {
          source_system: meta.source_system,
          source_kind: meta.source_kind,
          notes: meta.notes ?? null,
        },
      };
      items.set(evidenceId, item);
      return evidenceId;
    },
    async health(): Promise<ArchiveHealth> {
      return {
        ok: true,
        message: `local archive provider ready with ${items.size} evidence item(s)`,
      };
    },
  };
}

export interface NoopArchiveProviderOptions {
  readonly message?: string;
}

export function createNoopArchiveProvider(options: NoopArchiveProviderOptions = {}): ArchiveProvider {
  const message = options.message ?? 'archive provider disabled';

  return {
    async search(query: ArchiveSearchQuery): Promise<EvidenceBundle> {
      return createEmptyEvidenceBundle(query.query.trim());
    },
    async getItem(): Promise<EvidenceItem | null> {
      return null;
    },
    async health(): Promise<ArchiveHealth> {
      return {
        ok: true,
        message,
      };
    },
  };
}
