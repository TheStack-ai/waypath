import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import {
  createTruthKernelStorage,
  ensureTruthKernelSeedData,
  loadGraphSummary,
  loadSessionStartSnapshot,
} from '../../src/jarvis_fusion/truth-kernel';

export function runTruthKernelUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-truth-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store, {
    project: 'unit-project',
    objective: 'exercise sqlite truth',
    activeTask: 'truth-kernel-test',
  });

  const snapshot = loadSessionStartSnapshot(store, { projectEntityId: 'project:unit-project' });
  assert(snapshot.entities.length > 0, 'expected seeded entities');
  assert(snapshot.decisions.length > 0, 'expected seeded decisions');
  assert(snapshot.preferences.length > 0, 'expected seeded preferences');
  assert(snapshot.promotedMemories.length > 0, 'expected seeded promoted memories');
  assertEqual(snapshot.entities[0]?.entity_id, 'project:unit-project');
  assertDeepEqual(snapshot.preferences.map((preference) => preference.key), ['host_rollout']);
  assertEqual(store.countTable('relationships'), 2);

  const seededGraph = loadGraphSummary(store, { seedEntityIds: ['project:unit-project'] });
  assertDeepEqual(seededGraph.seed_entities, ['project:unit-project']);
  assert(seededGraph.related_entities.includes('task:unit-project:truth-kernel-test'), 'expected related task entity');
  assert(seededGraph.related_entities.includes('system:unit-project:codex-shim'), 'expected related host shim entity');
  assertEqual(seededGraph.relationships.length, 2);

  const timestamp = new Date().toISOString();
  store.upsertEntity({
    entity_id: 'tool:sqlite',
    entity_type: 'tool',
    name: 'SQLite',
    summary: 'Embedded persistence layer',
    state_json: JSON.stringify({ kind: 'database' }),
    status: 'active',
    canonical_page_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertRelationship({
    relationship_id: 'relationship:unit-project:task-uses-sqlite',
    from_entity_id: 'task:unit-project:truth-kernel-test',
    relation_type: 'uses_tool',
    to_entity_id: 'tool:sqlite',
    weight: 0.8,
    status: 'active',
    provenance_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  const relationship = store.getRelationship('relationship:unit-project:task-uses-sqlite');
  assertEqual(relationship?.relation_type, 'uses_tool');
  assertEqual(store.listRelationshipsForEntity('task:unit-project:truth-kernel-test').length, 2);

  const taskGraph = store.summarizeGraph({ seedEntityIds: ['task:unit-project:truth-kernel-test'], relationshipLimit: 4, relatedEntityLimit: 4 });
  assertDeepEqual(taskGraph.seed_entities, ['task:unit-project:truth-kernel-test']);
  assert(taskGraph.related_entities.includes('tool:sqlite'), 'expected graph summary to include linked tool');
  assert(taskGraph.relationships.some((item) => item.relationship_id === 'relationship:unit-project:task-uses-sqlite'), 'expected explicit relationship summary');

  store.upsertKnowledgePage({
    page: { page_id: 'page:session:unit-project', page_type: 'session_brief', title: 'unit-project session brief', status: 'canonical' },
    summary_markdown: '# unit-project',
    linked_entity_ids: ['project:unit-project'],
    linked_decision_ids: [],
    linked_evidence_bundle_ids: [],
    updated_at: new Date().toISOString(),
  });
  const page = store.getKnowledgePage('page:session:unit-project');
  assert(page?.summary_markdown.includes('# unit-project'), 'expected persisted page');

  store.createPromotionCandidate({
    candidate_id: 'promotion:test',
    subject: 'test',
    status: 'pending_review',
    summary: 'Promotion candidate recorded for explicit review: test',
    created_at: new Date().toISOString(),
  });
  const candidate = store.getPromotionCandidate('promotion:test');
  assertEqual(candidate?.status, 'pending_review');
  const reviewed = store.reviewPromotionCandidate('promotion:test', 'accepted', 'Promotion approved');
  assertEqual(reviewed?.status, 'accepted');
  assert(reviewed?.summary.includes('Promotion approved'), 'expected persisted review note');

  store.close();
}
