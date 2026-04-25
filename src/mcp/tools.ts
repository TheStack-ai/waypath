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
      description:
        'Read-only hybrid search over the local Waypath SQLite memory store. Runs FTS5 lexical search fused with graph-aware Reciprocal Rank Fusion (RRF) across truth-kernel and archive tables and returns ranked entries with source, score, and snippet. Use before answering any question that may depend on prior decisions, preferences, or project facts; call this instead of waypath_graph_query when you have a free-text query rather than a known entity id. Does not write to the database and does not hit the network.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Free-text recall query (1-500 chars). Supports natural language; tokens are FTS5-escaped automatically. Prefer specific nouns and project names over vague phrases ("auth service rollout plan" beats "that thing"). Required.',
            minLength: 1,
            maxLength: 500,
          },
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
      description:
        'Read-only context pack builder for the beginning of a coding or planning session. Assembles a prioritized brief from recent decisions, active preferences, seed entities, and related graph context. Does not write to the database. Call once per session before substantive work; for mid-session lookups use waypath_recall or waypath_graph_query instead. All parameters are optional — pass what is known; omitted fields fall back to project defaults.',
      inputSchema: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description:
              'Project identifier or slug (e.g. "acme-api"). Optional; when omitted the store is queried across all projects.',
            maxLength: 200,
          },
          objective: {
            type: 'string',
            description:
              'One-sentence goal for this session ("land the stripe webhook refactor"). Optional; biases ranking toward relevant truth-kernel entries.',
            maxLength: 500,
          },
          activeTask: {
            type: 'string',
            description:
              'Current task identifier or short label (e.g. "PROJ-412" or "fix flake in payments_test"). Optional; scopes the pack toward this task\'s neighborhood.',
            maxLength: 500,
          },
          seedEntities: {
            type: 'array',
            description:
              'Optional list of known entity ids (people, files, systems) to expand from. Useful when you already know the starting points; omit to let Waypath infer seeds from project/objective/activeTask.',
            items: { type: 'string', maxLength: 200 },
            maxItems: 32,
          },
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
      description:
        'Read-only traversal of the Waypath knowledge graph from a specific entity id. Returns neighbors, edges, and related facts using one of four traversal patterns. Use this when you already have a resolved entity id (from waypath_recall results or from prior context); for free-text lookup use waypath_recall instead. Does not write to the database.',
      inputSchema: {
        type: 'object',
        properties: {
          entityId: {
            type: 'string',
            description:
              'Entity id to expand from, as returned by waypath_recall or waypath_session_start (e.g. "person:alice", "system:auth-svc"). Required.',
            minLength: 1,
            maxLength: 200,
          },
          pattern: {
            type: 'string',
            description:
              'Traversal pattern selector. "project_context" surfaces projects/tasks/decisions around the entity. "person_context" surfaces ownership, preferences, and collaborations. "system_reasoning" walks system → dependency → decision chains. "contradiction_lookup" finds conflicting preferences/facts attached to the entity. Optional; defaults to a balanced traversal when omitted.',
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
      description:
        'Synthesize a human-readable knowledge page about a subject by aggregating and summarizing matching truth-kernel and archive entries. Returns a structured page object plus a markdown summary. The synthesis is deterministic for a given store state and does not call out to any LLM or network service. Read-only with respect to promoted memory; may cache synthesis artifacts in the local store. Use for briefings or handoffs when a recall result would be too fragmented; for targeted lookup use waypath_recall instead.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description:
              'Subject to synthesize a page about. Can be an entity id ("project:acme-api") or a natural-language subject ("Q2 billing migration"). Required; 1-300 chars.',
            minLength: 1,
            maxLength: 300,
          },
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
      description:
        'WRITE: submit a candidate for promotion into the Waypath truth-kernel. Creates a new candidate row in the local SQLite review queue — it does NOT promote immediately. A human (or agent with explicit authority) must call waypath_review to accept or reject the candidate before it becomes queryable by waypath_recall. Use when you want to persist a decision, preference, or fact; use waypath_review_queue to list pending candidates and waypath_review to act on them.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description:
              'The proposed truth statement or fact to promote, as free text. Will be stored verbatim on the candidate record and shown to the reviewer. 1-1000 chars. Required.',
            minLength: 1,
            maxLength: 1000,
          },
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
      description:
        'WRITE: decide the fate of a pending promotion candidate. Setting status to "accepted" promotes the candidate into the truth-kernel so it becomes visible to waypath_recall; "rejected" discards it; "superseded" marks it as replaced by a newer candidate; the other states are non-terminal holding states. This call is the governance gate between waypath_promote and durable memory — do not accept without evidence. Call waypath_review_queue first to list candidates and their ids.',
      inputSchema: {
        type: 'object',
        properties: {
          candidateId: {
            type: 'string',
            description:
              'Candidate id from waypath_review_queue or the response of waypath_promote. Required.',
            minLength: 1,
            maxLength: 200,
          },
          status: {
            type: 'string',
            description:
              'Decision to record. "accepted" = promote into truth-kernel (visible to waypath_recall). "rejected" = discard permanently. "needs_more_evidence" = keep pending, signal reviewer needs support. "pending_review" = reset to inbox. "superseded" = replaced by a newer candidate. Required.',
            enum: ['pending_review', 'accepted', 'rejected', 'needs_more_evidence', 'superseded'],
          },
          notes: {
            type: 'string',
            description:
              'Optional free-text rationale for the decision (shown in audit trail). Recommended for "rejected" and "needs_more_evidence". 0-2000 chars.',
            maxLength: 2000,
          },
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
      description:
        'Read-only snapshot of everything awaiting human attention: pending promotion candidates, stale knowledge pages past their refresh threshold, and detected preference contradictions. Use at the start of a review or maintenance session to see outstanding work; then call waypath_review, waypath_refresh_page, or waypath_resolve_contradiction as appropriate. Takes no parameters.',
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
      description:
        'WRITE: resolve a detected contradiction between two or more preferences sharing the same key by keeping exactly one preference and marking the others as superseded. Intended for user-scoped or project-scoped preference collisions surfaced by waypath_review_queue. Use waypath_review_queue first to see active contradictions and their preference ids. This call persists to the local store and is the destructive side of contradiction handling — the non-kept preferences are no longer returned by waypath_recall.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'The preference key with the contradiction (e.g. "editor.tab_width", "deploy.region"). Must match the key reported by waypath_review_queue. Required.',
            minLength: 1,
            maxLength: 200,
          },
          keepPreferenceId: {
            type: 'string',
            description:
              'The preference id to keep as authoritative. All other preferences with the same key (and matching scope) are marked superseded. Required.',
            minLength: 1,
            maxLength: 200,
          },
          scopeRef: {
            type: 'string',
            description:
              'Optional scope reference ("user:dd", "project:acme-api") when the contradiction is scoped rather than global. Omit to resolve across all scopes of the key.',
            maxLength: 200,
          },
          notes: {
            type: 'string',
            description:
              'Optional free-text rationale for the resolution (stored in audit trail). Recommended for non-obvious decisions. 0-2000 chars.',
            maxLength: 2000,
          },
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
      description:
        'WRITE: rebuild an existing knowledge page against the current store state and update its cached summary/markdown. Use on pages flagged "stale" by waypath_review_queue, or after a large batch of promotions that should be reflected in a briefing page. Idempotent — calling twice with no intervening writes produces the same output. Does not call any external service.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            description:
              'The knowledge page id to refresh, as returned by waypath_page or waypath_review_queue. Required; 1-200 chars.',
            minLength: 1,
            maxLength: 200,
          },
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
      description:
        'Read-only probe of the local source adapters Waypath can ingest from (filesystem snapshots, git repos, JCP live reader, etc.). Returns each adapter\'s availability, last-scan timestamp, and any configuration errors. Use to diagnose "why is my recall empty" or before running a large ingest. Does not write and does not hit the network. Takes no parameters.',
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
      description:
        'Read-only end-to-end health check: SQLite connectivity and migration version, FTS5 index sync status, source adapter probe results, and truth-kernel row counts. Safe to call any time and from any context. Use as a single diagnostic entrypoint before opening a support issue; for adapter-specific detail call waypath_source_status. Takes no parameters.',
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
