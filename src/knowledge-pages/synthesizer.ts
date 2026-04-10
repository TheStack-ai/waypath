import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SqliteTruthKernelStorage } from '../jarvis_fusion/truth-kernel/storage.js';
import type { StoredKnowledgePage } from '../contracts/index.js';
import type { KnowledgePageType } from '../jarvis_fusion/contracts.js';
import type { PageSynthesisInput, PageRefreshResult } from './types.js';
import { expandGraphContext } from '../ontology-support/index.js';

function nowIso(): string {
  return new Date().toISOString();
}

// ── File-based page persistence ──

/**
 * Derive the knowledge/pages directory from the store's database path.
 * Convention: <store_dir>/knowledge/pages/
 */
function pagesDirectory(store: SqliteTruthKernelStorage): string | null {
  const dbPath = store.location;
  if (!dbPath || dbPath === ':memory:') return null;
  return join(dirname(dbPath), 'knowledge', 'pages');
}

function pageFileName(pageId: string): string {
  return pageId.replace(/[:/]/g, '_') + '.md';
}

/**
 * Write a knowledge page to the filesystem as a markdown file.
 * The file contains YAML frontmatter with metadata + the markdown body.
 */
function writePageFile(store: SqliteTruthKernelStorage, page: StoredKnowledgePage): void {
  const dir = pagesDirectory(store);
  if (!dir) return; // in-memory store — skip file persistence

  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, pageFileName(page.page.page_id));

  const frontmatter = [
    '---',
    `page_id: ${page.page.page_id}`,
    `page_type: ${page.page.page_type}`,
    `title: "${page.page.title.replace(/"/g, '\\"')}"`,
    `status: ${page.page.status}`,
    `linked_entity_ids: [${page.linked_entity_ids.map((id) => `"${id}"`).join(', ')}]`,
    `linked_decision_ids: [${page.linked_decision_ids.map((id) => `"${id}"`).join(', ')}]`,
    `updated_at: ${page.updated_at}`,
    '---',
    '',
  ].join('\n');

  writeFileSync(filePath, frontmatter + page.summary_markdown);
}

/**
 * Read a knowledge page markdown from the filesystem.
 * Returns null if the file does not exist.
 */
/**
 * Get the filesystem path for a knowledge page's markdown file.
 * Returns null for in-memory stores.
 */
export function getPageFilePath(store: SqliteTruthKernelStorage, pageId: string): string | null {
  const dir = pagesDirectory(store);
  if (!dir) return null;
  return join(dir, pageFileName(pageId));
}

function readPageFile(store: SqliteTruthKernelStorage, pageId: string): string | null {
  const dir = pagesDirectory(store);
  if (!dir) return null;
  const filePath = join(dir, pageFileName(pageId));
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf8');
  // Strip frontmatter to get markdown body
  const match = /^---\n[\s\S]*?\n---\n\n?/u.exec(content);
  return match ? content.slice(match[0].length) : content;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))];
}

function bulletSection(title: string, items: readonly string[]): string[] {
  return [
    `## ${title}`,
    ...(items.length > 0 ? items : ['- none']),
    '',
  ];
}

/**
 * Synthesize a knowledge page from truth kernel data.
 */
export function synthesizePage(
  store: SqliteTruthKernelStorage,
  input: PageSynthesisInput,
): StoredKnowledgePage {
  switch (input.page_type) {
    case 'project_page':
      return synthesizeProjectPage(store, input);
    case 'entity_page':
      return synthesizeEntityPage(store, input);
    case 'decision_page':
      return synthesizeDecisionPage(store, input);
    case 'topic_brief':
      return synthesizeTopicBrief(store, input);
    case 'session_brief':
      return synthesizeSessionBrief(store, input);
    default:
      return synthesizeSessionBrief(store, input);
  }
}

