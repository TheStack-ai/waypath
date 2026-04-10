import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SourceAdapterEnabledMap } from '../contracts/index.js';
import type { AccessTier, MemoryType } from './contracts.js';
import type {
  ImportedDecisionInput,
  ImportedEntityInput,
  ImportedMemoryInput,
  ImportedPreferenceInput,
  ImportedPromotionCandidateInput,
  ImportedRelationshipInput,
  SourceReader,
  SourceSnapshot,
  SourceProvenanceInput,
} from './source-readers-contracts.js';

const DEFAULT_JARVIS_DB_PATH = join(homedir(), '.claude', 'jarvis', 'data', 'jarvis.db');
const DEFAULT_JARVIS_BRAIN_DB_PATH = join(homedir(), '.jarvis-orb', 'brain.db');
const DEFAULT_MEMPALACE_PATHS = [
  join(homedir(), 'claude-telegram', 'memory'),
  join(homedir(), 'MemPalace'),
  join(homedir(), 'Projects', 'MemPalace'),
  join(homedir(), 'Projects', 'mempalace'),
  join(homedir(), '.mempalace'),
] as const;

type SqliteRow = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'empty';
}

function safeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function safeJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function normalizeMemoryType(value: string): MemoryType {
  switch (value) {
    case 'episodic':
    case 'semantic':
    case 'project':
    case 'procedural':
    case 'analytical':
      return value;
    default:
      return 'semantic';
  }
}

function normalizeAccessTier(value: string | null | undefined): AccessTier {
  switch (value) {
    case 'self':
    case 'notes':
    case 'ops':
      return value;
    default:
      return 'notes';
  }
}

function prefixedId(prefix: string, kind: string, rawId: string): string {
  return `${prefix}:${kind}:${rawId}`;
}

function makeProvenance(
  sourceSystem: string,
  sourceKind: string,
  sourceRef: string,
  observedAt: string | null | undefined,
  confidence: number | null | undefined,
  notes?: string,
): SourceProvenanceInput {
  return {
    source_system: sourceSystem,
    source_kind: sourceKind,
    source_ref: sourceRef,
    observed_at: observedAt ?? null,
    confidence: confidence ?? null,
    notes: notes ?? null,
  };
}

function openReadonlyDatabase(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true });
}

function all<T extends SqliteRow>(db: DatabaseSync, sql: string, params: Record<string, unknown> = {}): readonly T[] {
  return db.prepare(sql).all(params) as readonly T[];
}

function getJarvisDbPath(): string {
  return process.env.JARVIS_FUSION_JARVIS_DB_PATH || DEFAULT_JARVIS_DB_PATH;
}

function getJarvisBrainDbPath(): string {
  return process.env.JARVIS_FUSION_JARVIS_BRAIN_DB_PATH || DEFAULT_JARVIS_BRAIN_DB_PATH;
}

function entitySummaryFromProperties(properties: Record<string, unknown>): string {
  const entries = Object.entries(properties).slice(0, 3);
  if (entries.length === 0) {
    return 'Imported from the Jarvis memory database.';
  }
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(', ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripDecisionPrefix(value: string): string {
  return value
    .replace(/^\s*[-*]\s+/u, '')
    .replace(/^\s*\d+\.\s+/u, '')
    .replace(/^\s*\*\*(.*?)\*\*:\s*/u, '$1: ')
    .replace(/^\s*[.:]\s*/u, '')
    .trim();
}

function distillDecisionTitle(value: string): string {
  const cleaned = normalizeWhitespace(stripDecisionPrefix(value));
  if (cleaned.length <= 120) return cleaned;
  return `${cleaned.slice(0, 117).trimEnd()}...`;
}

function isNoiseText(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (normalized.length === 0) return true;
  return (
    normalized.includes('<local-command-caveat>') ||
    (normalized.startsWith('topics:') && normalized.includes('messages:')) ||
    normalized.startsWith('tools used:')
  );
}

function firstMeaningfulLine(value: string): string {
  const lines = value
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0);
  return lines[0] ?? '';
}

