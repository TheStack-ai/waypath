import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { assert, assertEqual } from '../../src/shared/assert';
import { runCli } from '../../src/cli';
import { createTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel';

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write(chunk: string) { stdout.push(chunk); } },
      stderr: { write(chunk: string) { stderr.push(chunk); } },
    },
  };
}

function createJarvisFixtureDb(path: string): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      aliases TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 1.0,
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_agent TEXT DEFAULT 'claude_code',
      access_count INTEGER DEFAULT 0,
      last_accessed TEXT,
      tier TEXT DEFAULT 'hot'
    );
    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_id TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      confidence REAL NOT NULL DEFAULT 1.0,
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_agent TEXT DEFAULT 'claude_code',
      access_count INTEGER DEFAULT 0,
      last_accessed TEXT,
      tier TEXT DEFAULT 'hot',
      weight REAL DEFAULT 1.0,
      category TEXT DEFAULT 'semantic'
    );
    CREATE TABLE decisions (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      decision TEXT NOT NULL,
      reasoning TEXT NOT NULL DEFAULT '',
      alternatives TEXT NOT NULL DEFAULT '[]',
      outcome TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 1.0,
      reversible BOOLEAN NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      related_decisions TEXT NOT NULL DEFAULT '[]',
      parent_id TEXT,
      run_id TEXT,
      score REAL
    );
    CREATE TABLE preferences (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      times_confirmed INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      project TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_validated TEXT NOT NULL,
      ttl_days INTEGER NOT NULL DEFAULT 90,
      superseded_by TEXT DEFAULT NULL,
      contradicted_by TEXT DEFAULT NULL,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      access_tier TEXT DEFAULT 'ops',
      description TEXT DEFAULT ''
    );
  `);

  db.prepare(`INSERT INTO entities (id,name,entity_type,properties,confidence,valid_from,created_at,updated_at) VALUES (:id,:name,:entity_type,:properties,:confidence,:valid_from,:created_at,:updated_at)`)
    .run({ id: 'ent-1', name: 'Jarvis User', entity_type: 'person', properties: '{"role":"operator"}', confidence: 0.9, valid_from: '2026-04-08T00:00:00Z', created_at: '2026-04-08T00:00:00Z', updated_at: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO entities (id,name,entity_type,properties,confidence,valid_from,created_at,updated_at) VALUES (:id,:name,:entity_type,:properties,:confidence,:valid_from,:created_at,:updated_at)`)
    .run({ id: 'ent-2', name: 'CyBarrier', entity_type: 'company', properties: '{"domain":"security"}', confidence: 0.95, valid_from: '2026-04-08T00:00:00Z', created_at: '2026-04-08T00:00:00Z', updated_at: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO relationships (id,subject_id,predicate,object_id,confidence,valid_from,source,created_at,updated_at,weight) VALUES (:id,:subject_id,:predicate,:object_id,:confidence,:valid_from,:source,:created_at,:updated_at,:weight)`)
    .run({ id: 'rel-1', subject_id: 'ent-1', predicate: 'works_at', object_id: 'ent-2', confidence: 0.88, valid_from: '2026-04-08T00:00:00Z', source: 'fixture', created_at: '2026-04-08T00:00:00Z', updated_at: '2026-04-08T00:00:00Z', weight: 0.88 });
  db.prepare(`INSERT INTO decisions (id,timestamp,decision,reasoning,project,confidence,status) VALUES (:id,:timestamp,:decision,:reasoning,:project,:confidence,:status)`)
    .run({ id: 'dec-1', timestamp: '2026-04-08T00:00:00Z', decision: 'Use read-only imports', reasoning: 'Preserve source ownership while seeding local truth.', project: 'fixture-project', confidence: 0.9, status: 'active' });
  db.prepare(`INSERT INTO decisions (id,timestamp,decision,reasoning,project,confidence,status) VALUES (:id,:timestamp,:decision,:reasoning,:project,:confidence,:status)`)
    .run({ id: 'dec-noise', timestamp: '2026-04-08T00:01:00Z', decision: '- **회사소개** — 라이트 배경', reasoning: '', project: 'fixture-project', confidence: 1.0, status: 'active' });
  db.prepare(`INSERT INTO preferences (id,category,key,value,confidence,source,created_at,updated_at) VALUES (:id,:category,:key,:value,:confidence,:source,:created_at,:updated_at)`)
    .run({ id: 'pref-1', category: 'communication', key: 'language', value: 'Korean default', confidence: 0.86, source: 'fixture', created_at: '2026-04-08T00:00:00Z', updated_at: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO memories (id,memory_type,content,project,tags,confidence,source,created_at,last_validated,access_tier,description) VALUES (:id,:memory_type,:content,:project,:tags,:confidence,:source,:created_at,:last_validated,:access_tier,:description)`)
    .run({ id: 'mem-1', memory_type: 'project', content: 'Imported Jarvis memory content', project: 'fixture-project', tags: '["session"]', confidence: 0.82, source: 'fixture', created_at: '2026-04-08T00:00:00Z', last_validated: '2026-04-08T00:00:00Z', access_tier: 'ops', description: 'Imported Jarvis memory' });
  db.prepare(`INSERT INTO memories (id,memory_type,content,project,tags,confidence,source,created_at,last_validated,access_tier,description) VALUES (:id,:memory_type,:content,:project,:tags,:confidence,:source,:created_at,:last_validated,:access_tier,:description)`)
    .run({ id: 'mem-noise', memory_type: 'episodic', content: '[User] <local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>', project: 'fixture-project', tags: '["noise"]', confidence: 1.0, source: 'fixture', created_at: '2026-04-08T00:02:00Z', last_validated: '2026-04-08T00:02:00Z', access_tier: 'ops', description: '' });
  db.close();
}

