import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertEqual } from '../../src/shared/assert';
import {
  createTruthKernelStorage,
  ensureTruthKernelSeedData,
} from '../../src/jarvis_fusion/truth-kernel';

/**
 * Test: temporal migration adds valid_from/valid_until columns and backfills.
 */
export function testTemporalMigrationBackfill(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store, { project: 'temporal-test' });

  // Seeded entities should have valid_from backfilled from created_at
  const entity = store.getEntity('project:temporal-test');
  assert(entity !== undefined, 'expected seeded entity');
  assert(entity!.valid_from !== null && entity!.valid_from !== undefined, 'expected valid_from backfilled');
  assertEqual(entity!.valid_until ?? null, null);
  // valid_from should equal created_at (set during upsert)
  assertEqual(entity!.valid_from, entity!.created_at);

  store.close();
}

/**
 * Test: listActiveEntities excludes entities with valid_until set.
 */
export function testListActiveEntitiesExcludesExpired(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-active-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const now = new Date().toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  // Insert an active entity (no valid_until)
  store.upsertEntity({
    entity_id: 'entity:active-one',
    entity_type: 'concept',
    name: 'Active Entity',
    summary: 'This should appear',
    state_json: '{}',
    status: 'active',
    canonical_page_id: null,
    created_at: now,
    updated_at: now,
  });

  // Insert an expired entity (valid_until set)
  store.upsertEntity({
    entity_id: 'entity:expired-one',
    entity_type: 'concept',
    name: 'Expired Entity',
    summary: 'This should NOT appear',
    state_json: '{}',
    status: 'active',
    canonical_page_id: null,
    created_at: past,
    updated_at: past,
    valid_from: past,
    valid_until: now,
  });

  const activeEntities = store.listActiveEntities(10);
  assert(activeEntities.some((e) => e.entity_id === 'entity:active-one'), 'active entity should appear');
  assert(!activeEntities.some((e) => e.entity_id === 'entity:expired-one'), 'expired entity should not appear');

  store.close();
}

/**
 * Test: supersedeEntity sets valid_until and marks as superseded.
 */
export function testSupersedeEntity(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-supersede-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const now = new Date().toISOString();
  store.upsertEntity({
    entity_id: 'entity:v1',
    entity_type: 'concept',
    name: 'Original Concept',
    summary: 'First version',
    state_json: '{}',
    status: 'active',
    canonical_page_id: null,
    created_at: now,
    updated_at: now,
  });

  store.upsertEntity({
    entity_id: 'entity:v2',
    entity_type: 'concept',
    name: 'Updated Concept',
    summary: 'Second version supersedes first',
    state_json: '{}',
    status: 'active',
    canonical_page_id: null,
    created_at: now,
    updated_at: now,
  });

  // Supersede v1 with v2
  store.supersedeEntity('entity:v1', 'entity:v2');

  const superseded = store.getEntity('entity:v1');
  assert(superseded !== undefined, 'superseded entity should still exist');
  assertEqual(superseded!.status, 'superseded');
  assert(superseded!.valid_until !== null && superseded!.valid_until !== undefined, 'valid_until should be set');

  // v2 should still be active
  const active = store.getEntity('entity:v2');
  assertEqual(active!.status, 'active');
  assertEqual(active!.valid_until ?? null, null);

  // listActiveEntities should only return v2
  const activeEntities = store.listActiveEntities(10);
  assert(!activeEntities.some((e) => e.entity_id === 'entity:v1'), 'superseded should not appear in active list');
  assert(activeEntities.some((e) => e.entity_id === 'entity:v2'), 'new version should appear in active list');

  store.close();
}

/**
 * Test: supersedeDecision sets valid_until and superseded_by.
 */
export function testSupersedeDecision(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-decision-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const now = new Date().toISOString();
  store.upsertDecision({
    decision_id: 'decision:old',
    title: 'Old decision',
    statement: 'We decided X',
    status: 'active',
    scope_entity_id: null,
    effective_at: now,
    superseded_by: null,
    provenance_id: null,
    created_at: now,
    updated_at: now,
  });

  store.upsertDecision({
    decision_id: 'decision:new',
    title: 'New decision',
    statement: 'We now decide Y instead',
    status: 'active',
    scope_entity_id: null,
    effective_at: now,
    superseded_by: null,
    provenance_id: null,
    created_at: now,
    updated_at: now,
  });

  store.supersedeDecision('decision:old', 'decision:new');

  const old = store.getDecision('decision:old');
  assertEqual(old!.status, 'superseded');
  assertEqual(old!.superseded_by, 'decision:new');
  assert(old!.valid_until !== null && old!.valid_until !== undefined, 'valid_until should be set on old decision');

  // listActiveDecisions should only have the new one
  const activeDecisions = store.listActiveDecisions(10);
  assert(!activeDecisions.some((d) => d.decision_id === 'decision:old'), 'old decision should not be active');
  assert(activeDecisions.some((d) => d.decision_id === 'decision:new'), 'new decision should be active');

  store.close();
}

