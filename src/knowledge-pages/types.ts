import type { KnowledgePageType, KnowledgePageStatus } from '../jarvis_fusion/contracts.js';

export interface PageSynthesisInput {
  readonly page_type: KnowledgePageType;
  readonly anchor_entity_id?: string | undefined;
  readonly anchor_decision_id?: string | undefined;
  readonly project?: string | undefined;
  readonly subject?: string | undefined;
}

export interface PageRefreshResult {
  readonly page_id: string;
  readonly previous_status: KnowledgePageStatus;
  readonly new_status: KnowledgePageStatus;
  readonly refreshed: boolean;
}
