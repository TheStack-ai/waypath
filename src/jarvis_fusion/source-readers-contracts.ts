import type { AccessTier, EntityType, MemoryType, PromotionAction, TruthStatus } from './contracts.js';
import type { ImportMode } from '../contracts/index.js';

export interface SourceProvenanceInput {
  readonly source_system: string;
  readonly source_kind: string;
  readonly source_ref: string;
  readonly observed_at?: string | null;
  readonly confidence?: number | null;
  readonly notes?: string | null;
}

export interface ImportedEntityInput {
  readonly entity_id: string;
  readonly entity_type: EntityType;
  readonly name: string;
  readonly summary: string;
  readonly state: Record<string, unknown>;
  readonly status?: TruthStatus;
  readonly provenance: SourceProvenanceInput;
}

export interface ImportedDecisionInput {
  readonly decision_id: string;
  readonly title: string;
  readonly statement: string;
  readonly scope_entity_id?: string | null;
  readonly effective_at?: string | null;
  readonly status?: TruthStatus;
  readonly provenance: SourceProvenanceInput;
}

export interface ImportedPreferenceInput {
  readonly preference_id: string;
  readonly subject_kind: string;
  readonly subject_ref?: string | null;
  readonly key: string;
  readonly value: string;
  readonly strength: string;
  readonly status?: TruthStatus;
  readonly provenance: SourceProvenanceInput;
}

export interface ImportedMemoryInput {
  readonly memory_id: string;
  readonly memory_type: MemoryType;
  readonly access_tier: AccessTier;
  readonly summary: string;
  readonly content: string;
  readonly subject_entity_id?: string | null;
  readonly status?: TruthStatus;
  readonly provenance: SourceProvenanceInput;
}

export interface ImportedPromotionCandidateInput {
  readonly candidate_id: string;
  readonly claim_id: string;
  readonly proposed_action: PromotionAction;
  readonly target_object_type: string;
  readonly target_object_id?: string | null;
  readonly review_status?: 'pending' | 'accepted' | 'rejected' | 'superseded' | 'needs_more_evidence';
  readonly review_notes?: string | null;
}

export interface SourceSnapshot {
  readonly reader_name: string;
  readonly entities: ImportedEntityInput[];
  readonly decisions: ImportedDecisionInput[];
  readonly preferences: ImportedPreferenceInput[];
  readonly promoted_memories: ImportedMemoryInput[];
  readonly promotion_candidates: ImportedPromotionCandidateInput[];
}

export interface SourceReader {
  readonly name: string;
  load(): SourceSnapshot;
}

export interface BootstrapImportManifest {
  readonly manifest_id: string;
  readonly import_mode: ImportMode;
  readonly reader_names: string[];
}

export interface BootstrapImportResult {
  readonly manifest_id: string;
  readonly import_mode: ImportMode;
  readonly imported_at: string;
  readonly readers: string[];
  readonly imported_entities: number;
  readonly imported_decisions: number;
  readonly imported_preferences: number;
  readonly imported_memories: number;
  readonly imported_promotion_candidates: number;
}
