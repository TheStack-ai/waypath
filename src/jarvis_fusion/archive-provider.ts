import type {
  ArchiveHealth,
  ArchiveProvider,
  ArchiveSearchFilters,
  ArchiveSearchQuery,
  EvidenceBundle,
  EvidenceItem,
} from './contracts.js';

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.replace(/\s+/g, '-').toLowerCase() || 'empty';
}

export function buildLocalArchiveBundle(query: string): EvidenceBundle {
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

export function createLocalArchiveProvider(): ArchiveProvider {
  return {
    async search(query: ArchiveSearchQuery, _filters?: ArchiveSearchFilters): Promise<EvidenceBundle> {
      return buildLocalArchiveBundle(query.query);
    },
    async getItem(evidenceId: string): Promise<EvidenceItem | null> {
      return {
        evidence_id: evidenceId,
        source_ref: `local:${evidenceId}`,
        title: `Local archive lookup for ${evidenceId}`,
        excerpt: `No persisted archive item exists yet for ${evidenceId}.`,
        observed_at: null,
        confidence: 0.2,
        metadata: { provider: 'local-archive-provider' },
      };
    },
    async health(): Promise<ArchiveHealth> {
      return {
        ok: true,
        message: 'local archive provider ready',
      };
    },
  };
}
