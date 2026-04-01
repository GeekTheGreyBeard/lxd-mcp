/**
 * Server operations E2E tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPClient } from '../../utils/mcp-client';
import { startServer, stopServer, getServerUrl, TEST_SERVER_PORT_BASE } from '../../utils/server';
import { checkLXD, skipIfNoLXD } from '../../utils/lxd';

let client: MCPClient;

describe('Server (Good Cases)', () => {
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

  it('should get server info', async () => {
    const response = await client.callTool('get_server_info', {});
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe('test');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe('text');
    
    // Parse the server info text
    const serverInfo = JSON.parse(result.content[0].text);
    // The actual response contains server-level properties
    expect(serverInfo).toHaveProperty('api_version');
    expect(serverInfo).toHaveProperty('auth');
  });

  it('should get server resources', async () => {
    const response = await client.callTool('get_server_resources', {});
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
    
    const resources = JSON.parse(result.content[0].text);
    expect(resources).toHaveProperty('cpu');
    expect(resources).toHaveProperty('memory');
  });

  it('should list projects', async () => {
    const response = await client.callTool('list_projects', {});
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();
  });

  it('should list tools to verify server tools are registered', async () => {
    const response = await client.listTools();
    
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result as { tools: Array<{ name: string }> };
    const toolNames = result.tools.map(t => t.name);
    
    expect(toolNames).toContain('get_server_info');
    expect(toolNames).toContain('get_server_resources');
    expect(toolNames).toContain('list_projects');
  });
});
