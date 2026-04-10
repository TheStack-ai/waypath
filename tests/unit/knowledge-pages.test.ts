import { createTruthKernelStorage, ensureTruthKernelSeedData, type SqliteTruthKernelStorage } from '../../src/jarvis_fusion/truth-kernel/index.js';
import { synthesizePage, refreshPage, markPagesStale } from '../../src/knowledge-pages/index.js';

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
  try {
    const page = synthesizePage(store, {
      page_type: 'project_page',
      project: 'alpha',
      anchor_entity_id: 'project:alpha',
    });

    if (page.page.page_type !== 'project_page') throw new Error(`Expected project_page, got ${page.page.page_type}`);
    if (!page.summary_markdown.includes('alpha')) throw new Error('Expected markdown to contain project name');
    if (!page.summary_markdown.includes('Decisions')) throw new Error('Expected Decisions section');
    if (!page.summary_markdown.includes('Preferences')) throw new Error('Expected Preferences section');
    if (page.linked_entity_ids.length === 0) throw new Error('Expected linked entities');

    // Verify persisted
    const persisted = store.getKnowledgePage(page.page.page_id);
    if (!persisted) throw new Error('Page not persisted to DB');
  } finally {
    store.close();
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
    if (!page.summary_markdown.includes('Type:')) throw new Error('Expected Type field');
    if (!page.summary_markdown.includes('Relationships')) throw new Error('Expected Relationships section');
  } finally {
    store.close();
  }
}

export function testSynthesizeDecisionPage(): void {
  const store = createSeededStore();
  try {
    const page = synthesizePage(store, {
      page_type: 'decision_page',
      anchor_decision_id: 'decision:alpha:shared-backend-host-shims',
      subject: 'shared-backend',
    });

    if (page.page.page_type !== 'decision_page') throw new Error(`Expected decision_page, got ${page.page.page_type}`);
    if (!page.summary_markdown.includes('Statement')) throw new Error('Expected Statement section');
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
