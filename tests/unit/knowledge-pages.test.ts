import { existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJcpLiveReader } from '../../src/adapters/jcp';
import { createTruthKernelStorage, ensureTruthKernelSeedData, type SqliteTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel/index.js';
import { synthesizePage, refreshPage, markPagesStale, getPageFilePath } from '../../src/knowledge-pages/index.js';
import { createJcpFixtureDb } from '../helpers/jcp-fixture';

function nowIso(): string {
  return new Date().toISOString();
}

function createSeededStore(): SqliteTruthKernelStorage {
  const store = createTruthKernelStorage(':memory:');
  ensureTruthKernelSeedData(store, { project: 'alpha', objective: 'build v1', activeTask: 'implement' });
  return store;
}

export function testSynthesizeProjectPage(): void {
  const store = createSeededStore();
  const root = mkdtempSync(`${tmpdir()}/waypath-project-page-`);
  const jcpDbPath = join(root, 'jarvis.db');
  createJcpFixtureDb(jcpDbPath);
  const previousJarvisPath = process.env.JARVIS_FUSION_JARVIS_DB_PATH;
  process.env.JARVIS_FUSION_JARVIS_DB_PATH = jcpDbPath;
  try {
    const page = synthesizePage(store, {
      page_type: 'project_page',
      project: 'alpha',
      anchor_entity_id: 'project:alpha',
    }, {
      jcpLiveReader: createJcpLiveReader(jcpDbPath),
    });

    if (page.page.page_type !== 'project_page') throw new Error(`Expected project_page, got ${page.page.page_type}`);
    if (!page.summary_markdown.includes('alpha')) throw new Error('Expected markdown to contain project name');
    if (!page.summary_markdown.includes('Decisions')) throw new Error('Expected Decisions section');
    if (!page.summary_markdown.includes('Preferences')) throw new Error('Expected Preferences section');
    if (!page.summary_markdown.includes('[source_system=jarvis-memory-db]')) throw new Error('Expected JCP content in project page');
    if (!page.summary_markdown.includes('Cross References')) throw new Error('Expected Cross References section');
    if (page.linked_entity_ids.length === 0) throw new Error('Expected linked entities');

    // Verify persisted
    const persisted = store.getKnowledgePage(page.page.page_id);
    if (!persisted) throw new Error('Page not persisted to DB');
  } finally {
    store.close();
    if (previousJarvisPath === undefined) {
      delete process.env.JARVIS_FUSION_JARVIS_DB_PATH;
    } else {
      process.env.JARVIS_FUSION_JARVIS_DB_PATH = previousJarvisPath;
    }
  }
}

export function testSynthesizeEntityPage(): void {
  const store = createSeededStore();
  try {
    const page = synthesizePage(store, {
      page_type: 'entity_page',
      anchor_entity_id: 'project:alpha',
      subject: 'alpha',
    });

    if (page.page.page_type !== 'entity_page') throw new Error(`Expected entity_page, got ${page.page.page_type}`);
    if (page.page.page_id !== 'page:entity:project:alpha') throw new Error(`Expected stable entity page id, got ${page.page.page_id}`);
    if (!page.summary_markdown.includes('Type:')) throw new Error('Expected Type field');
    if (!page.summary_markdown.includes('Relationships')) throw new Error('Expected Relationships section');
  } finally {
    store.close();
  }
}

export function testSynthesizeDecisionPage(): void {
  const store = createSeededStore();
  try {
    const ts = nowIso();
    store.upsertEvidenceBundle({
      bundle_id: 'bundle:decision-alpha',
      query: 'decision alpha evidence',
      generated_at: ts,
      items: [{
        evidence_id: 'evidence:decision-alpha',
        source_ref: 'truth:decision:alpha:shared-backend-host-shims',
        title: 'Decision evidence',
        excerpt: 'Evidence linked to the alpha decision.',
        observed_at: ts,
        confidence: 0.9,
        metadata: { source_system: 'truth-kernel', source_kind: 'decision' },
      }],
    });
    const page = synthesizePage(store, {
      page_type: 'decision_page',
      anchor_decision_id: 'decision:alpha:shared-backend-host-shims',
      subject: 'shared-backend',
      linked_evidence_bundle_ids: ['bundle:decision-alpha'],
    });

    if (page.page.page_type !== 'decision_page') throw new Error(`Expected decision_page, got ${page.page.page_type}`);
    if (page.page.page_id !== 'page:decision:decision:alpha:shared-backend-host-shims') throw new Error(`Expected stable decision page id, got ${page.page.page_id}`);
    if (!page.summary_markdown.includes('Statement')) throw new Error('Expected Statement section');
    if (!page.summary_markdown.includes('Evidence')) throw new Error('Expected Evidence section');
    if (!page.summary_markdown.includes('Cross References')) throw new Error('Expected Cross References section');
  } finally {
    store.close();
  }
}

export function testSynthesizeSessionBrief(): void {
  const store = createSeededStore();
  try {
    const page = synthesizePage(store, {
      page_type: 'session_brief',
      project: 'alpha',
    });

    if (page.page.page_type !== 'session_brief') throw new Error(`Expected session_brief, got ${page.page.page_type}`);
    if (!page.summary_markdown.includes('Objective:')) throw new Error('Expected Objective field');
    if (!page.summary_markdown.includes('Active task:')) throw new Error('Expected Active task field');
  } finally {
    store.close();
  }
}

export function testSynthesizeTopicBrief(): void {
  const store = createSeededStore();
  try {
    const page = synthesizePage(store, {
      page_type: 'topic_brief',
      subject: 'codex',
    });

    if (page.page.page_type !== 'topic_brief') throw new Error(`Expected topic_brief, got ${page.page.page_type}`);
    if (!page.summary_markdown.includes('Topic Brief')) throw new Error('Expected Topic Brief heading');
  } finally {
    store.close();
  }
}

export function testRefreshPage(): void {
  const store = createSeededStore();
  try {
    // Create initial page
    const page = synthesizePage(store, { page_type: 'session_brief', project: 'alpha' });

    // Mark as stale
    store.upsertKnowledgePage({
      ...page,
      page: { ...page.page, status: 'stale' },
      updated_at: nowIso(),
    });

    // Refresh
    const result = refreshPage(store, page.page.page_id);
    if (!result.refreshed) throw new Error('Expected refreshed=true');
    if (result.previous_status !== 'stale') throw new Error(`Expected previous_status 'stale', got '${result.previous_status}'`);
    if (result.new_status !== 'canonical') throw new Error(`Expected new_status 'canonical', got '${result.new_status}'`);

    // Verify DB updated
    const updated = store.getKnowledgePage(page.page.page_id);
    if (updated?.page.status !== 'canonical') throw new Error('Expected status canonical after refresh');
  } finally {
    store.close();
  }
}

export function testMarkPagesStale(): void {
  const store = createSeededStore();
  try {
    // Create pages linked to project:alpha
    synthesizePage(store, { page_type: 'session_brief', project: 'alpha' });
    synthesizePage(store, { page_type: 'project_page', project: 'alpha', anchor_entity_id: 'project:alpha' });

    const staleIds = markPagesStale(store, ['project:alpha']);
    if (staleIds.length === 0) throw new Error('Expected at least 1 page marked stale');

    // Verify
    for (const id of staleIds) {
      const page = store.getKnowledgePage(id);
      if (page?.page.status !== 'stale') throw new Error(`Expected ${id} to be stale`);
    }
  } finally {
    store.close();
  }
}

export function testEmptyStoreProducesValidPage(): void {
  const store = createTruthKernelStorage(':memory:');
  try {
    const page = synthesizePage(store, { page_type: 'project_page', project: 'empty' });
    if (!page.summary_markdown.includes('empty')) throw new Error('Expected project name in markdown');
    if (page.page.page_type !== 'project_page') throw new Error('Expected project_page type');
  } finally {
    store.close();
  }
}

export function testPageFilePersistence(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-pages-`);
  const dbPath = join(root, 'truth.db');
  const store = createTruthKernelStorage(dbPath);
  ensureTruthKernelSeedData(store, { project: 'filetest', objective: 'test file persistence', activeTask: 'write pages' });
  try {
    const page = synthesizePage(store, {
      page_type: 'project_page',
      project: 'filetest',
      anchor_entity_id: 'project:filetest',
    });

    // File should be written
    const filePath = getPageFilePath(store, page.page.page_id);
    if (!filePath) throw new Error('Expected file path for file-based store');
    if (!existsSync(filePath)) throw new Error(`Expected page file at ${filePath}`);

    // DB should also have the page
    const fromDb = store.getKnowledgePage(page.page.page_id);
    if (!fromDb) throw new Error('Expected page in DB');

    // Refresh should also update the file
    const refreshResult = refreshPage(store, page.page.page_id);
    if (!refreshResult.refreshed) throw new Error('Expected refresh to succeed');
    if (refreshResult.new_status !== 'canonical') throw new Error('Expected canonical after refresh');

    // File should still exist after refresh
    if (!existsSync(filePath)) throw new Error('Expected page file to persist after refresh');
  } finally {
    store.close();
  }
}

export function testInMemoryStoreSkipsFilePersistence(): void {
  const store = createTruthKernelStorage(':memory:');
  ensureTruthKernelSeedData(store, { project: 'memtest', objective: 'test', activeTask: 'test' });
  try {
    const page = synthesizePage(store, {
      page_type: 'session_brief',
      project: 'memtest',
    });

    // getPageFilePath should return null for in-memory stores
    const filePath = getPageFilePath(store, page.page.page_id);
    if (filePath !== null) throw new Error('Expected null file path for in-memory store');

    // Page should still be in DB
    const fromDb = store.getKnowledgePage(page.page.page_id);
    if (!fromDb) throw new Error('Expected page in DB even for in-memory store');
  } finally {
    store.close();
  }
}
