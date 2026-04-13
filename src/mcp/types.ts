export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<TMethod extends string = string, TParams = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: TMethod;
  params?: TParams;
}

export interface JsonRpcNotification<TMethod extends string = string, TParams = unknown> {
  jsonrpc: '2.0';
  method: TMethod;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcError;
}

export interface McpClientInfo {
  name: string;
  title?: string;
  version?: string;
}

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  clientInfo?: McpClientInfo;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools: {
      listChanged: boolean;
    };
  };
  serverInfo: {
    name: string;
    title: string;
    version: string;
  };
  instructions: string;
}

export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolsListParams {
  cursor?: string;
}

export interface McpToolsListResult {
  tools: readonly McpToolDefinition[];
}

export interface McpToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolsCallResult {
  content: readonly McpTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export type McpInitializeRequest = JsonRpcRequest<'initialize', McpInitializeParams>;
export type McpInitializedNotification = JsonRpcNotification<'notifications/initialized', Record<string, never>>;
export type McpToolsListRequest = JsonRpcRequest<'tools/list', McpToolsListParams>;
export type McpToolsCallRequest = JsonRpcRequest<'tools/call', McpToolsCallParams>;
