import { createTruthKernelStorage, type SqliteTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel/index.js';
import { submitCandidate, reviewCandidate, listPendingCandidates, resolveContradiction } from '../../src/promotion/index.js';

function nowIso(): string {
  return new Date().toISOString();
}

function createSeededStore(): SqliteTruthKernelStorage {
  const store = createTruthKernelStorage(':memory:');
  const ts = nowIso();
  store.upsertEntity({ entity_id: 'project:test', entity_type: 'project', name: 'Test', summary: 'Test project', state_json: '{}', status: 'active', canonical_page_id: null, created_at: ts, updated_at: ts });
  return store;
}

export function testSubmitCandidateCreatesRecords(): void {
  const store = createSeededStore();
  try {
    const result = submitCandidate(store, { subject: 'New important fact' });

    if (!result.success) throw new Error('Expected success');
    if (!result.candidate.candidate_id.startsWith('promotion:')) {
      throw new Error(`Expected candidate_id to start with 'promotion:', got '${result.candidate.candidate_id}'`);
    }

    // Verify candidate exists in DB
    const candidate = store.getPromotionCandidate(result.candidate.candidate_id);
    if (!candidate) throw new Error('Candidate not found in DB after submit');

    // Verify claim exists
    const claims = store.all<Record<string, unknown>>(`SELECT * FROM claims WHERE claim_id LIKE 'claim:new-important-fact%'`);
    if (claims.length === 0) throw new Error('Claim record not created');
  } finally {
    store.close();
  }
}

export function testReviewAcceptedCreatesTruth(): void {
  const store = createSeededStore();
  try {
    const submitted = submitCandidate(store, { subject: 'Accepted fact' });

    const reviewed = reviewCandidate(store, {
      candidate_id: submitted.candidate.candidate_id,
      status: 'accepted',
      notes: 'Approved for truth',
    });

    if (!reviewed.success) throw new Error('Expected success');

    // Should have created truth record
    const truthCreated = reviewed.side_effects.some((e) => e.kind === 'truth_created');
    if (!truthCreated) throw new Error('Expected truth_created side effect');

    // Should have recorded provenance
    const provenanceRecorded = reviewed.side_effects.some((e) => e.kind === 'provenance_recorded');
    if (!provenanceRecorded) throw new Error('Expected provenance_recorded side effect');

    // Verify promoted_memory exists in DB
    const memories = store.listActivePromotedMemories(10);
    const found = memories.some((m) => m.summary === 'Accepted fact');
    if (!found) throw new Error('Promoted memory not found in DB');
  } finally {
    store.close();
  }
}

export function testReviewRejectedNoTruthChanges(): void {
  const store = createSeededStore();
  try {
    const memsBefore = store.listActivePromotedMemories(10).length;

    const submitted = submitCandidate(store, { subject: 'Rejected fact' });
    reviewCandidate(store, {
      candidate_id: submitted.candidate.candidate_id,
      status: 'rejected',
      notes: 'Not approved',
    });

    const memsAfter = store.listActivePromotedMemories(10).length;
    if (memsAfter !== memsBefore) {
      throw new Error(`Expected no new memories after rejection, got ${memsAfter - memsBefore} new`);
    }
  } finally {
    store.close();
  }
}

export function testReviewNotFound(): void {
  const store = createSeededStore();
  try {
    const result = reviewCandidate(store, {
      candidate_id: 'nonexistent',
      status: 'accepted',
    });

    if (result.success) throw new Error('Expected failure for missing candidate');
    if (!result.message.includes('not found')) throw new Error(`Expected 'not found' message, got '${result.message}'`);
  } finally {
    store.close();
  }
}

export function testListPendingCandidates(): void {
  const store = createSeededStore();
  try {
    submitCandidate(store, { subject: 'Pending 1' });
    submitCandidate(store, { subject: 'Pending 2' });

    const pending = listPendingCandidates(store);
    if (pending.length < 1) {
      throw new Error(`Expected at least 1 pending candidate, got ${pending.length}`);
    }
  } finally {
    store.close();
  }
}

export function testSubmitWithEvidenceBundleLinkage(): void {
  const store = createSeededStore();
  try {
    // Create an evidence bundle
    store.upsertEvidenceBundle({
      bundle_id: 'bundle:test-evidence',
      query: 'test query',
      generated_at: nowIso(),
      items: [],
    });

    const result = submitCandidate(store, {
      subject: 'Fact with evidence',
      evidence_bundle_id: 'bundle:test-evidence',
      claim_type: 'observation',
      source: {
        source_system: 'test-system',
        source_kind: 'observation',
        source_ref: 'test-ref',
      },
    });

    if (!result.success) throw new Error('Expected success');

    // Verify claim has evidence_bundle_id
    const claims = store.all<Record<string, unknown>>(
      `SELECT * FROM claims WHERE evidence_bundle_id = 'bundle:test-evidence'`,
    );
    if (claims.length === 0) throw new Error('Expected claim with evidence_bundle_id');

    // Verify provenance was recorded
    const hasProvenance = result.side_effects.some((e) => e.kind === 'provenance_recorded');
    if (!hasProvenance) throw new Error('Expected provenance_recorded side effect');
  } finally {
    store.close();
  }
}

export function testResolveContradictionSetsInactive(): void {
  const store = createSeededStore();
  try {
    const ts = nowIso();
    // Create two conflicting preferences
    store.upsertPreference({
      preference_id: 'pref:keep',
      subject_kind: 'project',
      subject_ref: 'project:test',
      key: 'language',
      value: 'TypeScript',
      strength: 'high',
      status: 'active',
      provenance_id: null,
      created_at: ts,
      updated_at: ts,
    });
    store.upsertPreference({
      preference_id: 'pref:conflict',
      subject_kind: 'project',
      subject_ref: 'project:test',
      key: 'language',
      value: 'JavaScript',
      strength: 'medium',
      status: 'active',
      provenance_id: null,
      created_at: ts,
      updated_at: ts,
    });

    const result = resolveContradiction(store, {
      key: 'language',
      scope_ref: 'project:test',
      keep_preference_id: 'pref:keep',
      resolution_notes: 'TypeScript is the standard',
    });

    if (!result.success) throw new Error('Expected success');

    // Verify conflicting preference is now 'inactive' (not 'superseded')
    const conflictRow = store.get<Record<string, unknown>>(
      `SELECT status FROM preferences WHERE preference_id = 'pref:conflict'`,
    );
    if (String(conflictRow?.status) !== 'inactive') {
      throw new Error(`Expected 'inactive' status, got '${conflictRow?.status}'`);
    }

    // Verify kept preference is still 'active'
    const keepRow = store.get<Record<string, unknown>>(
      `SELECT status FROM preferences WHERE preference_id = 'pref:keep'`,
    );
    if (String(keepRow?.status) !== 'active') {
      throw new Error(`Expected 'active' status for kept preference, got '${keepRow?.status}'`);
    }

    // Verify provenance was recorded
    const hasProvenance = result.side_effects.some((e) => e.kind === 'provenance_recorded');
    if (!hasProvenance) throw new Error('Expected provenance_recorded side effect');
  } finally {
    store.close();
  }
}

export function testReviewWithPayloadRecordsProvenance(): void {
  const store = createSeededStore();
  try {
    const submitted = submitCandidate(store, {
      subject: 'Entity promotion',
      proposed_action: 'create',
      target_object_type: 'entity',
    });

    const reviewed = reviewCandidate(store, {
      candidate_id: submitted.candidate.candidate_id,
      status: 'accepted',
      reviewer: 'test-reviewer',
      payload: {
        kind: 'entity',
        data: {
          entity_id: 'entity:promoted',
          entity_type: 'concept',
          name: 'Promoted Concept',
          summary: 'A concept promoted through review',
          state_json: '{}',
          status: 'active',
          canonical_page_id: null,
        },
      },
    });

    if (!reviewed.success) throw new Error('Expected success');

    // Should have provenance for the review
    const provenanceEffects = reviewed.side_effects.filter((e) => e.kind === 'provenance_recorded');
    if (provenanceEffects.length === 0) throw new Error('Expected provenance_recorded for accepted review');

    // Should have created the entity
    const entity = store.getEntity('entity:promoted');
    if (!entity) throw new Error('Expected promoted entity in truth store');
    if (entity.name !== 'Promoted Concept') throw new Error('Entity name mismatch');
  } finally {
    store.close();
  }
}

export function testAcceptedPromotionMarksPageStale(): void {
  const store = createSeededStore();
  try {
    // Create a knowledge page mentioning the subject
    store.upsertKnowledgePage({
      page: { page_id: 'page:test', page_type: 'session_brief', title: 'Test important fact page', status: 'canonical' },
      summary_markdown: '# Test\nSome important fact here',
      linked_entity_ids: ['project:test'],
      linked_decision_ids: [],
      linked_evidence_bundle_ids: [],
      updated_at: nowIso(),
    });

    const submitted = submitCandidate(store, { subject: 'important fact' });
    const reviewed = reviewCandidate(store, {
      candidate_id: submitted.candidate.candidate_id,
      status: 'accepted',
    });

    // Check if page was marked stale
    const pageStale = reviewed.side_effects.some((e) => e.kind === 'page_marked_stale');
    if (!pageStale) throw new Error('Expected page_marked_stale side effect');

    // Verify page status in DB
    const page = store.getKnowledgePage('page:test');
    if (page?.page.status !== 'stale') {
      throw new Error(`Expected page status 'stale', got '${page?.page.status}'`);
    }
  } finally {
    store.close();
  }
}
