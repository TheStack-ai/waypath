import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertEqual } from '../../src/shared/assert';
import { createJarvisMemoryDbSourceReader } from '../../src/jarvis_fusion/source-readers-local';
import { createSqliteDriver } from '../../src/shared/sqlite-factory';

function createLargeJarvisFixtureDb(path: string): void {
  const db = createSqliteDriver().open(path);
  db.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      confidence REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_id TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL,
      weight REAL DEFAULT 1.0
    );
    CREATE TABLE decisions (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      decision TEXT NOT NULL,
      reasoning TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 1.0,
      project TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE preferences (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      access_tier TEXT DEFAULT 'ops',
      description TEXT DEFAULT ''
    );
  `);

  const entityStatement = db.prepare(`
    INSERT INTO entities (id, name, entity_type, properties, confidence, updated_at)
    VALUES (:id, :name, :entity_type, :properties, :confidence, :updated_at)
  `);
  const relationshipStatement = db.prepare(`
    INSERT INTO relationships (id, subject_id, predicate, object_id, confidence, updated_at, weight)
    VALUES (:id, :subject_id, :predicate, :object_id, :confidence, :updated_at, :weight)
  `);
  const decisionStatement = db.prepare(`
    INSERT INTO decisions (id, timestamp, decision, reasoning, confidence, project, status)
    VALUES (:id, :timestamp, :decision, :reasoning, :confidence, :project, :status)
  `);
  const preferenceStatement = db.prepare(`
    INSERT INTO preferences (id, category, key, value, confidence, updated_at)
    VALUES (:id, :category, :key, :value, :confidence, :updated_at)
  `);
  const memoryStatement = db.prepare(`
    INSERT INTO memories (id, memory_type, content, confidence, source, created_at, access_tier, description)
    VALUES (:id, :memory_type, :content, :confidence, :source, :created_at, :access_tier, :description)
  `);

  for (let index = 0; index < 120; index += 1) {
    const timestamp = new Date(Date.UTC(2026, 3, 10, 0, index, 0)).toISOString();
    entityStatement.run({
      id: `ent-${index}`,
      name: `Entity ${index}`,
      entity_type: 'concept',
      properties: `{"rank":${index}}`,
      confidence: 0.8,
      updated_at: timestamp,
    });
  }

  for (let index = 0; index < 120; index += 1) {
    const timestamp = new Date(Date.UTC(2026, 3, 10, 1, index, 0)).toISOString();
    relationshipStatement.run({
      id: `rel-${index}`,
      subject_id: `ent-${index}`,
      predicate: 'related_to',
      object_id: `ent-${(index + 1) % 120}`,
      confidence: 0.75,
      updated_at: timestamp,
      weight: 0.75,
    });
  }

  for (let index = 0; index < 70; index += 1) {
    const timestamp = new Date(Date.UTC(2026, 3, 10, 2, index, 0)).toISOString();
    decisionStatement.run({
      id: `dec-${index}`,
      timestamp,
      decision: `Decision ${index} keeps source imports durable`,
      reasoning: `Reasoning ${index} keeps the imported truth aligned with source recall.`,
      confidence: 0.85,
      project: 'fixture-project',
      status: 'active',
    });
  }

  for (let index = 0; index < 60; index += 1) {
    const timestamp = new Date(Date.UTC(2026, 3, 10, 3, index, 0)).toISOString();
    preferenceStatement.run({
      id: `pref-${index}`,
      category: 'workflow',
      key: `setting-${index}`,
      value: `value-${index}`,
      confidence: 0.9,
      updated_at: timestamp,
    });
  }

  for (let index = 0; index < 120; index += 1) {
    const timestamp = new Date(Date.UTC(2026, 3, 10, 4, index, 0)).toISOString();
    memoryStatement.run({
      id: `mem-${index}`,
      memory_type: 'semantic',
      content: `Memory ${index} captures enough context to stay useful after import.`,
      confidence: 0.82,
      source: 'fixture',
      created_at: timestamp,
      access_tier: 'ops',
      description: `Imported memory ${index} summary`,
    });
  }

  db.close();
}

export function runSourceReadersLocalUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-source-readers-local-`);
  const dbPath = `${root}/jarvis.db`;
  createLargeJarvisFixtureDb(dbPath);

  const previousJarvisPath = process.env.JARVIS_FUSION_JARVIS_DB_PATH;
  process.env.JARVIS_FUSION_JARVIS_DB_PATH = dbPath;

  try {
    const snapshot = createJarvisMemoryDbSourceReader('fixture-project').load();

    assertEqual(snapshot.entities.length, 101);
    assertEqual(snapshot.relationships.length, 101);
    assertEqual(snapshot.decisions.length, 50);
    assertEqual(snapshot.preferences.length, 50);
    assertEqual(snapshot.promoted_memories.length, 100);
    assertEqual(snapshot.promotion_candidates.length, 10);

    assertEqual(snapshot.entities[0]?.entity_id, 'project:fixture-project:source:jarvis-memory-db');
    assert(snapshot.entities.some((entity) => entity.entity_id === 'jarvis:entity:ent-119'), 'expected newest entity inside widened limit');
    assertEqual(snapshot.entities.some((entity) => entity.entity_id === 'jarvis:entity:ent-19'), false);
    assert(snapshot.relationships.some((relationship) => relationship.relationship_id === 'jarvis:relationship:rel-119'), 'expected newest relationship inside widened limit');
    assertEqual(snapshot.relationships.some((relationship) => relationship.relationship_id === 'jarvis:relationship:rel-19'), false);
    assert(snapshot.decisions.some((decision) => decision.decision_id === 'jarvis:decision:dec-69'), 'expected newest decision inside widened limit');
    assertEqual(snapshot.decisions.some((decision) => decision.decision_id === 'jarvis:decision:dec-19'), false);
    assert(snapshot.promoted_memories.some((memory) => memory.memory_id === 'jarvis:memory:mem-119'), 'expected newest memory inside widened limit');
    assertEqual(snapshot.promoted_memories.some((memory) => memory.memory_id === 'jarvis:memory:mem-19'), false);
  } finally {
    if (previousJarvisPath === undefined) {
      delete process.env.JARVIS_FUSION_JARVIS_DB_PATH;
    } else {
      process.env.JARVIS_FUSION_JARVIS_DB_PATH = previousJarvisPath;
    }
  }
}
