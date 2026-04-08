import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createArchiveRecallBoundary,
  createLocalArchiveProvider,
  createNoopArchiveProvider,
} from '../../src/archive-kernel';
import type {
  ArchiveHealth,
  ArchiveProvider,
  EvidenceBundle,
  EvidenceItem,
} from '../../src/jarvis_fusion/contracts';

test('local archive provider returns ranked evidence and supports filters', async () => {
  const provider = createLocalArchiveProvider({
    items: [
      {
        evidence_id: 'evidence-1',
        source_ref: 'mem://planning/1',
        title: 'Planning transcript',
        excerpt: 'Discussed archive recall boundaries and fallback behavior.',
        confidence: 0.8,
        observed_at: '2026-04-08T08:00:00.000Z',
        metadata: {
          source_system: 'mempalace',
          source_kind: 'transcript',
        },
      },
      {
        evidence_id: 'evidence-2',
        source_ref: 'mem://ops/2',
        title: 'Operations note',
        excerpt: 'Archive fallback note with lower confidence.',
        confidence: 0.3,
        observed_at: '2026-04-08T07:00:00.000Z',
        metadata: {
          source_system: 'ops-notes',
          source_kind: 'note',
        },
      },
    ],
  });

  const result = await provider.search(
    { query: 'archive fallback', limit: 5 },
    { sourceSystems: ['mempalace'], minConfidence: 0.5 },
  );

  assert.equal(result.query, 'archive fallback');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.evidence_id, 'evidence-1');
  assert.equal((await provider.getItem('evidence-1'))?.title, 'Planning transcript');
});

test('local archive provider ingestPointer adds retrievable local evidence', async () => {
  const provider = createLocalArchiveProvider();
  const evidenceId = await provider.ingestPointer?.({
    source_system: 'mempalace',
    source_kind: 'pointer',
    source_ref: 'mem://pointer/1',
    notes: 'Imported pointer for later review.',
  });

  assert.equal(Boolean(evidenceId), true);
  const item = await provider.getItem(String(evidenceId));
  assert.equal(item?.source_ref, 'mem://pointer/1');
  assert.equal(item?.excerpt, 'Imported pointer for later review.');
});

test('archive recall boundary falls back to no-op provider when primary search fails', async () => {
  const failingProvider: ArchiveProvider = {
    async search(): Promise<EvidenceBundle> {
      throw new Error('archive backend unavailable');
    },
    async getItem(): Promise<EvidenceItem | null> {
      return null;
    },
    async health(): Promise<ArchiveHealth> {
      return {
        ok: false,
        message: 'archive backend unavailable',
      };
    },
  };

  const boundary = createArchiveRecallBoundary({
    provider: failingProvider,
    providerName: 'primary-provider',
    fallbackProvider: createNoopArchiveProvider(),
    fallbackProviderName: 'noop-provider',
  });

  const result = await boundary.recall({ query: 'project history' });

  assert.equal(result.operation, 'recall');
  assert.equal(result.status, 'fallback');
  assert.equal(result.provider, 'noop-provider');
  assert.equal(result.bundle.items.length, 0);
  assert.match(result.message, /archive backend unavailable/);
});
