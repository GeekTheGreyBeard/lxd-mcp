/**
 * LXDMCPClient Project Scoping Unit Tests
 * 
 * Tests for the LXDMCPClient project-based access control
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LXDMCPClient } from '../../../src/client/lxd-mcp-client.ts';
import { MCPProjectNotAllowedError, MCPProjectRequiredError } from '../../../src/lxd/errors.ts';

describe('LXDMCPClient', () => {
  let client: LXDMCPClient;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetchFn = vi.fn();
    global.fetch = mockFetchFn as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when NOT scoped (no projects configured)', () => {
    beforeEach(() => {
      client = new LXDMCPClient({ serverUrl: 'http://localhost:3000' });
    });

    it('isScoped() should return false', () => {
      expect(client.isScoped()).toBe(false);
    });

    it('getAllowedProjects() should return empty array', () => {
      expect(client.getAllowedProjects()).toEqual([]);
    });

    it('should make request without project validation', async () => {
      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { success: true },
        }),
      });

      await client.request('tools/list_instances', {});
      expect(mockFetchFn).toHaveBeenCalled();
    });
  });

  describe('when scoped (projects configured via constructor)', () => {
    beforeEach(() => {
      client = new LXDMCPClient({ 
        serverUrl: 'http://localhost:3000',
        projects: ['dev', 'test'],
      });
    });

    it('isScoped() should return true', () => {
      expect(client.isScoped()).toBe(true);
    });

    it('getAllowedProjects() should return configured projects', () => {
      expect(client.getAllowedProjects()).toEqual(['dev', 'test']);
    });

    it('should throw MCPProjectRequiredError when project not specified', async () => {
      await expect(client.request('tools/list_instances', {})).rejects.toThrow(MCPProjectRequiredError);
    });

    it('should throw MCPProjectNotAllowedError for disallowed project', async () => {
      await expect(client.request('tools/list_instances', { project: 'prod' })).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('should allow request with allowed project', async () => {
      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { success: true },
        }),
      });

      await client.request('tools/list_instances', { project: 'dev' });
      expect(mockFetchFn).toHaveBeenCalled();
    });
  });

  describe('single project auto-injection', () => {
    it('should auto-inject project when only one project is allowed', async () => {
      client = new LXDMCPClient({
        serverUrl: 'http://localhost:3000',
        projects: ['dev'],
      });

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { success: true },
        }),
      });

      // Should auto-inject 'dev' since only one project is allowed
      await client.request('tools/list_instances', {});
      
      const callArgs = mockFetchFn.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.params.project).toBe('dev');
    });

    it('should not auto-inject when project is explicitly specified', async () => {
      client = new LXDMCPClient({
        serverUrl: 'http://localhost:3000',
        projects: ['dev'],
      });

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { success: true },
        }),
      });

      await client.request('tools/list_instances', { project: 'dev' });
      
      const callArgs = mockFetchFn.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.params.project).toBe('dev');
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      client = new LXDMCPClient({ 
        serverUrl: 'http://localhost:3000',
        projects: ['dev', 'test'],
      });
    });

    it('listInstances() should validate project', async () => {
      await expect(client.listInstances('prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('listInstances() without project should throw MCPProjectRequiredError', async () => {
      await expect(client.listInstances()).rejects.toThrow(MCPProjectRequiredError);
    });

    it('getInstance() should validate project', async () => {
      await expect(client.getInstance('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('startInstance() should validate project', async () => {
      await expect(client.startInstance('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('stopInstance() should validate project', async () => {
      await expect(client.stopInstance('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('restartInstance() should validate project', async () => {
      await expect(client.restartInstance('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('deleteInstance() should validate project', async () => {
      await expect(client.deleteInstance('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('createInstance() should validate project', async () => {
      await expect(client.createInstance({ name: 'new', image: 'alpine/3.21', project: 'prod' })).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('listSnapshots() should validate project', async () => {
      await expect(client.listSnapshots('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('createSnapshot() should validate project', async () => {
      await expect(client.createSnapshot('my-instance', 'snap1', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('restoreSnapshot() should validate project', async () => {
      await expect(client.restoreSnapshot('my-instance', 'snap1', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('listImages() should validate project', async () => {
      await expect(client.listImages('prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });
  });

  describe('error handling', () => {
    it('should handle MCP error responses', async () => {
      client = new LXDMCPClient({ serverUrl: 'http://localhost:3000' });

      mockFetchFn.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        }),
      });

      await expect(client.request('tools/list_instances', {})).rejects.toThrow('MCP error: Invalid Request');
    });

    it('should handle HTTP errors', async () => {
      client = new LXDMCPClient({ serverUrl: 'http://localhost:3000' });

      mockFetchFn.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.request('tools/list_instances', {})).rejects.toThrow('HTTP error: 500 Internal Server Error');
    });

    it('should handle request timeout', async () => {
      client = new LXDMCPClient({ serverUrl: 'http://localhost:3000', timeout: 100 });

      // Create an AbortError by using a mock that never resolves
      mockFetchFn.mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50);
      }));

      await expect(client.request('tools/list_instances', {})).rejects.toThrow('Request timeout after 100ms');
    });
  });
});
