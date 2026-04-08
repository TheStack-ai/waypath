import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertDeepEqual, assertEqual } from '../../src/shared/assert';
import { createSessionRuntime } from '../../src/session-runtime';
import { createTruthKernelStorage, ensureTruthKernelSeedData } from '../../src/jarvis_fusion/truth-kernel';

export function runSessionRuntimeUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/jarvis-fusion-session-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store, {
    project: 'demo-project',
    objective: 'prepare the codex shim',
    activeTask: 'bootstrap cli',
  });

  const timestamp = new Date().toISOString();
  store.upsertEntity({
    entity_id: 'project:demo-project:imported',
    entity_type: 'project',
    name: 'demo-project imported reference',
    summary: 'Imported project context from a read-only source snapshot.',
    state_json: JSON.stringify({ imported: true }),
    status: 'active',
    canonical_page_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertEntity({
    entity_id: 'system:codex-cli',
    entity_type: 'system',
    name: 'Codex CLI',
    summary: 'Host entry point used to bootstrap operator sessions.',
    state_json: JSON.stringify({ host: 'codex' }),
    status: 'active',
    canonical_page_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertDecision({
    decision_id: 'decision:demo-project:graph-briefs',
    title: 'Bridge imported references into session context',
    statement: 'Session packs should expand from imported entities into connected host systems.',
    status: 'active',
    scope_entity_id: 'project:demo-project:imported',
    effective_at: timestamp,
    superseded_by: null,
    provenance_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertPreference({
    preference_id: 'preference:demo-project:context-mode',
    subject_kind: 'project',
    subject_ref: 'project:demo-project:imported',
    key: 'context_mode',
    value: 'graph-aware',
    strength: 'high',
    status: 'active',
    provenance_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertPreference({
    preference_id: 'preference:demo-project:context-mode-conflict',
    subject_kind: 'project',
    subject_ref: 'project:demo-project:imported',
    key: 'context_mode',
    value: 'linear',
    strength: 'medium',
    status: 'active',
    provenance_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.upsertPromotedMemory({
    memory_id: 'memory:demo-project:graph-import',
    memory_type: 'project',
    access_tier: 'ops',
    summary: 'Imported graph edges should shape the initial session brief.',
    content: 'The runtime should include imported references and connected systems in the graph context.',
    subject_entity_id: 'system:codex-cli',
    status: 'active',
    provenance_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.run(
    `INSERT INTO relationships (
      relationship_id,
      from_entity_id,
      relation_type,
      to_entity_id,
      weight,
      status,
      provenance_id,
      created_at,
      updated_at
    ) VALUES (
      :relationship_id,
      :from_entity_id,
      :relation_type,
      :to_entity_id,
      :weight,
      :status,
      :provenance_id,
      :created_at,
      :updated_at
    )`,
    {
      relationship_id: 'relationship:demo-project:imported-uses-codex',
      from_entity_id: 'project:demo-project:imported',
      relation_type: 'uses_host',
      to_entity_id: 'system:codex-cli',
      weight: 0.9,
      status: 'active',
      provenance_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  );
  store.createPromotionCandidate({
    candidate_id: 'promotion:demo-project:review-me',
    subject: 'review me',
    status: 'pending_review',
    summary: 'Candidate awaiting explicit review',
    created_at: timestamp,
  });
  store.upsertKnowledgePage({
    page: {
      page_id: 'page:stale:demo-project',
      page_type: 'project_page',
      title: 'Stale project page',
      status: 'stale',
    },
    summary_markdown: '# stale',
    linked_entity_ids: ['project:demo-project'],
    linked_decision_ids: [],
    linked_evidence_bundle_ids: [],
    updated_at: timestamp,
  });

  const runtime = createSessionRuntime({ store, autoSeed: false });
  const pack = runtime.buildContextPack({
    project: 'demo-project',
    objective: 'prepare the codex shim',
    activeTask: 'bootstrap cli',
    seedEntities: ['entity-a', 'entity-b'],
  });

  assertEqual(pack.current_focus.project, 'demo-project');
  assertEqual(pack.current_focus.objective, 'prepare the codex shim');
  assertEqual(pack.current_focus.activeTask, 'bootstrap cli');
  assert(pack.truth_highlights.decisions.length > 0, 'expected seeded decisions');
  assert(pack.truth_highlights.preferences.length > 0, 'expected seeded preferences');
  assert(pack.truth_highlights.promoted_memories.length > 0, 'expected seeded promoted memories');
  assert(
    pack.truth_highlights.decisions.includes('Bridge imported references into session context'),
    'expected imported decision in truth highlights',
  );
  assert(
    pack.truth_highlights.preferences.includes('context_mode=graph-aware'),
    'expected imported preference in truth highlights',
  );
  assert(
    pack.truth_highlights.entities.includes('demo-project imported reference'),
    'expected imported entity in truth highlights',
  );
  assert(
    pack.truth_highlights.entities.includes('Codex CLI'),
    'expected graph-linked entity in truth highlights',
  );
  assertEqual(pack.truth_highlights.entities[0], 'demo-project', 'expected project entity to stay highest priority');
  assertDeepEqual(pack.graph_context.seed_entities, ['entity-a', 'entity-b']);
  assert(
    pack.graph_context.related_entities.includes('project:demo-project:imported'),
    'expected imported related entity from truth store',
  );
  assert(
    pack.graph_context.related_entities.includes('system:codex-cli'),
    'expected relationship endpoint in related entities',
  );
  assert(
    pack.graph_context.relationships.some((relationship) => relationship.includes('uses_host')),
    'expected persisted relationship summary',
  );
  assert(
    pack.graph_context.relationships.some((relationship) =>
      relationship.includes('Bridge imported references into session context'),
    ),
    'expected derived decision graph summary',
  );
  assert(
    pack.graph_context.relationships[0]?.includes('has_active_task'),
    'expected operational relationship to be prioritized first',
  );
  assert(
    pack.recent_changes.open_contradictions.some((item) => item.includes('context_mode')),
    'expected preference contradiction to surface',
  );
  assert(
    pack.recent_changes.review_queue.some((item) => item.includes('promotion:demo-project:review-me')),
    'expected pending review candidate to surface',
  );
  assert(
    pack.recent_changes.stale_items.some((item) => item.includes('page:stale:demo-project')),
    'expected stale page to surface',
  );
  assertEqual(pack.evidence_appendix.enabled, false);

  store.close();
}
