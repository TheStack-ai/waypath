import assert from 'node:assert/strict';
import test from 'node:test';

import { createTempDir, projectName, projectRoot } from './bootstrap';

test('bootstrap exposes the repo root and project name', () => {
  assert.equal(projectName, 'waypath');
  assert.equal(projectRoot(), process.cwd());
});

test('bootstrap can create temp directories for later tests', () => {
  const tempDir = createTempDir();

  assert.match(tempDir, /waypath-/);
});
