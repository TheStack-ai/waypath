import type { ImportResult } from '../contracts/index.js';
import { createDemoSourceReader } from './source-readers-demo.js';
import {
  createJarvisBrainDbSourceReader,
  createJarvisMemoryDbSourceReader,
  detectAvailableLocalReaderNames,
  type LocalSourceAdapterOptions,
} from './source-readers-local.js';
import type { BootstrapImportManifest, BootstrapImportResult, SourceReader } from './source-readers-contracts.js';
import { SqliteTruthKernelStorage } from './truth-kernel/index.js';
import { nowIso } from '../shared/time.js';

function buildReaders(manifest: BootstrapImportManifest, project: string): SourceReader[] {
  return manifest.reader_names.map((name) => {
    if (name === 'demo-source') return createDemoSourceReader(project);
    if (name === 'jarvis-memory-db') return createJarvisMemoryDbSourceReader(project);
    if (name === 'jarvis-brain-db') return createJarvisBrainDbSourceReader(project);
    throw new Error(`Unknown source reader: ${name}`);
  });
}

export function createLocalImportManifest(project: string, options: LocalSourceAdapterOptions = {}): BootstrapImportManifest {
  const readerNames = detectAvailableLocalReaderNames(options);
  return {
    manifest_id: `local-import:${project}`,
    import_mode: 'bootstrap',
    reader_names: readerNames,
  };
}

