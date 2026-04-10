import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemPalaceArchiveProvider } from '../../src/adapters/mempalace';
import { assert, assertEqual } from '../../src/shared/assert';

function repeatWords(prefix: string, count: number): string {
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    words.push(`${prefix}${index}`);
  }
  return words.join(' ');
}

export async function runMemPalaceProviderUnitTest(): Promise<void> {
  const root = mkdtempSync(`${tmpdir()}/waypath-mempalace-`);
  const projectsDir = join(root, 'projects');
  const peopleDir = join(root, 'people');
  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(peopleDir, { recursive: true });

  writeFileSync(
    join(projectsDir, 'waypath.md'),
    [
      '# Waypath',
      '',
      repeatWords('context', 620),
      '',
      'tailmarker durable recall chunk target',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(peopleDir, 'alice.md'),
    [
      '# Alice',
      '',
      'Alice owns the human context around MemPalace retrieval.',
      '',
    ].join('\n'),
  );

  const provider = new MemPalaceArchiveProvider(root);
  const bundle = await provider.search({ query: 'tailmarker durable recall', limit: 5 });

  assert(bundle.items.length > 0, 'expected mempalace search results');
  const firstItem = bundle.items[0]!;
  assertEqual(firstItem.title, 'Waypath');
  assertEqual(String(firstItem.metadata.source_kind), 'projects');
  assert(typeof firstItem.metadata.chunk_index === 'number' && firstItem.metadata.chunk_index > 0, 'expected chunk-level result from recursive chunker');

  const fullItem = await provider.getItem(firstItem.evidence_id);
  assert(fullItem?.excerpt.includes('# Waypath'), 'expected getItem to return full file content');
  assert(fullItem?.excerpt.includes('tailmarker durable recall chunk target'), 'expected getItem to preserve matching content');

  const filteredBundle = await provider.search(
    { query: 'alice', limit: 5 },
    { sourceKinds: ['people'] },
  );
  assertEqual(filteredBundle.items.length, 1);
  assertEqual(filteredBundle.items[0]?.title, 'Alice');

  const health = await provider.health();
  assertEqual(health.ok, true);
  assert(health.message.includes('2 markdown file(s)'), 'expected file count in health message');
}