function distillMemorySummary(description: string, content: string): string {
  const preferred = !isNoiseText(description) && description.length > 0
    ? description
    : firstMeaningfulLine(content);
  const cleaned = normalizeWhitespace(preferred);
  if (cleaned.length <= 160) return cleaned;
  return `${cleaned.slice(0, 157).trimEnd()}...`;
}

function shouldKeepDecision(rawDecision: string, rawReasoning: string): boolean {
  const decision = distillDecisionTitle(rawDecision);
  const reasoning = normalizeWhitespace(rawReasoning);
  if (decision.length < 8 || isNoiseText(decision) || isNoiseText(reasoning || decision)) {
    return false;
  }

  const raw = rawDecision.trim();
  if (reasoning.length === 0 && (/^[-*.]/u.test(raw) || raw.startsWith('**') || raw.includes('—'))) {
    return false;
  }

  return true;
}

function shouldKeepMemory(description: string, content: string): boolean {
  const summary = distillMemorySummary(description, content);
  return summary.length >= 12 && !isNoiseText(summary) && !isNoiseText(content);
}

export function localJarvisReaderAvailable(): boolean {
  return getJarvisReaderProbe().available;
}

export function localJarvisBrainReaderAvailable(): boolean {
  return getJarvisBrainReaderProbe().available;
}

export interface LocalSourceProbe {
  readonly reader: string;
  readonly available: boolean;
  readonly enabled: boolean;
  readonly path: string | null;
  readonly adapter_status: 'ready' | 'probe_only' | 'blocked' | 'missing';
}

export interface LocalSourceAdapterOptions {
  readonly enabled?: SourceAdapterEnabledMap;
}

function probeReadonlySqlite(path: string): { available: boolean; path: string | null; adapter_status: 'ready' | 'blocked' | 'missing' } {
  if (!existsSync(path)) {
    return { available: false, path: null, adapter_status: 'missing' };
  }

  try {
    const db = openReadonlyDatabase(path);
    try {
      db.prepare('SELECT 1').get();
    } finally {
      db.close();
    }
    return { available: true, path, adapter_status: 'ready' };
  } catch {
    return { available: false, path, adapter_status: 'blocked' };
  }
}

function getJarvisReaderProbe(): { available: boolean; path: string | null; adapter_status: 'ready' | 'blocked' | 'missing' } {
  return probeReadonlySqlite(getJarvisDbPath());
}

function getJarvisBrainReaderProbe(): { available: boolean; path: string | null; adapter_status: 'ready' | 'blocked' | 'missing' } {
  return probeReadonlySqlite(getJarvisBrainDbPath());
}

function isSourceAdapterEnabled(reader: string, options: LocalSourceAdapterOptions | undefined): boolean {
  const configured = options?.enabled?.[reader];
  return configured ?? true;
}

function getMemPalaceCandidatePaths(): readonly string[] {
  const envPath = process.env.JARVIS_FUSION_MEMPALACE_PATH;
  return envPath ? [envPath, ...DEFAULT_MEMPALACE_PATHS] : DEFAULT_MEMPALACE_PATHS;
}

export function probeLocalSourceAdapters(options: LocalSourceAdapterOptions = {}): readonly LocalSourceProbe[] {
  const mempalacePath = getMemPalaceCandidatePaths().find((path) => existsSync(path)) ?? null;
  const jarvisProbe = getJarvisReaderProbe();
  const jarvisBrainProbe = getJarvisBrainReaderProbe();
  return [
    {
      reader: 'jarvis-memory-db',
      available: jarvisProbe.available,
      enabled: isSourceAdapterEnabled('jarvis-memory-db', options),
      path: jarvisProbe.path,
      adapter_status: jarvisProbe.adapter_status,
    },
    {
      reader: 'jarvis-brain-db',
      available: jarvisBrainProbe.available,
      enabled: isSourceAdapterEnabled('jarvis-brain-db', options),
      path: jarvisBrainProbe.path,
      adapter_status: jarvisBrainProbe.adapter_status,
    },
    {
      reader: 'mempalace',
      available: mempalacePath !== null,
      enabled: isSourceAdapterEnabled('mempalace', options),
      path: mempalacePath,
      adapter_status: mempalacePath ? 'probe_only' : 'missing',
    },
  ];
}

