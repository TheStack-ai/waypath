import type { SourceReader, SourceSnapshot } from './source-readers-contracts.js';

export function createDemoSourceReader(project = 'jarvis-fusion-system'): SourceReader {
  return {
    name: 'demo-source',
    load(): SourceSnapshot {
      return {
        reader_name: 'demo-source',
        entities: [
          {
            entity_id: `project:${project}:imported`,
            entity_type: 'project',
            name: `${project} imported reference`,
            summary: 'Imported from a read-only source snapshot.',
            state: { imported: true },
            provenance: {
              source_system: 'demo-source',
              source_kind: 'project_snapshot',
              source_ref: `demo:${project}`,
              confidence: 0.6,
            },
          },
        ],
        relationships: [],
        decisions: [
          {
            decision_id: `decision:${project}:read-only-imports`,
            title: 'Keep source readers read-only',
            statement: 'Bootstrap imports may seed local truth, but source systems remain read-only references.',
            scope_entity_id: `project:${project}:imported`,
            provenance: {
              source_system: 'demo-source',
              source_kind: 'decision_snapshot',
              source_ref: `demo:${project}:decision`,
              confidence: 0.7,
            },
          },
        ],
        preferences: [
          {
            preference_id: `preference:${project}:import-mode`,
            subject_kind: 'project',
            subject_ref: `project:${project}:imported`,
            key: 'import_mode',
            value: 'read-only',
            strength: 'medium',
            provenance: {
              source_system: 'demo-source',
              source_kind: 'preference_snapshot',
              source_ref: `demo:${project}:preference`,
              confidence: 0.5,
            },
          },
        ],
        promoted_memories: [
          {
            memory_id: `memory:${project}:imported-note`,
            memory_type: 'project',
            access_tier: 'ops',
            summary: 'Imported memory placeholder',
            content: 'Imported from a read-only source reader into the local truth store.',
            subject_entity_id: `project:${project}:imported`,
            provenance: {
              source_system: 'demo-source',
              source_kind: 'memory_snapshot',
              source_ref: `demo:${project}:memory`,
              confidence: 0.4,
            },
          },
        ],
        promotion_candidates: [
          {
            candidate_id: `promotion:${project}:imported-candidate`,
            claim_id: `claim:${project}:imported-candidate`,
            proposed_action: 'create',
            target_object_type: 'promoted_memory',
            review_notes: 'Imported candidate awaiting explicit review.',
          },
        ],
      };
    },
  };
}