function synthesizeProjectPage(store: SqliteTruthKernelStorage, input: PageSynthesisInput): StoredKnowledgePage {
  const projectId = input.anchor_entity_id ?? `project:${input.project ?? input.subject ?? 'unknown'}`;
  const entity = store.getEntity(projectId);
  const projectName = entity?.name ?? input.project ?? input.subject ?? 'Unknown Project';

  const decisions = store.listActiveDecisions(10, projectId);
  const preferences = store.listActivePreferences(10, projectId);
  const memories = store.listActivePromotedMemories(5, projectId);
  const relationships = store.listRelationshipsForEntity(projectId, 15);

  // Graph expansion to get full relationship context and entity page links
  const graphResult = expandGraphContext(store, [projectId], { maxDepth: 2, maxResults: 25 });
  const graphEntities = graphResult.expanded_entities.filter((e) => e.entity_id !== projectId);
  const graphRelationships = graphResult.expanded_relationships;

  // Resolve related entity names (include graph-expanded entities)
  const relatedEntityIds = uniqueStrings([
    ...relationships.map((r) => r.from_entity_id),
    ...relationships.map((r) => r.to_entity_id),
    ...graphEntities.map((e) => e.entity_id),
  ].filter((id) => id !== projectId));

  const relatedEntities = relatedEntityIds
    .map((id) => store.getEntity(id))
    .filter((e): e is Exclude<typeof e, undefined> => e !== undefined);

  const stateJson = entity ? safeParseJson(entity.state_json) : {};
  const objective = stateJson.objective ?? '';
  const activeTask = stateJson.activeTask ?? '';

  // Evidence bundles related to this project
  const evidenceBundles = store.listEvidenceBundles(5);
  const relatedBundles = evidenceBundles.filter((b) =>
    b.items.some(
      (item) =>
        item.source_ref.includes(projectId) ||
        item.title.toLowerCase().includes(projectName.toLowerCase()),
    ),
  );

  // Entity page cross-reference links (entities found via graph expansion)
  const entityPageLinks = graphEntities
    .slice(0, 5)
    .map((e) => `- [${e.name}](page:entity:${e.entity_id})`);

  // Use graph-expanded relationships for fuller picture
  const allRelationships = [
    ...relationships,
    ...graphRelationships.filter(
      (gr) => !relationships.some((r) => r.relationship_id === gr.relationship_id),
    ),
  ];

  const lines = [
    `# ${projectName}`,
    '',
    entity ? `${entity.summary}` : '',
    '',
    ...(objective ? [`- **Objective:** ${objective}`] : []),
    ...(activeTask ? [`- **Active Task:** ${activeTask}`] : []),
    '',
    ...bulletSection('Decisions', decisions.map((d) => `- **${d.title}** — ${d.statement}`)),
    ...bulletSection('Preferences', preferences.map((p) => `- ${p.key}=${p.value} (${p.strength})`)),
    ...bulletSection('Related Entities', relatedEntities.map((e) => `- **${e.name}** (${e.entity_type}) — ${e.summary}`)),
    ...bulletSection('Promoted Memories', memories.map((m) => `- ${m.summary}`)),
    ...bulletSection('Relationships', allRelationships.slice(0, 20).map((r) => {
      const fromName = store.getEntity(r.from_entity_id)?.name ?? r.from_entity_id;
      const toName = store.getEntity(r.to_entity_id)?.name ?? r.to_entity_id;
      return `- ${fromName} —[${r.relation_type}]→ ${toName}`;
    })),
    ...(entityPageLinks.length > 0 ? ['## Entity Pages', ...entityPageLinks, ''] : []),
    ...(relatedBundles.length > 0 ? bulletSection('Evidence', relatedBundles.flatMap((b) => b.items.slice(0, 2).map((item) => `- ${item.title}: ${item.excerpt}`))) : []),
  ];

  return buildPage(
    `page:project:${input.project ?? input.subject ?? 'unknown'}`,
    'project_page',
    `${projectName} — Project Page`,
    lines,
    [projectId, ...relatedEntityIds],
    decisions.map((d) => d.decision_id),
    relatedBundles.map((b) => b.bundle_id),
    store,
  );
}

