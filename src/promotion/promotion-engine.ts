import type { SqliteTruthKernelStorage } from '../jarvis_fusion/truth-kernel/storage.js';
import type { PromotionCandidateView, StoredKnowledgePage } from '../contracts/index.js';
import type {
  PromotionSubmission,
  ReviewDecision,
  PromotionResult,
  PromotionSideEffect,
  TruthPayload,
  ContradictionResolution,
} from './types.js';
import type { TruthPromotionCandidateRecord } from '../jarvis_fusion/contracts.js';

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() || 'empty';
}

// Whitelist-validated table name mapping — prevents SQL injection via dynamic table names.
const VALID_TRUTH_TABLES = new Set(['entities', 'decisions', 'preferences', 'promoted_memories']);

function toTableName(targetType: string): string {
  const table =
    targetType === 'entity' ? 'entities' :
    targetType === 'decision' ? 'decisions' :
    targetType === 'preference' ? 'preferences' :
    targetType === 'promoted_memory' ? 'promoted_memories' :
    targetType;
  if (!VALID_TRUTH_TABLES.has(table)) {
    throw new Error(`Invalid truth table type: ${targetType}`);
  }
  return table;
}

function toPrimaryKey(targetType: string): string {
  if (targetType === 'entity' || targetType === 'entities') return 'entity_id';
  if (targetType === 'decision' || targetType === 'decisions') return 'decision_id';
  if (targetType === 'preference' || targetType === 'preferences') return 'preference_id';
  return 'memory_id';
}

/**
 * Write a TruthPayload to the appropriate truth table based on proposed_action.
 * Returns the primary ID of the affected record.
 */
function applyPayload(
  store: SqliteTruthKernelStorage,
  proposedAction: string,
  payload: TruthPayload,
  targetId: string | null,
  timestamp: string,
  sideEffects: PromotionSideEffect[],
): void {
  if (proposedAction === 'create' || proposedAction === 'update') {
    switch (payload.kind) {
      case 'entity': {
        store.upsertEntity({ ...payload.data, created_at: timestamp, updated_at: timestamp });
        sideEffects.push({
          kind: proposedAction === 'create' ? 'truth_created' : 'truth_updated',
          object_type: 'entity',
          object_id: payload.data.entity_id,
        });
        break;
      }
      case 'decision': {
        store.upsertDecision({ ...payload.data, created_at: timestamp, updated_at: timestamp });
        sideEffects.push({
          kind: proposedAction === 'create' ? 'truth_created' : 'truth_updated',
          object_type: 'decision',
          object_id: payload.data.decision_id,
        });
        break;
      }
      case 'preference': {
        store.upsertPreference({ ...payload.data, created_at: timestamp, updated_at: timestamp });
        sideEffects.push({
          kind: proposedAction === 'create' ? 'truth_created' : 'truth_updated',
          object_type: 'preference',
          object_id: payload.data.preference_id,
        });
        break;
      }
      case 'memory': {
        store.upsertPromotedMemory({ ...payload.data, created_at: timestamp, updated_at: timestamp });
        sideEffects.push({
          kind: proposedAction === 'create' ? 'truth_created' : 'truth_updated',
          object_type: 'promoted_memory',
          object_id: payload.data.memory_id,
        });
        break;
      }
    }
  } else if (proposedAction === 'supersede' && targetId) {
    // Derive table/pk from payload kind (whitelist safe — no user input reaches these values)
    const table = payload.kind === 'entity' ? 'entities'
      : payload.kind === 'decision' ? 'decisions'
      : payload.kind === 'preference' ? 'preferences'
      : 'promoted_memories';
    const pk = payload.kind === 'entity' ? 'entity_id'
      : payload.kind === 'decision' ? 'decision_id'
      : payload.kind === 'preference' ? 'preference_id'
      : 'memory_id';

    // For decisions, also record superseded_by to preserve the chain
    if (payload.kind === 'decision') {
      store.run(
        `UPDATE decisions SET status = 'superseded', superseded_by = :new_id, updated_at = :ts WHERE decision_id = :id`,
        { ts: timestamp, id: targetId, new_id: payload.data.decision_id },
      );
    } else {
      store.run(
        `UPDATE ${table} SET status = 'superseded', updated_at = :ts WHERE ${pk} = :id`,
        { ts: timestamp, id: targetId },
      );
    }

    // Create the new record (force status: 'active')
    switch (payload.kind) {
      case 'entity':
        store.upsertEntity({ ...payload.data, status: 'active', created_at: timestamp, updated_at: timestamp });
        sideEffects.push({ kind: 'truth_superseded', old_id: targetId, new_id: payload.data.entity_id });
        break;
      case 'decision':
        store.upsertDecision({ ...payload.data, status: 'active', created_at: timestamp, updated_at: timestamp });
        sideEffects.push({ kind: 'truth_superseded', old_id: targetId, new_id: payload.data.decision_id });
        break;
      case 'preference':
        store.upsertPreference({ ...payload.data, status: 'active', created_at: timestamp, updated_at: timestamp });
        sideEffects.push({ kind: 'truth_superseded', old_id: targetId, new_id: payload.data.preference_id });
        break;
      case 'memory':
        store.upsertPromotedMemory({ ...payload.data, status: 'active', created_at: timestamp, updated_at: timestamp });
        sideEffects.push({ kind: 'truth_superseded', old_id: targetId, new_id: payload.data.memory_id });
        break;
    }
  }
}

