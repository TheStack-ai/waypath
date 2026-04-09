import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { assert, assertEqual } from '../../src/shared/assert';
import { synthesizeSessionPage } from '../../src/jarvis_fusion/page-service';
import {
  createTruthKernelStorage,
  ensureTruthKernelSeedData,
} from '../../src/jarvis_fusion/truth-kernel';

export function runPageServiceUnitTest(): void {
  const root = mkdtempSync(`${tmpdir()}/waypath-page-service-`);
  const store = createTruthKernelStorage(`${root}/truth.db`);
  ensureTruthKernelSeedData(store, {
    project: 'graph-project',
    objective: 'assemble graph-aware pages',
    activeTask: 'page-service-test',
  });

  const timestamp = new Date().toISOString();
  store.upsertEntity({
    entity_id: 'entity:codex-host',
    entity_type: 'system',
    name: 'Codex host shim',
    summary: 'Thin operator-facing shim for Codex bootstrap and page flows.',
    state_json: JSON.stringify({ layer: 'host-shim' }),
    status: 'active',
    canonical_page_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const page = synthesizeSessionPage({
    session: {
      session_id: 'graph-project:page-service-test',
      host: 'codex',
      project: 'graph-project',
      objective: 'assemble graph-aware pages',
      active_task: 'page-service-test',
    },
    current_focus: {
      project: 'graph-project',
      objective: 'assemble graph-aware pages',
      activeTask: 'page-service-test',
    },
    truth_highlights: {
      decisions: ['Use a shared backend with thin host shims'],
      preferences: ['host_rollout=codex-first'],
      entities: ['graph-project', 'Codex host shim'],
      promoted_memories: ['Session-start context packs should come from persisted SQLite truth data.'],
    },
    graph_context: {
      seed_entities: ['project:graph-project'],
      related_entities: ['project:graph-project', 'entity:codex-host'],
      relationships: [
        'project:graph-project depends_on entity:codex-host',
        'project:graph-project decision decision:graph-project:shared-backend-host-shims',
      ],
    },
    recent_changes: {
      recent_promotions: [],
      superseded: [],
      open_contradictions: ['Preference conflict on workspace: context_mode -> graph-aware | linear'],
      review_queue: ['promotion:graph-project:review-me: Candidate awaiting explicit review'],
      stale_items: ['page:stale:graph-project: stale project page'],
      contradiction_items: [
        {
          contradiction_id: 'contradiction:workspace:context_mode:1',
          kind: 'preference_conflict',
          scope_ref: 'workspace',
          key: 'context_mode',
          values: ['graph-aware', 'linear'],
          summary: 'Preference conflict on workspace: context_mode -> graph-aware | linear',
          updated_at: timestamp,
        },
      ],
      review_queue_items: [
        {
          candidate_id: 'promotion:graph-project:review-me',
          status: 'pending_review',
          subject: 'review me',
          summary: 'Candidate awaiting explicit review',
          created_at: timestamp,
        },
      ],
      stale_item_details: [
        {
          page_id: 'page:stale:graph-project',
          page_type: 'project_page',
          title: 'stale project page',
          status: 'stale',
          updated_at: timestamp,
          summary: 'page:stale:graph-project: stale project page',
        },
      ],
    },
    evidence_appendix: {
      enabled: true,
      bundles: ['bundle:graph-project:session-start'],
    },
    related_pages: [],
  }, store);

  assert(page.summary_markdown.includes('## Decisions'), 'expected decision section');
  assert(page.summary_markdown.includes('## Preferences'), 'expected preference section');
  assert(page.summary_markdown.includes('## Related entities'), 'expected entity section');
  assert(page.summary_markdown.includes('## Graph links'), 'expected graph section');
  assert(page.summary_markdown.includes('## Review queue'), 'expected review queue section');
  assert(page.summary_markdown.includes('## Open contradictions'), 'expected contradiction section');
  assert(page.summary_markdown.includes('## Stale items'), 'expected stale section');
  assert(page.summary_markdown.includes('## Evidence bundles'), 'expected evidence section');
  assert(page.summary_markdown.includes('shared backend with thin host shims'), 'expected persisted decision statement');
  assert(page.summary_markdown.includes('Thin operator-facing shim for Codex bootstrap and page flows.'), 'expected persisted entity summary');
  assert(page.summary_markdown.includes('Session-start context packs should come from persisted SQLite truth data.'), 'expected promoted memories section');
  assert(
    page.summary_markdown.indexOf('**graph-project**') < page.summary_markdown.indexOf('**Codex host shim**'),
    'expected page entity section to preserve prioritized session ordering',
  );
  assertEqual(page.linked_decision_ids[0], 'decision:graph-project:shared-backend-host-shims');
  assert(page.linked_entity_ids.includes('entity:codex-host'), 'expected persisted entity linkage');

  const persisted = store.getKnowledgePage(page.page.page_id);
  assertEqual(persisted?.linked_decision_ids[0], 'decision:graph-project:shared-backend-host-shims');
  assertEqual(persisted?.linked_evidence_bundle_ids[0], 'bundle:graph-project:session-start');
  store.close();
}
