/**
 * MCP Client - HTTP client helper for making MCP JSON-RPC requests
 */

import type { MCPJsonRPCRequest, MCPJsonRPCResponse } from './types.ts';

export interface MCPClientOptions {
  baseUrl: string;
  timeout?: number;
}

export class MCPClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options: MCPClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    id: string | number = 'test'
  ): Promise<MCPJsonRPCResponse> {
    const request: MCPJsonRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      
      // Handle SSE responses (text/event-stream)
      if (contentType.includes('text/event-stream')) {
        const text = await response.text();
        // Parse SSE format: "event: message\ndata: {...}\n\n"
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            return JSON.parse(data) as MCPJsonRPCResponse;
          }
        }
        throw new Error('No data in SSE response');
      }

      // Handle JSON responses
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as MCPJsonRPCResponse;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Initialize session and get capabilities
   */
  async initialize(): Promise<MCPJsonRPCResponse> {
    return this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPJsonRPCResponse> {
    return this.request('tools/list');
  }

  /**
   * Call a specific tool
   */
  async callTool(name: string, args?: Record<string, unknown>): Promise<MCPJsonRPCResponse> {
    return this.request('tools/call', {
      name,
      arguments: args,
    });
  }

  /**
   * Ping the server
   */
  async ping(): Promise<MCPJsonRPCResponse> {
    return this.request('ping');
  }
}