/**
 * Mark knowledge pages stale by text-matching the subject against page titles and summaries.
 * Returns staled page IDs. Used as a fallback when no entity IDs are available.
 */
function markRelatedPagesStale(
  store: SqliteTruthKernelStorage,
  subject: string,
  timestamp: string,
): string[] {
  const stalePageIds: string[] = [];
  const pages = store.listKnowledgePages(50);

  const subjectLower = subject.toLowerCase();
  for (const page of pages) {
    if (page.page.status === 'stale') continue;

    const isRelated =
      page.page.title.toLowerCase().includes(subjectLower) ||
      page.summary_markdown.toLowerCase().includes(subjectLower);

    if (isRelated) {
      store.upsertKnowledgePage({
        ...page,
        page: { ...page.page, status: 'stale' },
        updated_at: timestamp,
      });
      stalePageIds.push(page.page.page_id);
    }
  }

  return stalePageIds;
}

/**
 * Extract affected record IDs from side effects for entity-ID-based page staling.
 */
function affectedIdsFromSideEffects(sideEffects: readonly PromotionSideEffect[]): string[] {
  const ids: string[] = [];
  for (const se of sideEffects) {
    if (se.kind === 'truth_created' || se.kind === 'truth_updated') {
      ids.push(se.object_id);
    } else if (se.kind === 'truth_superseded') {
      ids.push(se.new_id);
    }
  }
  return ids;
}

/**
 * Submit a new promotion candidate.
 * Creates a claim record, a promotion_candidate record, and optionally records provenance.
 * All writes are atomic inside store.transaction().
 */
