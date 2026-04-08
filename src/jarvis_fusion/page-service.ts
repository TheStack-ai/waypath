import type { PageReference, SessionContextPack } from '../contracts/index.js';

export interface PageResultView {
  readonly page: PageReference;
  readonly summary_markdown: string;
}

export function synthesizeSessionPage(pack: SessionContextPack): PageResultView {
  return {
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
  };
}
