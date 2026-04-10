import { DatabaseSync } from 'node:sqlite';

export function createJcpFixtureDb(path: string, project = 'alpha'): void {
  const db = new DatabaseSync(path);
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
    CREATE VIRTUAL TABLE entities_fts USING fts5(name, entity_type, properties);
    CREATE VIRTUAL TABLE memories_fts USING fts5(content, description);
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
  const memoryStatement = db.prepare(`
    INSERT INTO memories (id, memory_type, content, confidence, source, created_at, access_tier, description)
    VALUES (:id, :memory_type, :content, :confidence, :source, :created_at, :access_tier, :description)
  `);

  const timestamp = new Date(Date.UTC(2026, 3, 10, 0, 0, 0)).toISOString();

  entityStatement.run({
    id: `project-${project}`,
    name: `${project.charAt(0).toUpperCase()}${project.slice(1)} Project`,
    entity_type: 'project',
    properties: JSON.stringify({ repo: 'jarvis-fusion-system', topic: 'external brain' }),
    confidence: 0.95,
    updated_at: timestamp,
  });
  entityStatement.run({
    id: 'tool-waypath',
    name: 'Waypath',
    entity_type: 'tool',
    properties: '{"role":"external brain","feature":"fts5 live recall"}',
    confidence: 0.92,
    updated_at: timestamp,
  });
  entityStatement.run({
    id: 'project-beta',
    name: 'Beta Project',
    entity_type: 'project',
    properties: '{"repo":"other"}',
    confidence: 0.8,
    updated_at: timestamp,
  });

  relationshipStatement.run({
    id: `rel-${project}-waypath`,
    subject_id: `project-${project}`,
    predicate: 'uses',
    object_id: 'tool-waypath',
    confidence: 0.9,
    updated_at: timestamp,
    weight: 0.9,
  });

  decisionStatement.run({
    id: `dec-${project}-external-brain`,
    timestamp,
    decision: `Adopt Waypath as external brain for ${project}`,
    reasoning: 'Session-start should query JCP live and reuse FTS5 indexes.',
    confidence: 0.96,
    project,
    status: 'active',
  });
  decisionStatement.run({
    id: `dec-${project}-fts5`,
    timestamp: new Date(Date.UTC(2026, 3, 10, 1, 0, 0)).toISOString(),
    decision: 'Use FTS5 live recall',
    reasoning: 'Recall should search memories_fts and entities_fts directly.',
    confidence: 0.94,
    project,
    status: 'active',
  });
  decisionStatement.run({
    id: 'dec-beta-unrelated',
    timestamp: new Date(Date.UTC(2026, 3, 10, 2, 0, 0)).toISOString(),
    decision: 'Ignore unrelated project',
    reasoning: 'This decision belongs to a different project lane.',
    confidence: 0.5,
    project: 'beta',
    status: 'active',
  });

  memoryStatement.run({
    id: `mem-${project}-external-brain`,
    memory_type: 'project',
    content: `${project} project uses Waypath as the external brain with live JCP recall.`,
    confidence: 0.95,
    source: 'fixture',
    created_at: timestamp,
    access_tier: 'ops',
    description: `${project} external brain rollout`,
  });
  memoryStatement.run({
    id: `mem-${project}-fts5`,
    memory_type: 'semantic',
    content: 'FTS5 live recall should query the source database directly.',
    confidence: 0.91,
    source: 'fixture',
    created_at: new Date(Date.UTC(2026, 3, 10, 3, 0, 0)).toISOString(),
    access_tier: 'ops',
    description: 'FTS5 direct query plan',
  });
  memoryStatement.run({
    id: 'mem-beta-unrelated',
    memory_type: 'semantic',
    content: 'Unrelated beta note.',
    confidence: 0.4,
    source: 'fixture',
    created_at: new Date(Date.UTC(2026, 3, 10, 4, 0, 0)).toISOString(),
    access_tier: 'notes',
    description: 'Beta note',
  });

  db.exec(`
    INSERT INTO entities_fts (rowid, name, entity_type, properties)
    SELECT rowid, name, entity_type, properties FROM entities;
    INSERT INTO memories_fts (rowid, content, description)
    SELECT rowid, content, description FROM memories;
  `);

  db.close();
}