export function submitCandidate(
  store: SqliteTruthKernelStorage,
  submission: PromotionSubmission,
): PromotionResult {
  const timestamp = nowIso();
  const slug = slugify(submission.subject);
  const claimId = `claim:${slug}:${Date.now()}`;
  const candidateId = `promotion:${slug}`;
  const sideEffects: PromotionSideEffect[] = [];
  let provenanceId: string | null = null;

  store.transaction(() => {
    // 1. Insert claim record
    store.run(
      `INSERT INTO claims (claim_id, claim_type, claim_text, subject_entity_id, status, evidence_bundle_id, created_at, updated_at)
       VALUES (:claim_id, :claim_type, :claim_text, :subject_entity_id, :status, :evidence_bundle_id, :created_at, :updated_at)
       ON CONFLICT(claim_id) DO UPDATE SET claim_text=excluded.claim_text, updated_at=excluded.updated_at`,
      {
        claim_id: claimId,
        claim_type: submission.claim_type ?? 'general',
        claim_text: submission.claim_text ?? submission.subject,
        subject_entity_id: submission.subject_entity_id ?? null,
        status: 'active',
        evidence_bundle_id: submission.evidence_bundle_id ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    );

    // 2. Insert promotion candidate
    store.run(
      `INSERT INTO promotion_candidates (candidate_id, claim_id, proposed_action, target_object_type, target_object_id, review_status, review_notes, created_at, updated_at)
       VALUES (:candidate_id, :claim_id, :proposed_action, :target_object_type, :target_object_id, :review_status, :review_notes, :created_at, :updated_at)
       ON CONFLICT(candidate_id) DO UPDATE SET review_status=excluded.review_status, review_notes=excluded.review_notes, updated_at=excluded.updated_at`,
      {
        candidate_id: candidateId,
        claim_id: claimId,
        proposed_action: submission.proposed_action ?? 'create',
        target_object_type: submission.target_object_type ?? 'promoted_memory',
        target_object_id: submission.target_object_id ?? null,
        review_status: 'pending',
        review_notes: submission.subject,
        created_at: timestamp,
        updated_at: timestamp,
      },
    );

    // 3. Record provenance if source anchor is provided
    if (submission.source) {
      provenanceId = `provenance:submit:${slug}:${Date.now()}`;
      store.upsertProvenance({
        provenance_id: provenanceId,
        source_system: submission.source.source_system,
        source_kind: submission.source.source_kind,
        source_ref: submission.source.source_ref,
        observed_at: timestamp,
        imported_at: null,
        promoted_at: null,
        promoted_by: null,
        confidence: submission.confidence ?? null,
        notes: submission.notes ?? null,
      });
      sideEffects.push({ kind: 'provenance_recorded', provenance_id: provenanceId });
    }
  });

  const candidate = store.getPromotionCandidate(candidateId);
  const view: PromotionCandidateView = candidate ?? {
    candidate_id: candidateId,
    subject: submission.subject,
    status: 'pending_review',
    summary: `Promotion candidate recorded: ${submission.subject}`,
    created_at: timestamp,
  };

  return {
    candidate: view,
    side_effects: sideEffects,
    success: true,
    message: `Promotion candidate submitted for review: ${submission.subject}`,
  };
}

/**
 * Review a promotion candidate with full side effects.
 *
 * On acceptance:
 *   - If payload provided: creates/updates/supersedes the exact truth record specified
 *   - If no payload: creates a promoted_memory from the candidate's subject (legacy behavior)
 *   - Records provenance with promoted_by = reviewer
 *   - Marks related knowledge pages as stale (entity-ID + text matching)
 *   - Detects preference contradictions if payload.kind === 'preference'
 *
 * All writes are atomic inside store.transaction().
 */
export function reviewCandidate(
  store: SqliteTruthKernelStorage,
  decision: ReviewDecision,
): PromotionResult {
  const existing = store.getPromotionCandidate(decision.candidate_id);
  if (!existing) {
    return {
      candidate: {
        candidate_id: decision.candidate_id,
        subject: '',
        status: 'pending_review',
        summary: `Candidate not found: ${decision.candidate_id}`,
        created_at: nowIso(),
      },
      side_effects: [],
      success: false,
      message: `Promotion candidate not found: ${decision.candidate_id}`,
    };
  }

  const sideEffects: PromotionSideEffect[] = [];
  const timestamp = nowIso();

  store.transaction(() => {
    // Update candidate review status
    store.run(
      `UPDATE promotion_candidates SET review_status = :status, review_notes = COALESCE(:notes, review_notes), updated_at = :updated_at WHERE candidate_id = :id`,
      {
        id: decision.candidate_id,
        status: decision.status,
        notes: decision.notes ?? null,
        updated_at: timestamp,
      },
    );

    if (decision.status === 'accepted') {
      const claimRow = store.get<Record<string, unknown>>(
        `SELECT * FROM promotion_candidates WHERE candidate_id = :id`,
        { id: decision.candidate_id },
      );

      if (claimRow) {
        const proposedAction = String(claimRow.proposed_action ?? 'create');
        const targetType = String(claimRow.target_object_type ?? 'promoted_memory');
        const targetId = claimRow.target_object_id ? String(claimRow.target_object_id) : null;

        // Record provenance for this promotion review
        const provenanceId = `provenance:review:${slugify(decision.candidate_id)}:${Date.now()}`;
        store.upsertProvenance({
          provenance_id: provenanceId,
          source_system: 'waypath-promotion',
          source_kind: 'promotion_review',
          source_ref: decision.candidate_id,
          observed_at: null,
          imported_at: null,
          promoted_at: timestamp,
          promoted_by: decision.reviewer ?? 'operator',
          confidence: 1.0,
          notes: decision.notes ?? null,
        });
        sideEffects.push({ kind: 'provenance_recorded', provenance_id: provenanceId });

        if (decision.payload) {
          // Payload-driven: create/update/supersede the exact truth record specified
          applyPayload(store, proposedAction, decision.payload, targetId, timestamp, sideEffects);
        } else if (proposedAction === 'create' && targetType === 'promoted_memory') {
          // Legacy path: create a promoted_memory from the candidate subject
          const memoryId = `memory:promoted:${slugify(existing.subject)}:${Date.now()}`;
          store.upsertPromotedMemory({
            memory_id: memoryId,
            memory_type: 'semantic',
            access_tier: 'ops',
            summary: existing.subject,
            content: existing.summary,
            subject_entity_id: null,
            status: 'active',
            provenance_id: provenanceId,
            created_at: timestamp,
            updated_at: timestamp,
          });
          sideEffects.push({ kind: 'truth_created', object_type: 'promoted_memory', object_id: memoryId });
        } else if (proposedAction === 'supersede' && targetId) {
          // Legacy path (no payload): mark old as superseded, no new record
          store.run(
            `UPDATE ${toTableName(targetType)} SET status = 'superseded', updated_at = :ts WHERE ${toPrimaryKey(targetType)} = :id`,
            { ts: timestamp, id: targetId },
          );
          sideEffects.push({ kind: 'truth_superseded', old_id: targetId, new_id: targetId });
        } else if (proposedAction === 'update' && targetId) {
          store.run(
            `UPDATE ${toTableName(targetType)} SET updated_at = :ts WHERE ${toPrimaryKey(targetType)} = :id`,
            { ts: timestamp, id: targetId },
          );
          sideEffects.push({ kind: 'truth_updated', object_type: targetType, object_id: targetId });
        }

        // Mark related pages stale:
        // 1. Entity-ID-based (precise): for entity/decision creation via payload
        const entityAffectedIds = affectedIdsFromSideEffects(sideEffects.filter(
          (se): se is Extract<PromotionSideEffect, { kind: 'truth_created' | 'truth_updated' | 'truth_superseded' }> =>
            se.kind === 'truth_created' || se.kind === 'truth_updated' || se.kind === 'truth_superseded',
        ));
        const staledByEntityId = new Set(
          entityAffectedIds.length > 0 ? store.markKnowledgePagesStale(entityAffectedIds) : [],
        );
        for (const pageId of staledByEntityId) {
          sideEffects.push({ kind: 'page_marked_stale', page_id: pageId });
        }

        // 2. Text-based (fallback): covers promoted_memory and other cases where no entity ID available
        const staledByText = markRelatedPagesStale(store, existing.subject, timestamp);
        for (const pageId of staledByText) {
          if (!staledByEntityId.has(pageId)) {
            sideEffects.push({ kind: 'page_marked_stale', page_id: pageId });
          }
        }

        // Detect preference contradictions when a preference was promoted
        if (decision.payload?.kind === 'preference') {
          const pref = decision.payload.data;
          const contradictions = store.listOpenPreferenceContradictions(3, pref.subject_ref ?? undefined);
          for (const summary of contradictions) {
            const match = /^Preference conflict on (.*?): ([^:]+) -> .+$/u.exec(summary);
            sideEffects.push({
              kind: 'contradiction_detected',
              scope: match?.[1] ?? pref.subject_ref ?? 'workspace',
              key: match?.[2] ?? pref.key,
            });
          }
        }
      }
    }
  });

  const updated = store.getPromotionCandidate(decision.candidate_id);
  return {
    candidate: updated ?? existing,
    side_effects: sideEffects,
    success: true,
    message: `Promotion candidate ${decision.candidate_id} reviewed: ${decision.status}`,
  };
}

/**
 * List pending promotion candidates for the review queue.
 * Returns candidates with review_status 'pending' or 'needs_more_evidence', ordered by created_at ASC.
 */
export function listPendingCandidates(
  store: SqliteTruthKernelStorage,
  limit = 25,
): readonly TruthPromotionCandidateRecord[] {
  return store.all<TruthPromotionCandidateRecord>(
    `SELECT * FROM promotion_candidates
     WHERE review_status IN ('pending', 'needs_more_evidence')
     ORDER BY created_at ASC
     LIMIT :limit`,
    { limit },
  );
}

/**
 * Resolve a preference contradiction by superseding all conflicting preferences except the winner.
 * All writes are atomic inside store.transaction().
 */
export function resolveContradiction(
  store: SqliteTruthKernelStorage,
  resolution: ContradictionResolution,
): PromotionResult {
  const timestamp = nowIso();
  const sideEffects: PromotionSideEffect[] = [];

  store.transaction(() => {
    // Load all active preferences with matching key + scope
    const rows = store.all<Record<string, unknown>>(
      `SELECT * FROM preferences
       WHERE key = :key AND status = 'active'
         AND (subject_ref = :scope_ref OR (:scope_ref IS NULL AND subject_ref IS NULL))`,
      { key: resolution.key, scope_ref: resolution.scope_ref ?? null },
    );

    const keepExists = rows.some((r) => String(r.preference_id) === resolution.keep_preference_id);
    if (!keepExists) {
      throw new Error(
        `keep_preference_id '${resolution.keep_preference_id}' not found among active preferences for key '${resolution.key}'`,
      );
    }

    for (const row of rows) {
      const prefId = String(row.preference_id);
      if (prefId === resolution.keep_preference_id) continue;

      store.run(
        `UPDATE preferences SET status = 'superseded', updated_at = :ts WHERE preference_id = :id`,
        { ts: timestamp, id: prefId },
      );
      sideEffects.push({ kind: 'truth_superseded', old_id: prefId, new_id: resolution.keep_preference_id });
    }

    const provenanceId = `provenance:contradiction-resolve:${resolution.key}:${Date.now()}`;
    store.upsertProvenance({
      provenance_id: provenanceId,
      source_system: 'promotion-engine',
      source_kind: 'contradiction_resolution',
      source_ref: resolution.keep_preference_id,
      observed_at: null,
      imported_at: null,
      promoted_at: timestamp,
      promoted_by: 'operator',
      confidence: null,
      notes: resolution.resolution_notes,
    });
    sideEffects.push({ kind: 'provenance_recorded', provenance_id: provenanceId });
  });

  return {
    candidate: {
      candidate_id: resolution.keep_preference_id,
      subject: `contradiction resolved: ${resolution.key}`,
      status: 'accepted',
      summary: resolution.resolution_notes ?? `Kept ${resolution.keep_preference_id} for key ${resolution.key}`,
      created_at: timestamp,
    },
    side_effects: sideEffects,
    success: true,
    message: `Contradiction resolved for key '${resolution.key}': kept ${resolution.keep_preference_id}`,
  };
}
