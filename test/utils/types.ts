/**
 * MCP JSON-RPC Type Definitions
 */

export interface MCPJsonRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPJsonRPCError {
  jsonrpc: '2.0';
  id: string | number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPToolsListResponse {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export interface MCPToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export type MCPMessage = MCPJsonRPCRequest | MCPJsonRPCResponse | MCPJsonRPCError;
