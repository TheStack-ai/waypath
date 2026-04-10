import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertEqual } from '../../src/shared/assert';
import { createJcpLiveReader } from '../../src/adapters/jcp';
import { createJcpFixtureDb } from '../helpers/jcp-fixture';

export function runJcpLiveReaderUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-jcp-live-`);
  const dbPath = `${root}/jarvis.db`;
  createJcpFixtureDb(dbPath);

  const reader = createJcpLiveReader({ dbPath });
  const health = reader.health();
  assertEqual(health.ok, true);

  const memoryHits = reader.searchMemories('external brain', 5);
  assert(memoryHits.some((memory) => memory.id === 'mem-alpha-external-brain'), 'expected FTS memory hit');

  const entityHits = reader.searchEntities('Waypath external brain', 5);
  assert(entityHits.some((entity) => entity.id === 'tool-waypath'), 'expected FTS entity hit');

  const decisions = reader.getDecisions(10);
  assert(decisions.some((decision) => decision.id === 'dec-alpha-external-brain'), 'expected active decisions');

  const decisionHits = reader.searchDecisions('alpha', 5);
  assertEqual(decisionHits[0]?.id, 'dec-alpha-fts5');

  const relationships = reader.getRelationships(['project-alpha'], 5);
  assertEqual(relationships[0]?.object_id, 'tool-waypath');

  const entity = reader.getEntityById('project-alpha');
  assertEqual(entity?.name, 'Alpha Project');
}
