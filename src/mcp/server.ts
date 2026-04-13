import { createInterface } from 'node:readline';

import { createFacade, type FacadeOptions, type ManagedFacadeApi } from '../facade/index.js';
import { createToolCallResult, createToolsListResult, createWaypathMcpTools, type WaypathMcpTool } from './tools.js';
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  McpInitializeParams,
  McpInitializeResult,
  McpToolsCallParams,
} from './types.js';

const SERVER_NAME = 'waypath';
const SERVER_TITLE = 'Waypath MCP Server';
const SERVER_VERSION = '0.1.0-rc.0';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface McpServerOptions {
  readonly input?: NodeJS.ReadableStream;
  readonly output?: { write(chunk: string): void };
  readonly error?: { write(chunk: string): void };
  readonly facade?: ManagedFacadeApi;
  readonly facadeOptions?: FacadeOptions;
  readonly tools?: readonly WaypathMcpTool[];
}

function isRequest(value: unknown): value is JsonRpcRequest {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as JsonRpcRequest).jsonrpc === '2.0'
    && typeof (value as JsonRpcRequest).method === 'string'
    && 'id' in (value as Record<string, unknown>),
  );
}

function isNotification(value: unknown): value is { jsonrpc: '2.0'; method: string; params?: unknown } {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as { jsonrpc?: string }).jsonrpc === '2.0'
    && typeof (value as { method?: unknown }).method === 'string'
    && !('id' in (value as Record<string, unknown>)),
  );
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function jsonRpcResult<TResult>(id: JsonRpcId, result: TResult): JsonRpcSuccessResponse<TResult> {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function negotiateProtocolVersion(requested?: string): string {
  if (requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number])) {
    return requested;
  }
  return SUPPORTED_PROTOCOL_VERSIONS[0];
}

export class WaypathMcpServer {
  private readonly facade: ManagedFacadeApi;
  private readonly ownsFacade: boolean;
  private readonly output: { write(chunk: string): void };
  private readonly error: { write(chunk: string): void };
  private readonly tools: readonly WaypathMcpTool[];
  private readonly toolMap: ReadonlyMap<string, WaypathMcpTool>;
  private initializeResponded = false;
  private ready = false;

  constructor(options: McpServerOptions = {}) {
    this.output = options.output ?? process.stdout;
    this.error = options.error ?? process.stderr;
    this.facade = options.facade ?? createFacade(options.facadeOptions);
    this.ownsFacade = !options.facade;
    this.tools = options.tools ?? createWaypathMcpTools();
    this.toolMap = new Map(this.tools.map((tool) => [tool.name, tool]));
  }

  close(): void {
    if (this.ownsFacade) {
      this.facade.close();
    }
  }

  private write(message: JsonRpcSuccessResponse | JsonRpcErrorResponse): void {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  private writeErrorLine(message: string): void {
    this.error.write(`${message}\n`);
  }

  private initializeResult(params?: McpInitializeParams): McpInitializeResult {
    return {
      protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: SERVER_NAME,
        title: SERVER_TITLE,
        version: SERVER_VERSION,
      },
      instructions: 'Use the waypath_* tools to inspect local truth, recall, review queues, and health.',
    };
  }

  async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let message: unknown;
    try {
      message = JSON.parse(trimmed) as unknown;
    } catch (error) {
      this.writeErrorLine(`Invalid JSON-RPC payload: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (isNotification(message)) {
      if (message.method === 'notifications/initialized') {
        this.ready = this.initializeResponded;
      }
      return;
    }

    if (!isRequest(message)) {
      this.write(jsonRpcError(null, -32600, 'Invalid Request'));
      return;
    }

    if (message.method === 'ping') {
      this.write(jsonRpcResult(message.id, {}));
      return;
    }

    if (message.method === 'initialize') {
      this.initializeResponded = true;
      this.write(jsonRpcResult(message.id, this.initializeResult(message.params as McpInitializeParams | undefined)));
      return;
    }

    if (!this.initializeResponded || !this.ready) {
      this.write(jsonRpcError(message.id, -32002, 'Server not initialized'));
      return;
    }

    if (message.method === 'tools/list') {
      this.write(jsonRpcResult(message.id, createToolsListResult(this.tools)));
      return;
    }

    if (message.method === 'tools/call') {
      const params = (message.params ?? {}) as McpToolsCallParams;
      const tool = this.toolMap.get(params.name);
      if (!tool) {
        this.write(jsonRpcError(message.id, -32601, `Unknown tool: ${params.name}`));
        return;
      }

      try {
        const result = await tool.handler(params.arguments, this.facade);
        this.write(jsonRpcResult(message.id, createToolCallResult(result)));
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        this.write(jsonRpcResult(message.id, createToolCallResult({ error: messageText }, true)));
      }
      return;
    }

    this.write(jsonRpcError(message.id, -32601, `Method not found: ${message.method}`));
  }
}

export async function runWaypathMcpServer(options: McpServerOptions = {}): Promise<void> {
  const server = new WaypathMcpServer(options);
  const readline = createInterface({
    input: options.input ?? process.stdin,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of readline) {
      await server.handleLine(line);
    }
  } finally {
    readline.close();
    server.close();
  }
}
