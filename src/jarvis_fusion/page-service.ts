import type { SessionContextPack, StoredKnowledgePage } from '../contracts/index.js';
import { type SqliteTruthKernelStorage } from './truth-kernel/index.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function synthesizeSessionPage(pack: SessionContextPack, store?: SqliteTruthKernelStorage): StoredKnowledgePage {
  const page: StoredKnowledgePage = {
    page: {
      page_id: `page:session:${pack.current_focus.project}`,
      page_type: 'session_brief',
      title: `${pack.current_focus.project} session brief`,
      status: 'canonical',
    },
    summary_markdown: [
      `# ${pack.current_focus.project}`,
      '',
      `- Objective: ${pack.current_focus.objective}`,
      `- Active task: ${pack.current_focus.activeTask}`,
      `- Decisions: ${pack.truth_highlights.decisions.join(', ') || 'none'}`,
      `- Preferences: ${pack.truth_highlights.preferences.join(', ') || 'none'}`,
      `- Entities: ${pack.truth_highlights.entities.join(', ') || 'none'}`,
    ].join('\n'),
    linked_entity_ids: pack.graph_context.related_entities,
    linked_decision_ids: pack.truth_highlights.decisions,
    linked_evidence_bundle_ids: pack.evidence_appendix.bundles,
    updated_at: nowIso(),
  };

  if (store) {
    store.upsertKnowledgePage(page);
  }

  return store?.getKnowledgePage(page.page.page_id) ?? page;
}
