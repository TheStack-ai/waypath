import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, assertEqual } from '../../src/shared/assert';
import { createJcpLiveReader } from '../../src/adapters/jcp';
import { buildLocalArchiveBundle, buildTruthDirectBundle } from '../../src/jarvis_fusion/archive-provider';
import { createTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel';
import { createJcpFixtureDb } from '../helpers/jcp-fixture';

export function runArchiveProviderUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-archive-provider-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  const jcpDbPath = `${root}/jarvis.db`;
  const mempalaceRoot = `${root}/mempalace`;
  const timestamp = new Date().toISOString();
  const previousJarvisPath = process.env.JARVIS_FUSION_JARVIS_DB_PATH;
  const previousMemPalacePath = process.env.JARVIS_FUSION_MEMPALACE_PATH;

  createJcpFixtureDb(jcpDbPath);
  mkdirSync(join(mempalaceRoot, 'projects'), { recursive: true });
  writeFileSync(
    join(mempalaceRoot, 'projects', 'alpha.md'),
    [
      '# Alpha Archive',
      '',
      'MemPalace keeps the external brain rollout and archive ranking notes.',
      '',
    ].join('\n'),
  );

  process.env.JARVIS_FUSION_JARVIS_DB_PATH = jcpDbPath;
  process.env.JARVIS_FUSION_MEMPALACE_PATH = mempalaceRoot;
  const jcpLiveReader = createJcpLiveReader(jcpDbPath);

  try {
    store.upsertDecision({
      decision_id: 'decision:truth-external-brain',
      title: 'Truth kernel external brain policy',
      statement: 'Truth-only recall should remain separate from archive evidence.',
      status: 'active',
      scope_entity_id: null,
      effective_at: timestamp,
      superseded_by: null,
      provenance_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    store.upsertDecision({
      decision_id: 'decision:truth-only-leak-sentinel',
      title: 'Truth-only zzqv sentinel neutron phrase',
      statement: 'zzqv sentinel neutron exists only in the truth kernel and must never leak into archive bundles.',
      status: 'active',
      scope_entity_id: null,
      effective_at: timestamp,
      superseded_by: null,
      provenance_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    const truthBundle = buildTruthDirectBundle('external brain', store);
    assert(
      truthBundle.items.some((item) => item.metadata.source_system === 'truth-kernel'),
      'expected truth-direct bundle to contain truth-kernel items',
    );
    assert(
      truthBundle.items.some((item) => item.title.includes('Truth kernel external brain policy')),
      'expected truth-direct bundle to contain matching truth decision',
    );

    const archiveBundle = buildLocalArchiveBundle('external brain', store, { jcpLiveReader });
    assert(archiveBundle.items.length > 0, 'expected archive recall results from live providers');
    assert(
      archiveBundle.items.every((item) => {
        const sourceSystem = String(item.metadata.source_system ?? '');
        return sourceSystem === 'jarvis-memory-db' || sourceSystem === 'mempalace';
      }),
      'expected archive bundle to contain only JCP/MemPalace items',
    );
    assertEqual(
      archiveBundle.items.some((item) => item.metadata.source_system === 'truth-kernel'),
      false,
    );
    assert(
      archiveBundle.items.some((item) => item.metadata.source_system === 'jarvis-memory-db'),
      'expected JCP item in archive bundle',
    );
    assert(
      archiveBundle.items.some((item) => item.metadata.source_system === 'mempalace'),
      'expected MemPalace item in archive bundle',
    );

    store.upsertEvidenceBundle({
      bundle_id: 'bundle:archive:weighted',
      query: 'weight preference probe',
      generated_at: timestamp,
      items: [
        {
          evidence_id: 'evidence:weighted:mempalace',
          source_ref: 'mempalace://weighted',
          title: 'Weighted MemPalace candidate',
          excerpt: 'weight preference probe',
          observed_at: timestamp,
          confidence: 0.5,
          metadata: {
            source_system: 'mempalace',
            source_kind: 'project',
          },
        },
        {
          evidence_id: 'evidence:weighted:jcp',
          source_ref: 'jarvis-memory-db://weighted',
          title: 'Weighted JCP candidate',
          excerpt: 'weight preference probe',
          observed_at: timestamp,
          confidence: 0.5,
          metadata: {
            source_system: 'jarvis-memory-db',
            source_kind: 'memory',
          },
        },
      ],
    });

    const weightedBundle = buildLocalArchiveBundle('weight preference probe', store, {
      jcpLiveReader,
      weights: {
        sourceSystems: {
          mempalace: 5,
          'jarvis-memory-db': 0,
        },
      },
    });
    assertEqual(weightedBundle.items[0]?.metadata.source_system, 'mempalace');

    const truthOnlyArchiveBundle = buildLocalArchiveBundle('zzqv sentinel neutron', store, {
      jcpLiveReader,
    });
    assertEqual(
      truthOnlyArchiveBundle.items.some((item) => item.title.includes('Truth-only zzqv sentinel neutron phrase')),
      false,
    );
    assert(
      truthOnlyArchiveBundle.items.every((item) => {
        const sourceSystem = String(item.metadata.source_system ?? '');
        return sourceSystem === 'jarvis-memory-db' || sourceSystem === 'mempalace';
      }),
      'expected truth-only matches to stay out of archive evidence bundle',
    );
  } finally {
    store.close();
    if (previousJarvisPath === undefined) {
      delete process.env.JARVIS_FUSION_JARVIS_DB_PATH;
    } else {
      process.env.JARVIS_FUSION_JARVIS_DB_PATH = previousJarvisPath;
    }
    if (previousMemPalacePath === undefined) {
      delete process.env.JARVIS_FUSION_MEMPALACE_PATH;
    } else {
      process.env.JARVIS_FUSION_MEMPALACE_PATH = previousMemPalacePath;
    }
  }
}
