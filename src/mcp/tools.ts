import type { ManagedFacadeApi } from '../facade/index.js';
import type { McpToolDefinition, McpToolsCallResult, McpToolsListResult } from './types.js';

export interface WaypathMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  handler(args: Record<string, unknown> | undefined, facade: ManagedFacadeApi): unknown;
}

function requiredString(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value;
}

function optionalString(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalStringArray(args: Record<string, unknown> | undefined, key: string): string[] | undefined {
  const value = args?.[key];
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

export function createWaypathMcpTools(): readonly WaypathMcpTool[] {
  return [
    {
      name: 'waypath_recall',
      description: 'Search Waypath truth and archive recall.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Recall query text.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.recall(requiredString(args, 'query'));
      },
    },
    {
      name: 'waypath_session_start',
      description: 'Build a Waypath session-start context pack.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          objective: { type: 'string' },
          activeTask: { type: 'string' },
          seedEntities: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.sessionStart({
          project: optionalString(args, 'project'),
          objective: optionalString(args, 'objective'),
          activeTask: optionalString(args, 'activeTask'),
          seedEntities: optionalStringArray(args, 'seedEntities'),
        });
      },
    },
    {
      name: 'waypath_graph_query',
      description: 'Expand graph context for an entity.',
      inputSchema: {
        type: 'object',
        properties: {
          entityId: { type: 'string' },
          pattern: {
            type: 'string',
            enum: ['project_context', 'person_context', 'system_reasoning', 'contradiction_lookup'],
          },
        },
        required: ['entityId'],
        additionalProperties: false,
      },
      handler(args, facade) {
        const pattern = optionalString(args, 'pattern');
        return facade.graphQuery(
          requiredString(args, 'entityId'),
          pattern as 'project_context' | 'person_context' | 'system_reasoning' | 'contradiction_lookup' | undefined,
        );
      },
    },
    {
      name: 'waypath_page',
      description: 'Synthesize a Waypath knowledge page.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
        },
        required: ['subject'],
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.page(requiredString(args, 'subject'));
      },
    },
    {
      name: 'waypath_promote',
      description: 'Create a Waypath promotion candidate.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
        },
        required: ['subject'],
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.promote(requiredString(args, 'subject'));
      },
    },
    {
      name: 'waypath_review',
      description: 'Review a Waypath promotion candidate.',
      inputSchema: {
        type: 'object',
        properties: {
          candidateId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending_review', 'accepted', 'rejected', 'needs_more_evidence', 'superseded'],
          },
          notes: { type: 'string' },
        },
        required: ['candidateId', 'status'],
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.review(
          requiredString(args, 'candidateId'),
          requiredString(args, 'status') as 'pending_review' | 'accepted' | 'rejected' | 'needs_more_evidence' | 'superseded',
          optionalString(args, 'notes'),
        );
      },
    },
    {
      name: 'waypath_review_queue',
      description: 'List pending review queue items, stale pages, and contradictions.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(_args, facade) {
        return facade.reviewQueue();
      },
    },
    {
      name: 'waypath_resolve_contradiction',
      description: 'Resolve a Waypath preference contradiction by keeping one preference.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'The preference key with the contradiction.' },
          keepPreferenceId: { type: 'string', description: 'The preference ID to keep.' },
          scopeRef: { type: 'string', description: 'Optional scope reference.' },
          notes: { type: 'string', description: 'Optional resolution notes.' },
        },
        required: ['key', 'keepPreferenceId'],
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.resolveContradiction(
          requiredString(args, 'key'),
          requiredString(args, 'keepPreferenceId'),
          optionalString(args, 'scopeRef'),
          optionalString(args, 'notes'),
        );
      },
    },
    {
      name: 'waypath_refresh_page',
      description: 'Refresh a Waypath knowledge page.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: { type: 'string', description: 'The knowledge page ID to refresh.' },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
      handler(args, facade) {
        return facade.refreshPage(requiredString(args, 'pageId'));
      },
    },
    {
      name: 'waypath_source_status',
      description: 'Inspect local source adapter availability.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(_args, facade) {
        return facade.sourceStatus();
      },
    },
    {
      name: 'waypath_health',
      description: 'Inspect Waypath database health, FTS sync, and source probe status.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler(_args, facade) {
        return facade.health();
      },
    },
  ];
}

export function createToolsListResult(tools: readonly WaypathMcpTool[]): McpToolsListResult {
  return {
    tools: tools.map<McpToolDefinition>((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
}

export function createToolCallResult(result: unknown, isError = false): McpToolsCallResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
    isError,
  };
}
