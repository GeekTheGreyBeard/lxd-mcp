/**
 * Image operations E2E tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPClient } from '../../utils/mcp-client';
import { startServer, stopServer, getServerUrl, TEST_SERVER_PORT_BASE } from '../../utils/server';
import { checkLXD, skipIfNoLXD } from '../../utils/lxd';

let client: MCPClient;

describe('Images (Good Cases)', () => {
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

  it('should list images', async () => {
    const response = await client.callTool('list_images', {});
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe('test');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should list images with project parameter', async () => {
    const response = await client.callTool('list_images', { project: 'default' });
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
  });

  it('should list aliases', async () => {
    const response = await client.callTool('list_aliases', {});
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
  });

  it('should list tools to verify images tools are registered', async () => {
    const response = await client.listTools();
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { tools: Array<{ name: string }> };
    const toolNames = result.tools.map(t => t.name);
    
    expect(toolNames).toContain('list_images');
    expect(toolNames).toContain('get_image');
    expect(toolNames).toContain('list_aliases');
  });
});