export function runBootstrapImport(store: SqliteTruthKernelStorage, manifest: BootstrapImportManifest, project: string): BootstrapImportResult {
  const readers = buildReaders(manifest, project);
  let importedEntities = 0;
  let importedRelationships = 0;
  let importedDecisions = 0;
  let importedPreferences = 0;
  let importedMemories = 0;
  let importedCandidates = 0;
  const importedAt = nowIso();

  for (const reader of readers) {
    const snapshot = reader.load();
    store.transaction(() => {
      for (const entity of snapshot.entities) {
        const provenanceId = store.upsertProvenance({
          provenance_id: `provenance:${entity.provenance.source_system}:${entity.provenance.source_ref}`,
          source_system: entity.provenance.source_system,
          source_kind: entity.provenance.source_kind,
          source_ref: entity.provenance.source_ref,
          observed_at: entity.provenance.observed_at ?? null,
          imported_at: importedAt,
          promoted_at: null,
          promoted_by: null,
          confidence: entity.provenance.confidence ?? null,
          notes: entity.provenance.notes ?? null,
        } as never);
        store.upsertEntity({
          entity_id: entity.entity_id,
          entity_type: entity.entity_type,
          name: entity.name,
          summary: entity.summary,
          state_json: JSON.stringify({ ...entity.state, provenance_id: provenanceId }),
          status: entity.status ?? 'active',
          canonical_page_id: null,
          created_at: importedAt,
          updated_at: importedAt,
        });
        importedEntities += 1;
      }

      for (const relationship of snapshot.relationships) {
        const provenanceId = store.upsertProvenance({
          provenance_id: `provenance:${relationship.provenance.source_system}:${relationship.provenance.source_ref}`,
          source_system: relationship.provenance.source_system,
          source_kind: relationship.provenance.source_kind,
          source_ref: relationship.provenance.source_ref,
          observed_at: relationship.provenance.observed_at ?? null,
          imported_at: importedAt,
          promoted_at: null,
          promoted_by: null,
          confidence: relationship.provenance.confidence ?? null,
          notes: relationship.provenance.notes ?? null,
        } as never);
        store.upsertRelationship({
          relationship_id: relationship.relationship_id,
          from_entity_id: relationship.from_entity_id,
          relation_type: relationship.relation_type,
          to_entity_id: relationship.to_entity_id,
          weight: relationship.weight ?? null,
          status: relationship.status ?? 'active',
          provenance_id: provenanceId,
          created_at: importedAt,
          updated_at: importedAt,
        });
        importedRelationships += 1;
      }

      for (const decision of snapshot.decisions) {
        const provenanceId = store.upsertProvenance({
          provenance_id: `provenance:${decision.provenance.source_system}:${decision.provenance.source_ref}`,
          source_system: decision.provenance.source_system,
          source_kind: decision.provenance.source_kind,
          source_ref: decision.provenance.source_ref,
          observed_at: decision.provenance.observed_at ?? null,
          imported_at: importedAt,
          promoted_at: null,
          promoted_by: null,
          confidence: decision.provenance.confidence ?? null,
          notes: decision.provenance.notes ?? null,
        } as never);
        store.upsertDecision({
          decision_id: decision.decision_id,
          title: decision.title,
          statement: decision.statement,
          status: decision.status ?? 'active',
          scope_entity_id: decision.scope_entity_id ?? null,
          effective_at: decision.effective_at ?? null,
          superseded_by: null,
          provenance_id: provenanceId,
          created_at: importedAt,
          updated_at: importedAt,
        });
        importedDecisions += 1;
      }

      for (const preference of snapshot.preferences) {
        const provenanceId = store.upsertProvenance({
          provenance_id: `provenance:${preference.provenance.source_system}:${preference.provenance.source_ref}`,
          source_system: preference.provenance.source_system,
          source_kind: preference.provenance.source_kind,
          source_ref: preference.provenance.source_ref,
          observed_at: preference.provenance.observed_at ?? null,
          imported_at: importedAt,
          promoted_at: null,
          promoted_by: null,
          confidence: preference.provenance.confidence ?? null,
          notes: preference.provenance.notes ?? null,
        } as never);
        store.upsertPreference({
          preference_id: preference.preference_id,
          subject_kind: preference.subject_kind,
          subject_ref: preference.subject_ref ?? null,
          key: preference.key,
          value: preference.value,
          strength: preference.strength,
          status: preference.status ?? 'active',
          provenance_id: provenanceId,
          created_at: importedAt,
          updated_at: importedAt,
        });
        importedPreferences += 1;
      }

      for (const memory of snapshot.promoted_memories) {
        const provenanceId = store.upsertProvenance({
          provenance_id: `provenance:${memory.provenance.source_system}:${memory.provenance.source_ref}`,
          source_system: memory.provenance.source_system,
          source_kind: memory.provenance.source_kind,
          source_ref: memory.provenance.source_ref,
          observed_at: memory.provenance.observed_at ?? null,
          imported_at: importedAt,
          promoted_at: null,
          promoted_by: null,
          confidence: memory.provenance.confidence ?? null,
          notes: memory.provenance.notes ?? null,
        } as never);
        store.upsertPromotedMemory({
          memory_id: memory.memory_id,
          memory_type: memory.memory_type,
          access_tier: memory.access_tier,
          summary: memory.summary,
          content: memory.content,
          subject_entity_id: memory.subject_entity_id ?? null,
          status: memory.status ?? 'active',
          provenance_id: provenanceId,
          created_at: importedAt,
          updated_at: importedAt,
        });
        importedMemories += 1;
      }

      for (const candidate of snapshot.promotion_candidates) {
        store.createPromotionCandidate({
          candidate_id: candidate.candidate_id,
          subject: candidate.review_notes ?? candidate.candidate_id,
          status: candidate.review_status === 'accepted' ? 'accepted' : 'pending_review',
          summary: candidate.review_notes ?? 'Imported promotion candidate awaiting explicit review.',
          created_at: importedAt,
        });
        importedCandidates += 1;
      }
    });
  }

  return {
    manifest_id: manifest.manifest_id,
    import_mode: manifest.import_mode,
    imported_at: importedAt,
    readers: readers.map((reader) => reader.name),
    imported_entities: importedEntities,
    imported_relationships: importedRelationships,
    imported_decisions: importedDecisions,
    imported_preferences: importedPreferences,
    imported_memories: importedMemories,
    imported_promotion_candidates: importedCandidates,
  };
}

export function toImportResult(result: BootstrapImportResult, storePath: string): ImportResult {
  const run = {
    manifest_id: result.manifest_id,
    mode: result.import_mode,
    imported_at: result.imported_at,
    reader_names: result.readers,
    source_anchors: result.readers.map((reader) => ({
      source_system: reader,
      source_kind: 'import_reader',
      source_ref: `${result.manifest_id}#${reader}`,
    })),
  };
  return {
    operation: 'import',
    status: 'imported',
    mode: result.import_mode,
    manifest_id: result.manifest_id,
    readers: result.readers,
    imported_at: result.imported_at,
    run,
    store_path: storePath,
    counts: {
      provenance:
        result.imported_entities +
        result.imported_relationships +
        result.imported_decisions +
        result.imported_preferences +
        result.imported_memories,
      entities: result.imported_entities,
      relationships: result.imported_relationships,
      decisions: result.imported_decisions,
      preferences: result.imported_preferences,
      promoted_memories: result.imported_memories,
      promoted_candidates: result.imported_promotion_candidates,
    },
    message: `Imported ${result.imported_entities} entities, ${result.imported_relationships} relationships, ${result.imported_decisions} decisions, ${result.imported_preferences} preferences, ${result.imported_memories} memories, and ${result.imported_promotion_candidates} promotion candidates.`,
  };
}
