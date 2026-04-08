import type {
  ArchiveHealth,
  ArchiveProvider,
  ArchiveSearchFilters,
  EvidenceBundle,
  EvidenceItem,
} from '../jarvis_fusion/contracts.js';

export interface ArchiveRecallRequest {
  readonly query: string;
  readonly limit?: number;
  readonly filters?: ArchiveSearchFilters;
}

export interface ArchiveRecallResult {
  readonly operation: 'recall';
  readonly status: 'ok' | 'empty' | 'fallback';
  readonly provider: string;
  readonly message: string;
  readonly bundle: EvidenceBundle;
}

export interface ArchiveRecallBoundary {
  recall(request: ArchiveRecallRequest): Promise<ArchiveRecallResult>;
  getItem(evidenceId: string): Promise<EvidenceItem | null>;
  health(): Promise<ArchiveHealth>;
}

export interface ArchiveRecallBoundaryOptions {
  readonly provider?: ArchiveProvider;
  readonly providerName?: string;
  readonly fallbackProvider?: ArchiveProvider;
  readonly fallbackProviderName?: string;
}

function normalizeQuery(query: string): string {
  return query.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeBundleId(scope: string): string {
  return `bundle:${scope}:${nowIso()}`;
}

export function createEmptyEvidenceBundle(query: string): EvidenceBundle {
  return {
    bundle_id: makeBundleId('empty'),
    query,
    items: [],
    generated_at: nowIso(),
  };
}

function makeSearchQuery(query: string, limit: number | undefined): { query: string; limit?: number } {
  return limit === undefined ? { query } : { query, limit };
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createArchiveRecallBoundary(options: ArchiveRecallBoundaryOptions = {}): ArchiveRecallBoundary {
  const provider = options.provider;
  const providerName = options.providerName ?? 'archive-provider';
  const fallbackProvider = options.fallbackProvider;
  const fallbackProviderName = options.fallbackProviderName ?? 'archive-fallback';

  return {
    async recall(request: ArchiveRecallRequest): Promise<ArchiveRecallResult> {
      const query = normalizeQuery(request.query);
      if (query.length === 0) {
        return {
          operation: 'recall',
          status: 'empty',
          provider: providerName,
          message: 'archive recall requires a non-empty query',
          bundle: createEmptyEvidenceBundle(query),
        };
      }

      if (!provider) {
        return {
          operation: 'recall',
          status: 'fallback',
          provider: fallbackProviderName,
          message: 'archive provider is not configured; returned empty evidence bundle',
          bundle: createEmptyEvidenceBundle(query),
        };
      }

      try {
        const bundle = await provider.search(makeSearchQuery(query, request.limit), request.filters);
        return {
          operation: 'recall',
          status: bundle.items.length > 0 ? 'ok' : 'empty',
          provider: providerName,
          message:
            bundle.items.length > 0
              ? `archive recall returned ${bundle.items.length} evidence item(s)`
              : `archive recall found no evidence for query: ${query}`,
          bundle,
        };
      } catch (error) {
        if (!fallbackProvider) {
          throw error;
        }

        const bundle = await fallbackProvider.search(makeSearchQuery(query, request.limit), request.filters);
        return {
          operation: 'recall',
          status: 'fallback',
          provider: fallbackProviderName,
          message: `archive provider failed (${messageFromError(error)}); returned fallback evidence bundle`,
          bundle,
        };
      }
    },
    async getItem(evidenceId: string): Promise<EvidenceItem | null> {
      if (!provider) {
        return null;
      }
      return provider.getItem(evidenceId);
    },
    async health(): Promise<ArchiveHealth> {
      if (!provider) {
        return {
          ok: true,
          message: 'archive provider disabled; no-op recall boundary active',
        };
      }
      return provider.health();
    },
  };
}