/**
 * Test: listEntityHistory returns the entity record.
 */
export function testListEntityHistory(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-history-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const now = new Date().toISOString();
  store.upsertEntity({
    entity_id: 'entity:history-test',
    entity_type: 'concept',
    name: 'History Test',
    summary: 'For history testing',
    state_json: '{}',
    status: 'active',
    canonical_page_id: null,
    created_at: now,
    updated_at: now,
  });

  const history = store.listEntityHistory('entity:history-test');
  assertEqual(history.length, 1);
  assertEqual(history[0]!.entity_id, 'entity:history-test');
  assertEqual(history[0]!.status, 'active');

  store.close();
}

/**
 * Test: listDecisionHistory follows supersede chain.
 */
export function testListDecisionHistory(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-dhistory-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const t1 = new Date(Date.now() - 200000).toISOString();
  const t2 = new Date(Date.now() - 100000).toISOString();
  const t3 = new Date().toISOString();

  store.upsertDecision({
    decision_id: 'decision:chain:v1',
    title: 'Decision v1',
    statement: 'First version',
    status: 'superseded',
    scope_entity_id: null,
    effective_at: t1,
    superseded_by: 'decision:chain:v2',
    provenance_id: null,
    created_at: t1,
    updated_at: t1,
    valid_from: t1,
    valid_until: t2,
  });

  store.upsertDecision({
    decision_id: 'decision:chain:v2',
    title: 'Decision v2',
    statement: 'Second version',
    status: 'superseded',
    scope_entity_id: null,
    effective_at: t2,
    superseded_by: 'decision:chain:v3',
    provenance_id: null,
    created_at: t2,
    updated_at: t2,
    valid_from: t2,
    valid_until: t3,
  });

  store.upsertDecision({
    decision_id: 'decision:chain:v3',
    title: 'Decision v3',
    statement: 'Current version',
    status: 'active',
    scope_entity_id: null,
    effective_at: t3,
    superseded_by: null,
    provenance_id: null,
    created_at: t3,
    updated_at: t3,
    valid_from: t3,
  });

  // Starting from v1, should follow chain to v3
  const historyFromV1 = store.listDecisionHistory('decision:chain:v1');
  assertEqual(historyFromV1.length, 3);
  assertEqual(historyFromV1[0]!.decision_id, 'decision:chain:v1');
  assertEqual(historyFromV1[1]!.decision_id, 'decision:chain:v2');
  assertEqual(historyFromV1[2]!.decision_id, 'decision:chain:v3');

  // Starting from v3, should still get predecessors
  const historyFromV3 = store.listDecisionHistory('decision:chain:v3');
  assert(historyFromV3.length >= 1, 'should have at least the current decision');
  assert(historyFromV3.some((d) => d.decision_id === 'decision:chain:v3'), 'should include v3');

  store.close();
}

/**
 * Test: schema_meta version is 4 after migration.
 */
export function testSchemaVersion3(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-schema-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const version = store.getSchemaMetaVersionPublic('truth_kernel');
  assertEqual(version, 4);

  const temporalVersion = store.getSchemaMetaVersionPublic('temporal_version');
  assertEqual(temporalVersion, 1);

  store.close();
}

/**
 * Test: preferences temporal validity — expired preferences excluded from active list.
 */
export function testPreferenceTemporalValidity(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-temporal-pref-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);

  const now = new Date().toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  store.upsertPreference({
    preference_id: 'pref:current',
    subject_kind: 'project',
    subject_ref: null,
    key: 'theme',
    value: 'dark',
    strength: 'high',
    status: 'active',
    provenance_id: null,
    created_at: now,
    updated_at: now,
  });

  store.upsertPreference({
    preference_id: 'pref:expired',
    subject_kind: 'project',
    subject_ref: null,
    key: 'theme',
    value: 'light',
    strength: 'low',
    status: 'active',
    provenance_id: null,
    created_at: past,
    updated_at: past,
    valid_from: past,
    valid_until: now,
  });

  const activePrefs = store.listActivePreferences(10);
  assert(activePrefs.some((p) => p.preference_id === 'pref:current'), 'current pref should appear');
  assert(!activePrefs.some((p) => p.preference_id === 'pref:expired'), 'expired pref should not appear');

  store.close();
}