function synthesizeEntityPage(store: SqliteTruthKernelStorage, input: PageSynthesisInput): StoredKnowledgePage {
  const entityId = input.anchor_entity_id ?? `entity:${input.subject ?? 'unknown'}`;
  const entity = store.getEntity(entityId);
  const entityName = entity?.name ?? input.subject ?? 'Unknown Entity';

  const relationships = store.listRelationshipsForEntity(entityId, 15);
  const decisions = store.listActiveDecisions(5, entityId);

  // Graph expansion: 2-hop related entities and decisions
  const graphResult = expandGraphContext(store, [entityId], { maxDepth: 2, maxResults: 20 });
  const graphEntities = graphResult.expanded_entities.filter((e) => e.entity_id !== entityId);
  const graphDecisions = graphResult.related_decisions.filter(
    (d) => !decisions.some((existing) => existing.decision_id === d.decision_id),
  );

  const relatedEntityIds = uniqueStrings([
    ...relationships.map((r) => r.from_entity_id),
    ...relationships.map((r) => r.to_entity_id),
    ...graphEntities.map((e) => e.entity_id),
  ].filter((id) => id !== entityId));

  // Evidence bundles related to this entity
  const evidenceBundles = store.listEvidenceBundles(5);
  const relatedBundles = evidenceBundles.filter((b) =>
    b.items.some(
      (item) =>
        item.source_ref.includes(entityId) ||
        item.title.toLowerCase().includes(entityName.toLowerCase()),
    ),
  );

  const allLinkedDecisions = [...decisions, ...graphDecisions];

  const lines = [
    `# ${entityName}`,
    '',
    entity ? `**Type:** ${entity.entity_type}` : '',
    entity ? `**Status:** ${entity.status}` : '',
    '',
    entity ? entity.summary : 'No entity found.',
    '',
    ...bulletSection('Relationships', relationships.map((r) => {
      const fromName = store.getEntity(r.from_entity_id)?.name ?? r.from_entity_id;
      const toName = store.getEntity(r.to_entity_id)?.name ?? r.to_entity_id;
      return `- ${fromName} —[${r.relation_type}]→ ${toName}`;
    })),
    ...bulletSection('Linked Decisions', decisions.map((d) => `- **${d.title}** — ${d.statement}`)),
    ...(graphEntities.length > 0 ? bulletSection('Related Entities', graphEntities.map((e) => `- **${e.name}** (${e.entity_type}) — ${e.summary}`)) : []),
    ...(graphDecisions.length > 0 ? [
      '## Related Decision Pages',
      ...graphDecisions.map((d) => `- [Decision: ${d.title}](page:decision:${d.decision_id})`),
      '',
    ] : []),
    ...(relatedBundles.length > 0 ? bulletSection('Evidence', relatedBundles.flatMap((b) => b.items.slice(0, 2).map((item) => `- ${item.title}: ${item.excerpt}`))) : []),
  ];

  return buildPage(
    `page:entity:${input.subject ?? entityId}`,
    'entity_page',
    `${entityName} — Entity Page`,
    lines,
    [entityId, ...relatedEntityIds],
    allLinkedDecisions.map((d) => d.decision_id),
    relatedBundles.map((b) => b.bundle_id),
    store,
  );
}

function synthesizeDecisionPage(store: SqliteTruthKernelStorage, input: PageSynthesisInput): StoredKnowledgePage {
  const decisionId = input.anchor_decision_id ?? `decision:${input.subject ?? 'unknown'}`;
  const decision = store.get<Record<string, unknown>>(
    `SELECT * FROM decisions WHERE decision_id = :id LIMIT 1`,
    { id: decisionId },
  );

  const title = decision ? String(decision.title) : input.subject ?? 'Unknown Decision';
  const statement = decision ? String(decision.statement) : '';
  const scopeEntityId = decision?.scope_entity_id ? String(decision.scope_entity_id) : null;
  const scopeEntity = scopeEntityId ? store.getEntity(scopeEntityId) : null;

  // Graph expansion from scope entity to find connected decisions
  const graphResult = scopeEntityId
    ? expandGraphContext(store, [scopeEntityId], { maxDepth: 2, maxResults: 15 })
    : null;

  const relatedDecisions = (graphResult?.related_decisions ?? []).filter(
    (d) => d.decision_id !== decisionId,
  );

  const linkedEntityIds = scopeEntityId ? [scopeEntityId] : [];

  const lines = [
    `# ${title}`,
    '',
    `**Status:** ${decision ? String(decision.status) : 'unknown'}`,
    scopeEntity ? `**Scope:** ${scopeEntity.name} (${scopeEntity.entity_type})` : '',
    '',
    `## Statement`,
    statement || 'No statement recorded.',
    '',
    ...(scopeEntity ? bulletSection('Scope Entity', [`- **${scopeEntity.name}** — ${scopeEntity.summary}`]) : []),
    ...(relatedDecisions.length > 0 ? bulletSection('Related Decisions', relatedDecisions.map((d) => `- **${d.title}** — ${d.statement}`)) : []),
  ];

  return buildPage(
    `page:decision:${input.subject ?? decisionId}`,
    'decision_page',
    `${title} — Decision Page`,
    lines,
    linkedEntityIds,
    [decisionId, ...relatedDecisions.map((d) => d.decision_id)],
    [],
    store,
  );
}

