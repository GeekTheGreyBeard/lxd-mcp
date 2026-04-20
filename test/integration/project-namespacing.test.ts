/**
 * Integration Tests - Project Namespacing
 * 
 * Tests for project-based access control against a live LXD server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LXDClient } from '../../src/lxd/client.ts';
import { LXDApi } from '../../src/lxd/api.ts';
import { ScopedLXDApi } from '../../src/lxd/scoped-api.ts';
import { MCPProjectNotAllowedError, MCPProjectRequiredError } from '../../src/lxd/errors.ts';
import { checkLXD, skipIfNoLXD } from '../utils/lxd.ts';

describe('Integration: Project Namespacing', () => {
  let client: LXDClient;
  let api: LXDApi;
  let scopedApi: ScopedLXDApi;
  let lxdCheck: { available: boolean; socketPath: string };
  const createdInstances: string[] = [];

  beforeAll(async () => {
    lxdCheck = await checkLXD();
    skipIfNoLXD(lxdCheck);

    client = new LXDClient({ socketPath: lxdCheck.socketPath });
    api = new LXDApi(client);
  });

  afterAll(async () => {
    // Cleanup test instances
    for (const instanceName of createdInstances) {
      try {
        await api.deleteInstance(instanceName, undefined, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ============================================
  // Section 4.3: Server-Side Project Blocking Tests
  // ============================================

  describe('Server-Side Project Blocking (ScopedLXDApi)', () => {
    it('4.3.1: should allow operations when project is in allowed list', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      // Should work without throwing
      const result = await scopedApi.listInstances('default');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('4.3.2: should block operations when project is not in allowed list', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      // Should throw MCPProjectNotAllowedError
      await expect(scopedApi.listInstances('nonexistent-project')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.3.3: should require project when server is scoped', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      // Should throw MCPProjectRequiredError when project not specified
      await expect(scopedApi.listInstances()).rejects.toThrow(MCPProjectRequiredError);
    });

    it('4.3.4: should block getInstance with disallowed project', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      await expect(scopedApi.getInstance('test', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.3.5: should block startInstance with disallowed project', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      await expect(scopedApi.startInstance('test', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.3.6: should block stopInstance with disallowed project', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      await expect(scopedApi.stopInstance('test', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.3.7: should block deleteInstance with disallowed project', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      await expect(scopedApi.deleteInstance('test', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.3.8: should block createInstanceFromRemote with disallowed project', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      await expect(scopedApi.createInstanceFromRemote({
        name: 'test',
        image: 'alpine/3.21',
        project: 'prod',
      })).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.3.9: should allow server operations without project', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      // Server info should work without project - this calls the real LXD API
      const info = await scopedApi.getServerInfo();
      expect(info).toBeDefined();
      // Just check that we got a response with at least some properties
      expect(Object.keys(info).length).toBeGreaterThan(0);
    });

    it('4.3.10: should filter listProjects to allowed projects only', async () => {
      scopedApi = new ScopedLXDApi({ api, allowedProjects: ['default'] });
      
      const result = await scopedApi.listProjects();
      expect(Array.isArray(result.items)).toBe(true);
      // All returned projects should be in allowed list
      for (const project of result.items) {
        expect(['default']).toContain(project.name);
      }
    });
  });

  // ============================================
  // Section 4.4: Client-Side Project Blocking Tests
  // ============================================

  describe('Client-Side Project Blocking (LXDMCPClient)', () => {
    let LXDMCPClient: any;
    let originalFetch: typeof fetch;

    beforeAll(async () => {
      // Dynamic import to avoid issues
      const clientModule = await import('../../src/client/lxd-mcp-client.js');
      LXDMCPClient = clientModule.LXDMCPClient;
      
      originalFetch = global.fetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('4.4.1: should throw MCPProjectRequiredError when project not specified in scoped mode', async () => {
      const client = new LXDMCPClient({
        serverUrl: 'http://localhost:3000',
        projects: ['dev', 'test'],
      });

      await expect(client.listInstances()).rejects.toThrow(MCPProjectRequiredError);
    });

    it('4.4.2: should throw MCPProjectNotAllowedError for disallowed project', async () => {
      const client = new LXDMCPClient({
        serverUrl: 'http://localhost:3000',
        projects: ['dev', 'test'],
      });

      await expect(client.listInstances('prod')).rejects.toThrow(MCPProjectNotAllowedError);
    });

    it('4.4.3: should allow request with allowed project', async () => {
      let fetchCalled = false;
      global.fetch = (async () => {
        fetchCalled = true;
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {},
          }),
        } as Response;
      }) as unknown as typeof fetch;

      const client = new LXDMCPClient({
        serverUrl: 'http://localhost:3000',
        projects: ['dev', 'test'],
      });

      await client.listInstances('dev');
      expect(fetchCalled).toBe(true);
    });

    it('4.4.4: should auto-inject project when only one project is allowed', async () => {
      let capturedBody: any = null;
      global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(init.body as string) : null;
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: {},
          }),
        } as Response;
      }) as unknown as typeof fetch;

      const client = new LXDMCPClient({
        serverUrl: 'http://localhost:3000',
        projects: ['dev'],
      });

      await client.listInstances();

      // Check that project was auto-injected
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.params.project).toBe('dev');
    });
  });
});
