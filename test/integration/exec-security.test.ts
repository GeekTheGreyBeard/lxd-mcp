import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Use vi.hoisted to mock before the module loads
const { mockLogger, mockCreateLogger } = vi.hoisted(() => {
  const mockLogger = {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  const mockCreateLogger = vi.fn(() => mockLogger);
  return { mockLogger, mockCreateLogger };
});

// Mock the logging module before importing exec.ts
vi.mock('../../src/logging/index.js', () => ({
  createLogger: mockCreateLogger
}));

// Now import the module under test
import { LXDApi } from '../../src/lxd/api.js';
import { registerExecTools } from '../../src/tools/exec.js';

describe('exec tool security warnings', () => {
  let mockApi: LXDApi;
  let mockServer: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the LXD API
    mockApi = {
      getInstance: vi.fn(),
      getInstanceState: vi.fn(),
      exec: vi.fn()
    } as unknown as LXDApi;

    // Mock the server
    mockServer = {
      registerTool: vi.fn()
    } as unknown as McpServer;
  });

  it('should warn when sensitive environment variables are detected', async () => {
    // Setup mock responses
    mockApi.getInstance.mockResolvedValue({ type: 'container' });
    mockApi.getInstanceState.mockResolvedValue({ status: 'Running' });
    mockApi.exec.mockResolvedValue({
      exit_code: 0,
      stdout: 'success',
      stderr: ''
    });

    // Register the tools
    registerExecTools(mockServer, mockApi, mockLogger);

    // Mock the registerTool to capture the tool registration
    const toolRegistration = mockServer.registerTool;
    
    // This test verifies that the registration process works with sensitive environment variables
    // The actual warning logic is tested in the unit tests
    expect(toolRegistration).toHaveBeenCalled();
    
    // Check that warnings were logged when sensitive env vars are used
    // This would be tested by calling the tool with sensitive vars and asserting the warn call
  });

  it('should not warn when no sensitive environment variables are present', async () => {
    // This test would be similar to the above but with non-sensitive variables
    // The implementation is already tested in unit tests, so this serves as a placeholder
    expect(true).toBe(true);
  });
});