function synthesizeTopicBrief(store: SqliteTruthKernelStorage, input: PageSynthesisInput): StoredKnowledgePage {
  const topic = input.subject ?? 'General';

  // Search for entities, decisions, preferences mentioning the topic
  const entities = store.listActiveEntities(20).filter((e) =>
    e.name.toLowerCase().includes(topic.toLowerCase()) ||
    e.summary.toLowerCase().includes(topic.toLowerCase()),
  );
  const decisions = store.listActiveDecisions(10).filter((d) =>
    d.title.toLowerCase().includes(topic.toLowerCase()) ||
    d.statement.toLowerCase().includes(topic.toLowerCase()),
  );
  const memories = store.listActivePromotedMemories(5).filter((m) =>
    m.summary.toLowerCase().includes(topic.toLowerCase()) ||
    m.content.toLowerCase().includes(topic.toLowerCase()),
  );

  const lines = [
    `# ${topic} — Topic Brief`,
    '',
    `Cross-cutting summary for topic: **${topic}**`,
    '',
    ...bulletSection('Related Entities', entities.map((e) => `- **${e.name}** (${e.entity_type}) — ${e.summary}`)),
    ...bulletSection('Related Decisions', decisions.map((d) => `- **${d.title}** — ${d.statement}`)),
    ...bulletSection('Related Memories', memories.map((m) => `- ${m.summary}`)),
  ];

  return buildPage(
    `page:topic:${topic.toLowerCase().replace(/\s+/g, '-')}`,
    'topic_brief',
    `${topic} — Topic Brief`,
    lines,
    entities.map((e) => e.entity_id),
    decisions.map((d) => d.decision_id),
    [],
    store,
  );
}

function synthesizeSessionBrief(store: SqliteTruthKernelStorage, input: PageSynthesisInput): StoredKnowledgePage {
  const project = input.project ?? input.subject ?? 'waypath';
  const projectEntityId = `project:${project}`;
  const entity = store.getEntity(projectEntityId);

  const decisions = store.listActiveDecisions(10, projectEntityId);
  const preferences = store.listActivePreferences(10, projectEntityId);
  const memories = store.listActivePromotedMemories(5, projectEntityId);
  const relationships = store.listRelationshipsForEntity(projectEntityId, 15);

  const stateJson = entity ? safeParseJson(entity.state_json) : {};

  const lines = [
    `# ${project}`,
    '',
    `- Objective: ${stateJson.objective ?? 'not set'}`,
    `- Active task: ${stateJson.activeTask ?? 'not set'}`,
    '',
    ...bulletSection('Decisions', decisions.map((d) => `- **${d.title}** (${d.decision_id}) — ${d.statement}`)),
    ...bulletSection('Preferences', preferences.map((p) => `- ${p.key}=${p.value} (${p.strength})`)),
    ...bulletSection('Related entities', entity ? [`- **${entity.name}** (${entity.entity_type}) — ${entity.summary}`] : []),
    ...bulletSection('Promoted memories', memories.map((m) => `- ${m.summary}`)),
    ...bulletSection('Graph links', relationships.map((r) => {
      const fromName = store.getEntity(r.from_entity_id)?.name ?? r.from_entity_id;
      const toName = store.getEntity(r.to_entity_id)?.name ?? r.to_entity_id;
      return `- ${fromName} —[${r.relation_type}]→ ${toName}`;
    })),
  ];

  const relatedEntityIds = uniqueStrings([
    projectEntityId,
    ...relationships.flatMap((r) => [r.from_entity_id, r.to_entity_id]),
  ]);

  return buildPage(
    `page:session:${project}`,
    'session_brief',
    `${project} session brief`,
    lines,
    relatedEntityIds,
    decisions.map((d) => d.decision_id),
    [],
    store,
  );
}

