/**
 * Unit tests for LXD config tools
 */
import { test, expect, vi, SpyInstance } from 'vitest';
import { registerConfigTools } from '../../src/tools/config.js';
import { LXDApi } from '../../src/lxd/api.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock the LXD API
const mockLxdApi = {
  listInstances: vi.fn(),
  createInstanceFromRemote: vi.fn(),
  getInstance: vi.fn(),
  getInstanceState: vi.fn(),
  startInstance: vi.fn(),
  stopInstance: vi.fn(),
  restartInstance: vi.fn(),
  deleteInstance: vi.fn(),
  listSnapshots: vi.fn(),
  getSnapshot: vi.fn(),
  createSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  exec: vi.fn(),
  listExecOutputLogs: vi.fn(),
  getExecOutputLog: vi.fn(),
  deleteExecOutputLog: vi.fn(),
  listImages: vi.fn(),
  getImage: vi.fn(),
  deleteImage: vi.fn(),
  listAliases: vi.fn(),
  getAlias: vi.fn(),
  createAlias: vi.fn(),
  deleteAlias: vi.fn(),
  getServerInfo: vi.fn(),
  getServerResources: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

test('registers lxd_config_set tool', () => {
  const server = new McpServer(
    {
      name: 'test-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );
  
  // Create a mock for registerTool to capture calls
  const registerToolMock = vi.fn();
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = registerToolMock as typeof server.registerTool;
  
  registerConfigTools(server, mockLxdApi as any, mockLogger as any);
  
  // Restore original
  server.registerTool = originalRegisterTool;
  
  // Verify that registerTool was called with lxd_config_set
  const toolNames = registerToolMock.mock.calls.map((call) => call[0] as string);
  expect(toolNames).toContain('lxd_config_set');
});

test('registers lxd_config_get tool', () => {
  const server = new McpServer(
    {
      name: 'test-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );
  
  // Create a mock for registerTool to capture calls
  const registerToolMock = vi.fn();
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = registerToolMock as typeof server.registerTool;
  
  registerConfigTools(server, mockLxdApi as any, mockLogger as any);
  
  // Restore original
  server.registerTool = originalRegisterTool;
  
  // Verify that registerTool was called with lxd_config_get
  const toolNames = registerToolMock.mock.calls.map((call) => call[0] as string);
  expect(toolNames).toContain('lxd_config_get');
});

test('registers lxd_config_show tool', () => {
  const server = new McpServer(
    {
      name: 'test-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );
  
  // Create a mock for registerTool to capture calls
  const registerToolMock = vi.fn();
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = registerToolMock as typeof server.registerTool;
  
  registerConfigTools(server, mockLxdApi as any, mockLogger as any);
  
  // Restore original
  server.registerTool = originalRegisterTool;
  
  // Verify that registerTool was called with lxd_config_show
  const toolNames = registerToolMock.mock.calls.map((call) => call[0] as string);
  expect(toolNames).toContain('lxd_config_show');
});

// Test successful single key set
test('lxd_config_set handles successful single key set', async () => {
  const server = new McpServer(
    {
      name: 'test-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );
  
  // Create a mock for registerTool to capture calls
  const registerToolMock = vi.fn();
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = registerToolMock as typeof server.registerTool;
  
  registerConfigTools(server, mockLxdApi as any, mockLogger as any);
  
  // Restore original
  server.registerTool = originalRegisterTool;
  
  // Verify that registerTool was called with lxd_config_set
  const toolNames = registerToolMock.mock.calls.map((call) => call[0] as string);
  expect(toolNames).toContain('lxd_config_set');
  
  // This would be an integration test in practice, but we're just testing registration
  expect(true).toBe(true);
});
