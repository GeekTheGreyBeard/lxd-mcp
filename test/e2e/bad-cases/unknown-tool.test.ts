/**
 * Unknown Tool E2E tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPClient } from '../../utils/mcp-client';
import { startServer, stopServer, getServerUrl, TEST_SERVER_PORT_BASE } from '../../utils/server';
import { checkLXD, skipIfNoLXD } from '../../utils/lxd';

let client: MCPClient;

describe('Unknown Tool (Bad Cases)', () => {
  beforeAll(async () => {
    // Check LXD availability
    const lxdCheck = await checkLXD();
    skipIfNoLXD(lxdCheck);

    // Start the MCP server
    await startServer({ port: TEST_SERVER_PORT_BASE });
    
    // Create client
    client = new MCPClient({ baseUrl: getServerUrl() });
    
    // Initialize the session
    await client.initialize();
  });

  afterAll(async () => {
    await stopServer();
  });

  it('should return error for non-existent tool call', async () => {
    const response = await client.callTool('non_existent_tool_xyz', {});
    
    // MCP returns errors in result with isError flag
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error for invalid tool name', async () => {
    const response = await client.callTool('invalid-tool-name!@#', {});
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error for tool with empty name', async () => {
    const response = await client.request('tools/call', {
      name: '',
      arguments: {},
    });
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should handle unknown method gracefully', async () => {
    const response = await client.request('unknown_mcp_method_xyz', {});
    
    // Unknown MCP method returns JSON-RPC error
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32601); // Method not found
  });
});