export function createJarvisMemoryDbSourceReader(project = 'waypath'): SourceReader {
  const dbPath = getJarvisDbPath();
  return {
    name: 'jarvis-memory-db',
    load(): SourceSnapshot {
      const db = openReadonlyDatabase(dbPath);
      try {
        const sourceAnchorId = `project:${project}:source:jarvis-memory-db`;
        const entities = all<SqliteRow>(
          db,
          `SELECT id, name, entity_type, properties, confidence, updated_at
             FROM entities
            ORDER BY updated_at DESC
            LIMIT 100`,
        ).map<ImportedEntityInput>((row) => {
          const properties = safeJsonObject(row.properties);
          const rawId = asString(row.id);
          return {
            entity_id: prefixedId('jarvis', 'entity', rawId),
            entity_type: 'concept',
            name: asString(row.name, rawId),
            summary: entitySummaryFromProperties(properties),
            state: {
              ...properties,
              imported_from: 'jarvis-memory-db',
              source_project: project,
            },
            provenance: makeProvenance(
              'jarvis-memory-db',
              'entity',
              `${dbPath}#entities/${rawId}`,
              asString(row.updated_at, null as never),
              asNumber(row.confidence, 0.7),
            ),
          };
        });
        entities.unshift({
          entity_id: sourceAnchorId,
          entity_type: 'system',
          name: 'Jarvis memory DB reference',
          summary: `Read-only reference imported from ${dbPath}.`,
          state: {
            db_path: dbPath,
            imported_from: 'jarvis-memory-db',
            source_project: project,
          },
          provenance: makeProvenance(
            'jarvis-memory-db',
            'database',
            dbPath,
            nowIso(),
            1,
            'Local read-only adapter anchor for project-scoped recall.',
          ),
        });

        const relationships = all<SqliteRow>(
          db,
          `SELECT id, subject_id, predicate, object_id, confidence, updated_at
             FROM relationships
            ORDER BY updated_at DESC
            LIMIT 100`,
        ).map<ImportedRelationshipInput>((row) => {
          const rawId = asString(row.id);
          return {
            relationship_id: prefixedId('jarvis', 'relationship', rawId),
            from_entity_id: prefixedId('jarvis', 'entity', asString(row.subject_id)),
            relation_type: asString(row.predicate, 'related_to'),
            to_entity_id: prefixedId('jarvis', 'entity', asString(row.object_id)),
            weight: asNumber(row.weight, asNumber(row.confidence, 0.7)),
            provenance: makeProvenance(
              'jarvis-memory-db',
              'relationship',
              `${dbPath}#relationships/${rawId}`,
              asString(row.updated_at, null as never),
              asNumber(row.confidence, 0.7),
            ),
          };
        });
        relationships.unshift({
          relationship_id: `jarvis:relationship:${slugify(project)}:project-source`,
          from_entity_id: `project:${project}`,
          relation_type: 'references_source',
          to_entity_id: sourceAnchorId,
          weight: 1,
          provenance: makeProvenance(
            'jarvis-memory-db',
            'relationship',
            `${dbPath}#project-source`,
            nowIso(),
            1,
          ),
        });

        const decisions = all<SqliteRow>(
          db,
          `SELECT id, timestamp, decision, reasoning, confidence, project, status
             FROM decisions
            WHERE decision <> ''
            ORDER BY timestamp DESC
            LIMIT 50`,
        )
          .filter((row) => shouldKeepDecision(asString(row.decision), asString(row.reasoning)))
          .map<ImportedDecisionInput>((row) => {
          const rawId = asString(row.id);
          return {
            decision_id: prefixedId('jarvis', 'decision', rawId),
            title: distillDecisionTitle(asString(row.decision, `Imported decision ${rawId}`)),
            statement: normalizeWhitespace(asString(row.reasoning) || asString(row.decision)),
            scope_entity_id: sourceAnchorId,
            effective_at: asString(row.timestamp, null as never),
            provenance: makeProvenance(
              'jarvis-memory-db',
              'decision',
              `${dbPath}#decisions/${rawId}`,
              asString(row.timestamp, null as never),
              asNumber(row.confidence, 0.8),
            ),
          };
        });

        const preferences = all<SqliteRow>(
          db,
          `SELECT id, category, key, value, confidence, updated_at
             FROM preferences
            ORDER BY updated_at DESC
            LIMIT 50`,
        ).map<ImportedPreferenceInput>((row) => {
          const rawId = asString(row.id);
          return {
            preference_id: prefixedId('jarvis', 'preference', rawId),
            subject_kind: 'workspace',
            subject_ref: sourceAnchorId,
            key: `${asString(row.category, 'general')}.${asString(row.key, rawId)}`,
            value: asString(row.value),
            strength: asNumber(row.confidence, 0.8) >= 0.85 ? 'high' : 'medium',
            provenance: makeProvenance(
              'jarvis-memory-db',
              'preference',
              `${dbPath}#preferences/${rawId}`,
              asString(row.updated_at, null as never),
              asNumber(row.confidence, 0.8),
            ),
          };
        });

        const memories = all<SqliteRow>(
          db,
          `SELECT id, memory_type, content, confidence, source, created_at, access_tier, description
             FROM memories
            ORDER BY created_at DESC
            LIMIT 100`,
        )
          .filter((row) => shouldKeepMemory(asString(row.description), asString(row.content)))
          .map<ImportedMemoryInput>((row) => {
          const rawId = asString(row.id);
          const description = normalizeWhitespace(asString(row.description));
          const content = asString(row.content);
          return {
            memory_id: prefixedId('jarvis', 'memory', rawId),
            memory_type: normalizeMemoryType(asString(row.memory_type, 'semantic')),
            access_tier: normalizeAccessTier(asString(row.access_tier)),
            summary: distillMemorySummary(description, content),
            content,
            subject_entity_id: sourceAnchorId,
            provenance: makeProvenance(
              'jarvis-memory-db',
              'memory',
              `${dbPath}#memories/${rawId}`,
              asString(row.created_at, null as never),
              asNumber(row.confidence, 0.7),
              asString(row.source, 'jarvis-memory-db'),
            ),
          };
        });

        const promotionCandidates: ImportedPromotionCandidateInput[] = decisions.slice(0, 10).map((decision) => ({
          candidate_id: prefixedId('jarvis', 'promotion-candidate', slugify(decision.decision_id)),
          claim_id: prefixedId('jarvis', 'claim', slugify(decision.decision_id)),
          proposed_action: 'create',
          target_object_type: 'decision',
          target_object_id: decision.decision_id,
          review_status: 'pending',
          review_notes: `Imported from Jarvis decision: ${decision.title}`,
        }));

        return {
          reader_name: 'jarvis-memory-db',
          entities,
          relationships,
          decisions,
          preferences,
          promoted_memories: memories,
          promotion_candidates: promotionCandidates,
        };
      } finally {
        db.close();
      }
    },
  };
}

