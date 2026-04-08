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

function orderByPreferredLabels(values: readonly string[], preferredLabels: readonly string[]): string[] {
  const order = new Map(preferredLabels.map((label, index) => [label, index] as const));
  return [...values].sort((left, right) => {
    const leftIndex = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.localeCompare(right);
  });
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
  const decisionOrder = new Map(
    pack.truth_highlights.decisions.map((title, index) => [title, index] as const),
  );
  const preferenceOrder = new Map(
    pack.truth_highlights.preferences.map((preference, index) => [preference, index] as const),
  );
  const persistedDecisions = store
    ? [...store.listActiveDecisions(10, projectEntityId)].sort((left, right) => {
        const leftIndex = decisionOrder.get(left.title) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = decisionOrder.get(right.title) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return right.updated_at.localeCompare(left.updated_at);
      })
    : [];
  const persistedPreferences = store
    ? [...store.listActivePreferences(10, projectEntityId)].sort((left, right) => {
        const leftKey = `${left.key}=${left.value}`;
        const rightKey = `${right.key}=${right.value}`;
        const leftIndex = preferenceOrder.get(leftKey) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = preferenceOrder.get(rightKey) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return right.updated_at.localeCompare(left.updated_at);
      })
    : [];
  const preferredEntities = orderByPreferredLabels(
    persistedEntities.map((entity) => entity.name),
    pack.truth_highlights.entities,
  );
  const sortedEntities = preferredEntities
    .map((name) => persistedEntities.find((entity) => entity.name === name))
    .filter((entity): entity is Exclude<typeof entity, undefined> => Boolean(entity));
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
      sortedEntities.length > 0
        ? sortedEntities.map((entity) => `- **${entity.name}** (${entity.entity_type}) — ${entity.summary}`)
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
    ...renderBulletSection(
      'Evidence bundles',
      pack.evidence_appendix.bundles.map((bundleId) => `- ${bundleId}`),
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
