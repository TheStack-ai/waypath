import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assertEqual } from '../../src/shared/assert';
import { buildLocalArchiveBundle } from '../../src/jarvis_fusion/archive-provider';
import { createTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel';

export function runArchiveProviderUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-archive-provider-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  const timestamp = new Date().toISOString();

  store.upsertProvenance({
    provenance_id: 'prov:demo',
    source_system: 'demo-source',
    source_kind: 'decision',
    source_ref: 'fixture:demo',
    observed_at: timestamp,
    imported_at: timestamp,
    promoted_at: null,
    promoted_by: null,
    confidence: 0.6,
    notes: null,
  } as never);
  store.upsertProvenance({
    provenance_id: 'prov:brain',
    source_system: 'jarvis-brain-db',
    source_kind: 'decision',
    source_ref: 'fixture:brain',
    observed_at: timestamp,
    imported_at: timestamp,
    promoted_at: null,
    promoted_by: null,
    confidence: 0.6,
    notes: null,
  } as never);

  store.upsertDecision({
    decision_id: 'decision:demo',
    title: 'Ranking candidate from demo source',
    statement: 'ranking candidate from demo source',
    status: 'active',
    scope_entity_id: null,
    effective_at: timestamp,
    superseded_by: null,
    provenance_id: 'prov:demo',
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertDecision({
    decision_id: 'decision:brain',
    title: 'Ranking candidate from brain source',
    statement: 'ranking candidate from brain source',
    status: 'active',
    scope_entity_id: null,
    effective_at: timestamp,
    superseded_by: null,
    provenance_id: 'prov:brain',
    created_at: timestamp,
    updated_at: timestamp,
  });

  const defaultBundle = buildLocalArchiveBundle('ranking candidate', store);
  assertEqual(defaultBundle.items[0]?.metadata.source_system, 'jarvis-brain-db');

  const weightedBundle = buildLocalArchiveBundle('ranking candidate', store, {
    weights: {
      sourceSystems: {
        'demo-source': 4,
        'jarvis-brain-db': 0,
      },
    },
  });
  assertEqual(weightedBundle.items[0]?.metadata.source_system, 'demo-source');

  store.close();
}
