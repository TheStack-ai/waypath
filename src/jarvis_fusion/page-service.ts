import type { SessionContextPack, StoredKnowledgePage } from '../contracts/index.js';
import { type SqliteTruthKernelStorage } from './truth-kernel/index.js';

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function renderBulletSection(title: string, items: readonly string[]): string[] {
  return [
    `## ${title}`,
    ...(items.length > 0 ? items : ['- none']),
    '',
  ];
}

export function synthesizeSessionPage(pack: SessionContextPack, store?: SqliteTruthKernelStorage): StoredKnowledgePage {
  const projectEntityId = `project:${pack.current_focus.project}`;
  const relatedEntityIds = uniqueStrings(pack.graph_context.related_entities);
  const linkedEntityIds = relatedEntityIds.length > 0 ? relatedEntityIds : uniqueStrings(pack.graph_context.seed_entities);
  const persistedEntities = store
    ? linkedEntityIds
        .map((entityId) => store.getEntity(entityId))
        .filter((entity): entity is Exclude<typeof entity, undefined> => entity !== undefined)
    : [];
  const persistedDecisions = store ? [...store.listActiveDecisions(10, projectEntityId)] : [];
  const persistedPreferences = store ? [...store.listActivePreferences(10, projectEntityId)] : [];
  const graphLinks = uniqueStrings(pack.graph_context.relationships);

  const summaryLines = [
    `# ${pack.current_focus.project}`,
    '',
    `- Objective: ${pack.current_focus.objective}`,
    `- Active task: ${pack.current_focus.activeTask}`,
    '',
    ...renderBulletSection(
      'Decisions',
      persistedDecisions.length > 0
        ? persistedDecisions.map((decision) => `- **${decision.title}** (${decision.decision_id}) — ${decision.statement}`)
        : pack.truth_highlights.decisions.map((decision) => `- ${decision}`),
    ),
    ...renderBulletSection(
      'Preferences',
      persistedPreferences.length > 0
        ? persistedPreferences.map((preference) => `- ${preference.key}=${preference.value} (${preference.strength})`)
        : pack.truth_highlights.preferences.map((preference) => `- ${preference}`),
    ),
    ...renderBulletSection(
      'Related entities',
      persistedEntities.length > 0
        ? persistedEntities.map((entity) => `- **${entity.name}** (${entity.entity_type}) — ${entity.summary}`)
        : pack.truth_highlights.entities.map((entity) => `- ${entity}`),
    ),
    ...renderBulletSection(
      'Promoted memories',
      pack.truth_highlights.promoted_memories.map((memory) => `- ${memory}`),
    ),
    ...renderBulletSection(
      'Graph links',
      graphLinks.map((relationship) => `- ${relationship}`),
    ),
  ];

  const linkedDecisionIds = persistedDecisions.length > 0
    ? persistedDecisions.map((decision) => decision.decision_id)
    : pack.truth_highlights.decisions;

  const page: StoredKnowledgePage = {
    page: {
      page_id: `page:session:${pack.current_focus.project}`,
      page_type: 'session_brief',
      title: `${pack.current_focus.project} session brief`,
      status: 'canonical',
    },
    summary_markdown: summaryLines.join('\n').trimEnd(),
    linked_entity_ids: linkedEntityIds,
    linked_decision_ids: uniqueStrings(linkedDecisionIds),
    linked_evidence_bundle_ids: pack.evidence_appendix.bundles,
    updated_at: nowIso(),
  };

  if (store) {
    store.upsertKnowledgePage(page);
  }

  return store?.getKnowledgePage(page.page.page_id) ?? page;
}
