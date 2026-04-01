/**
 * Missing Parameters E2E tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPClient } from '../../utils/mcp-client';
import { startServer, stopServer, getServerUrl, TEST_SERVER_PORT_BASE } from '../../utils/server';
import { checkLXD, skipIfNoLXD } from '../../utils/lxd';

let client: MCPClient;

describe('Missing Parameters (Bad Cases)', () => {
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

  it('should return error when required parameter is missing - get_instance', async () => {
    const response = await client.callTool('get_instance', {});
    
    // MCP returns errors in result with isError flag
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error when required parameter is missing - get_image', async () => {
    const response = await client.callTool('get_image', {});
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error when required parameter is missing - get_project', async () => {
    const response = await client.callTool('get_project', {});
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error when required parameter is missing - delete_instance', async () => {
    const response = await client.callTool('delete_instance', {});
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error when required parameter is missing - start_instance', async () => {
    const response = await client.callTool('start_instance', {});
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });

  it('should return error when required parameter is missing - create_snapshot', async () => {
    const response = await client.callTool('create_snapshot', {});
    
    const result = response.result as { isError?: boolean; content?: Array<{ type: string; text: string }> };
    expect(result.isError || (result.content?.[0]?.text?.includes('error'))).toBe(true);
  });
});