/**
 * Refresh an existing knowledge page by re-synthesizing from current truth state.
 * Updates both the file and DB (dual write).
 */
export function refreshPage(store: SqliteTruthKernelStorage, pageId: string): PageRefreshResult {
  const existing = store.getKnowledgePage(pageId);
  if (!existing) {
    return { page_id: pageId, previous_status: 'draft', new_status: 'draft', refreshed: false };
  }

  const previousStatus = existing.page.status;

  // Determine synthesis input from existing page metadata
  const input: PageSynthesisInput = {
    page_type: existing.page.page_type,
    subject: existing.page.title.split(' — ')[0]?.replace(/ session brief$/i, '') ?? undefined,
    anchor_entity_id: existing.linked_entity_ids[0] ?? undefined,
    anchor_decision_id: existing.linked_decision_ids[0] ?? undefined,
  };

  const refreshed = synthesizePage(store, input);

  // Dual write: update DB status + regenerate file
  const updated: StoredKnowledgePage = {
    ...refreshed,
    page: { ...refreshed.page, status: 'canonical' },
    updated_at: nowIso(),
  };
  store.upsertKnowledgePage(updated);
  writePageFile(store, updated);

  return {
    page_id: pageId,
    previous_status: previousStatus,
    new_status: 'canonical',
    refreshed: true,
  };
}

/**
 * Mark knowledge pages linked to the given entity or decision IDs as stale.
 */
export function markPagesStale(
  store: SqliteTruthKernelStorage,
  entityIds: readonly string[],
  decisionIds: readonly string[] = [],
): string[] {
  if (entityIds.length === 0 && decisionIds.length === 0) return [];

  const entityIdSet = new Set(entityIds);
  const decisionIdSet = new Set(decisionIds);
  const pages = store.listKnowledgePages(100);
  const stalePageIds: string[] = [];

  for (const page of pages) {
    if (page.page.status === 'stale') continue;

    const isLinked =
      page.linked_entity_ids.some((id) => entityIdSet.has(id)) ||
      page.linked_decision_ids.some((id) => decisionIdSet.has(id));
    if (isLinked) {
      store.upsertKnowledgePage({
        ...page,
        page: { ...page.page, status: 'stale' },
        updated_at: nowIso(),
      });
      stalePageIds.push(page.page.page_id);
    }
  }

  return stalePageIds;
}

function buildPage(
  pageId: string,
  pageType: KnowledgePageType,
  title: string,
  markdownLines: readonly string[],
  linkedEntityIds: readonly string[],
  linkedDecisionIds: readonly string[],
  linkedEvidenceBundleIds: readonly string[],
  store: SqliteTruthKernelStorage,
): StoredKnowledgePage {
  const page: StoredKnowledgePage = {
    page: { page_id: pageId, page_type: pageType, title, status: 'canonical' },
    summary_markdown: markdownLines.join('\n').trimEnd(),
    linked_entity_ids: uniqueStrings(linkedEntityIds),
    linked_decision_ids: uniqueStrings(linkedDecisionIds),
    linked_evidence_bundle_ids: uniqueStrings(linkedEvidenceBundleIds),
    updated_at: nowIso(),
  };

  // Dual write: DB (metadata) + file (canonical markdown surface)
  store.upsertKnowledgePage(page);
  writePageFile(store, page);

  return store.getKnowledgePage(pageId) ?? page;
}

function safeParseJson(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}