export function createJarvisBrainDbSourceReader(project = 'waypath'): SourceReader {
  const dbPath = getJarvisBrainDbPath();
  return {
    name: 'jarvis-brain-db',
    load(): SourceSnapshot {
      const db = openReadonlyDatabase(dbPath);
      try {
        const sourceAnchorId = `project:${project}:source:jarvis-brain-db`;
        const entityRows = all<SqliteRow>(
          db,
          `SELECT id, entity_type, name, current_state, created_at, last_updated
             FROM entities
            ORDER BY last_updated DESC
            LIMIT 10`,
        );
        const entities = entityRows.map<ImportedEntityInput>((row) => {
          const rawId = asString(row.id);
          const state = safeJsonObject(row.current_state);
          return {
            entity_id: prefixedId('jarvis-brain', 'entity', rawId),
            entity_type: 'concept',
            name: asString(row.name, rawId),
            summary: entitySummaryFromProperties(state),
            state: {
              ...state,
              imported_from: 'jarvis-brain-db',
              source_project: project,
            },
            provenance: makeProvenance(
              'jarvis-brain-db',
              'entity',
              `${dbPath}#entities/${rawId}`,
              asString(row.last_updated || row.created_at, null as never),
              0.75,
            ),
          };
        });
        entities.unshift({
          entity_id: sourceAnchorId,
          entity_type: 'system',
          name: 'Jarvis brain DB reference',
          summary: `Read-only reference imported from ${dbPath}.`,
          state: {
            db_path: dbPath,
            imported_from: 'jarvis-brain-db',
            source_project: project,
          },
          provenance: makeProvenance(
            'jarvis-brain-db',
            'database',
            dbPath,
            nowIso(),
            1,
            'Local read-only adapter anchor for project-scoped recall.',
          ),
        });

        const relationships = all<SqliteRow>(
          db,
          `SELECT id, subject_id, predicate, object_id, confidence, created_at
             FROM relationships
            ORDER BY created_at DESC
            LIMIT 16`,
        ).map<ImportedRelationshipInput>((row) => {
          const rawId = asString(row.id);
          return {
            relationship_id: prefixedId('jarvis-brain', 'relationship', rawId),
            from_entity_id: prefixedId('jarvis-brain', 'entity', asString(row.subject_id)),
            relation_type: asString(row.predicate, 'related_to'),
            to_entity_id: prefixedId('jarvis-brain', 'entity', asString(row.object_id)),
            weight: asNumber(row.confidence, 0.8),
            provenance: makeProvenance(
              'jarvis-brain-db',
              'relationship',
              `${dbPath}#relationships/${rawId}`,
              asString(row.created_at, null as never),
              asNumber(row.confidence, 0.8),
            ),
          };
        });
        relationships.unshift({
          relationship_id: `jarvis-brain:relationship:${slugify(project)}:project-source`,
          from_entity_id: `project:${project}`,
          relation_type: 'references_source',
          to_entity_id: sourceAnchorId,
          weight: 1,
          provenance: makeProvenance(
            'jarvis-brain-db',
            'relationship',
            `${dbPath}#project-source`,
            nowIso(),
            1,
          ),
        });

        const subjectByMemoryId = new Map<string, string>();
        for (const row of all<SqliteRow>(
          db,
          `SELECT entity_id, memory_id
             FROM entity_memory_links
            ORDER BY linked_at DESC
            LIMIT 24`,
        )) {
          const memoryId = asString(row.memory_id);
          if (!subjectByMemoryId.has(memoryId)) {
            subjectByMemoryId.set(memoryId, prefixedId('jarvis-brain', 'entity', asString(row.entity_id)));
          }
        }

        const memories = all<SqliteRow>(
          db,
          `SELECT id, memory_type, content, confidence, source, created_at
             FROM memories
            ORDER BY created_at DESC
            LIMIT 12`,
        )
          .filter((row) => shouldKeepMemory('', asString(row.content)))
          .map<ImportedMemoryInput>((row) => {
          const rawId = asString(row.id);
          const content = asString(row.content);
          return {
            memory_id: prefixedId('jarvis-brain', 'memory', rawId),
            memory_type: normalizeMemoryType(asString(row.memory_type, 'semantic')),
            access_tier: 'notes',
            summary: distillMemorySummary('', content),
            content,
            subject_entity_id: subjectByMemoryId.get(rawId) ?? sourceAnchorId,
            provenance: makeProvenance(
              'jarvis-brain-db',
              'memory',
              `${dbPath}#memories/${rawId}`,
              asString(row.created_at, null as never),
              asNumber(row.confidence, 0.75),
              asString(row.source, 'jarvis-brain-db'),
            ),
          };
        });

        return {
          reader_name: 'jarvis-brain-db',
          entities,
          relationships,
          decisions: [],
          preferences: [],
          promoted_memories: memories,
          promotion_candidates: [],
        };
      } finally {
        db.close();
      }
    },
  };
}

export function detectAvailableLocalReaderNames(options: LocalSourceAdapterOptions = {}): string[] {
  const names: string[] = [];
  if (localJarvisReaderAvailable() && isSourceAdapterEnabled('jarvis-memory-db', options)) {
    names.push('jarvis-memory-db');
  }
  if (localJarvisBrainReaderAvailable() && isSourceAdapterEnabled('jarvis-brain-db', options)) {
    names.push('jarvis-brain-db');
  }
  return names;
}
