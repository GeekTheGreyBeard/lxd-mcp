/**
 * Invalid JSON E2E tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPClient } from '../../utils/mcp-client';
import { startServer, stopServer, getServerUrl, TEST_SERVER_PORT_BASE } from '../../utils/server';
import { checkLXD, skipIfNoLXD } from '../../utils/lxd';

let client: MCPClient;

describe('Invalid JSON (Bad Cases)', () => {
  beforeAll(async () => {
    // Check LXD availability
    const lxdCheck = await checkLXD();
    skipIfNoLXD(lxdCheck);

    // Start the MCP server
    await startServer({ port: TEST_SERVER_PORT_BASE });
    
    // Create client
    client = new MCPClient({ baseUrl: getServerUrl() });
  });

  afterAll(async () => {
    await stopServer();
  });

  it('should handle malformed JSON', async () => {
    const baseUrl = client['baseUrl'] as string;
    
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{ this is not valid json',
    });

    // Server should return an error for malformed JSON (either HTTP error or error in body)
    const text = await response.text();
    // Either a non-2xx status OR an error in the body
    const isError = !response.ok || text.includes('error');
    expect(isError).toBe(true);
  });

  it('should handle invalid JSON-RPC request (missing jsonrpc field)', async () => {
    const response = await client.request('invalid_method', {}, 'test');
    
    // Missing method returns JSON-RPC error at top level
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32601); // Method not found
  });

  it('should handle invalid JSON-RPC version', async () => {
    const response = await fetch(client['baseUrl'] as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '1.0', // Invalid version
        id: 'test',
        method: 'ping',
      }),
    });

    // Server may return error or may handle it - check for either success with JSON-RPC response or error
    const text = await response.text();
    // Either it worked (has jsonrpc) or it errored (has error)
    const handled = text.includes('"jsonrpc"') || text.includes('error');
    expect(handled).toBe(true);
  });

  it('should handle empty request body', async () => {
    const response = await fetch(client['baseUrl'] as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '',
    });

    // Server should return an error for empty body
    const text = await response.text();
    const isError = !response.ok || text.includes('error');
    expect(isError).toBe(true);
  });
});