function createJarvisBrainFixtureDb(path: string): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL,
      current_state TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      last_updated TEXT NOT NULL
    );
    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_id TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      project TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_validated TEXT NOT NULL,
      ttl_days INTEGER NOT NULL DEFAULT 90,
      superseded_by TEXT DEFAULT NULL,
      contradicted_by TEXT DEFAULT NULL,
      verification_status TEXT NOT NULL DEFAULT 'unverified'
    );
    CREATE TABLE entity_memory_links (
      entity_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      linked_at TEXT NOT NULL
    );
  `);

  db.prepare(`INSERT INTO entities (id,entity_type,name,current_state,created_at,last_updated) VALUES (:id,:entity_type,:name,:current_state,:created_at,:last_updated)`)
    .run({ id: 'brain-ent-1', entity_type: 'system', name: 'Jarvis Brain', current_state: '{"mode":"adaptive"}', created_at: '2026-04-08T00:00:00Z', last_updated: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO entities (id,entity_type,name,current_state,created_at,last_updated) VALUES (:id,:entity_type,:name,:current_state,:created_at,:last_updated)`)
    .run({ id: 'brain-ent-2', entity_type: 'concept', name: 'External brain', current_state: '{"kind":"memory"}', created_at: '2026-04-08T00:00:00Z', last_updated: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO relationships (id,subject_id,predicate,object_id,confidence,created_at) VALUES (:id,:subject_id,:predicate,:object_id,:confidence,:created_at)`)
    .run({ id: 'brain-rel-1', subject_id: 'brain-ent-1', predicate: 'supports', object_id: 'brain-ent-2', confidence: 0.91, created_at: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO memories (id,memory_type,content,project,tags,confidence,source,created_at,last_validated) VALUES (:id,:memory_type,:content,:project,:tags,:confidence,:source,:created_at,:last_validated)`)
    .run({ id: 'brain-mem-1', memory_type: 'semantic', content: 'Jarvis Brain keeps durable graph memory.', project: 'fixture-project', tags: '["graph"]', confidence: 0.9, source: 'fixture', created_at: '2026-04-08T00:00:00Z', last_validated: '2026-04-08T00:00:00Z' });
  db.prepare(`INSERT INTO entity_memory_links (entity_id,memory_id,linked_at) VALUES (:entity_id,:memory_id,:linked_at)`)
    .run({ entity_id: 'brain-ent-1', memory_id: 'brain-mem-1', linked_at: '2026-04-08T00:00:00Z' });
  db.close();
}

export function runImportLocalCliIntegrationTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-import-local-`);
  const jarvisDbPath = join(root, 'jarvis.db');
  const jarvisBrainDbPath = join(root, 'brain.db');
  const truthDbPath = join(root, 'truth.db');

  createJarvisFixtureDb(jarvisDbPath);
  createJarvisBrainFixtureDb(jarvisBrainDbPath);

  const prevJarvis = process.env.JARVIS_FUSION_JARVIS_DB_PATH;
  const prevBrain = process.env.JARVIS_FUSION_JARVIS_BRAIN_DB_PATH;
  process.env.JARVIS_FUSION_JARVIS_DB_PATH = jarvisDbPath;
  process.env.JARVIS_FUSION_JARVIS_BRAIN_DB_PATH = jarvisBrainDbPath;

  try {
    const captured = captureIo();
    const exitCode = runCli(['import-local', '--json', '--project', 'fixture-project', '--store-path', truthDbPath], captured.io);
    assertEqual(exitCode, 0);
    const result = JSON.parse(captured.stdout.join('')) as {
      readers: string[];
      counts: { entities: number; relationships: number; decisions: number; preferences: number; promoted_memories: number; promoted_candidates: number };
    };
    assert(result.readers.includes('jarvis-memory-db'), 'expected jarvis-memory-db reader');
    assert(result.readers.includes('jarvis-brain-db'), 'expected jarvis-brain-db reader');
    assertEqual(result.counts.entities, 6);
    assertEqual(result.counts.relationships, 4);
    assertEqual(result.counts.decisions, 1);
    assertEqual(result.counts.preferences, 1);
    assertEqual(result.counts.promoted_memories, 2);
    assertEqual(result.counts.promoted_candidates, 1);

    const store = createTruthKernelStorage(truthDbPath);
    assert(store.getEntity('jarvis:entity:ent-1'), 'expected imported jarvis entity');
    assert(store.getRelationship('jarvis-brain:relationship:brain-rel-1'), 'expected imported jarvis brain relationship');
    store.close();
  } finally {
    if (prevJarvis === undefined) {
      delete process.env.JARVIS_FUSION_JARVIS_DB_PATH;
    } else {
      process.env.JARVIS_FUSION_JARVIS_DB_PATH = prevJarvis;
    }
    if (prevBrain === undefined) {
      delete process.env.JARVIS_FUSION_JARVIS_BRAIN_DB_PATH;
    } else {
      process.env.JARVIS_FUSION_JARVIS_BRAIN_DB_PATH = prevBrain;
    }
  }
}

export function runSourceStatusCliIntegrationTest(): void {
  const captured = captureIo();
  const exitCode = runCli(['source-status', '--json'], captured.io);
  assertEqual(exitCode, 0);
  const result = JSON.parse(captured.stdout.join('')) as {
    status: string;
    sources: { reader: string; adapter_status: string }[];
  };
  assertEqual(result.status, 'ready');
  assert(result.sources.some((source) => source.reader === 'jarvis-memory-db'), 'expected jarvis reader probe');
  assert(result.sources.some((source) => source.reader === 'jarvis-brain-db'), 'expected jarvis brain reader probe');
  assert(result.sources.some((source) => source.reader === 'mempalace'), 'expected mempalace probe');
}
