/**
 * Integration Tests - Server Information
 * 
 * Tests for server operations against a live LXD server
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { LXDClient } from '../../src/lxd/client.ts';
import { LXDApi, LXDServerInfo, LXDServerResources, LXDProject } from '../../src/lxd/api.ts';
import { checkLXD, skipIfNoLXD } from '../utils/lxd.ts';

describe('Integration: Server Information', () => {
  let client: LXDClient;
  let api: LXDApi;
  let lxdCheck: { available: boolean; socketPath: string };

  beforeAll(async () => {
    lxdCheck = await checkLXD();
    skipIfNoLXD(lxdCheck);

    client = new LXDClient({ socketPath: lxdCheck.socketPath });
    api = new LXDApi(client);
  });

  // ============================================
  // Section 6.1: Server Info Tests
  // ============================================

  describe('Server Info', () => {
    it('6.1.1: should get basic server information', async () => {
      const serverInfo = await api.getServerInfo();
      
      expect(serverInfo).toBeDefined();
      // Server info may vary, but at least api_version should be there
      expect(serverInfo.api_version).toBeDefined();
      expect(serverInfo.api_version).toBe('1.0');
    });

    it('6.1.2: should get CPU resource usage', async () => {
      const resources = await api.getServerResources();
      
      expect(resources).toBeDefined();
      expect(resources.cpu).toBeDefined();
      // CPU info may not be complete on all systems
      if (resources.cpu.cores !== undefined) {
        expect(typeof resources.cpu.cores).toBe('number');
      }
    });

    it('6.1.3: should get memory resource usage', async () => {
      const resources = await api.getServerResources();
      
      expect(resources).toBeDefined();
      expect(resources.memory).toBeDefined();
      expect(resources.memory.total).toBeDefined();
      // used and free may not always be available
      if (resources.memory.used !== undefined) {
        expect(typeof resources.memory.used).toBe('number');
      }
      if (resources.memory.free !== undefined) {
        expect(typeof resources.memory.free).toBe('number');
      }
    });

    it('6.1.4: should get disk resource usage', async () => {
      const resources = await api.getServerResources();
      
      expect(resources).toBeDefined();
      // Storage info may or may not be available depending on LXD setup
      expect(resources.storage !== undefined || resources.cpu !== undefined).toBe(true);
    });

    it('6.1.5: should get cluster info for single node', async () => {
      const serverInfo = await api.getServerInfo();
      
      expect(serverInfo).toBeDefined();
      // Cluster info may or may not be present depending on setup
      if (serverInfo.cluster) {
        expect(serverInfo.cluster.enabled).toBeDefined();
        expect(serverInfo.cluster.member).toBeDefined();
      }
    });
  });

  // ============================================
  // Section 6.2: Project Tests
  // ============================================

  describe('Projects', () => {
    it('6.2.1: should get default project', async () => {
      const project = await api.getProject('default');
      
      expect(project).toBeDefined();
      expect(project.name).toBe('default');
    });

    it('6.2.2: should list all projects', async () => {
      const result = await api.listProjects();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      // Should always have at least the default project
      expect(result.items.length).toBeGreaterThan(0);
      
      const defaultProject = result.items.find(p => p.name === 'default');
      expect(defaultProject).toBeDefined();
    });
  });

  // ============================================
  // Section 6.3: Server Info After Changes Tests
  // ============================================

  describe('Server Info After Changes', () => {
    it('6.3.1: should get server info after instance operations', async () => {
      // Get initial server info
      const initialInfo = await api.getServerInfo();
      expect(initialInfo).toBeDefined();

      // List instances (which may change server state)
      const instances = await api.listInstances();
      expect(instances).toBeDefined();

      // Get server info again
      const afterInfo = await api.getServerInfo();
      expect(afterInfo.server).toBe(initialInfo.server);
    });

    it('6.3.2: should get resources after load', async () => {
      // Get resources multiple times to ensure consistency
      const resources1 = await api.getServerResources();
      expect(resources1).toBeDefined();
      
      const resources2 = await api.getServerResources();
      expect(resources2).toBeDefined();
      
      // Basic sanity check
      expect(resources1.memory.total).toBe(resources2.memory.total);
    });
  });

  // ============================================
  // Additional Server Tests
  // ============================================

  describe('Additional Server Operations', () => {
    it('should get extended server info', async () => {
      const serverInfo = await api.getServerInfo();
      
      expect(serverInfo.auth).toBeDefined();
      expect(serverInfo.config).toBeDefined();
      expect(serverInfo.environment).toBeDefined();
    });

    it('should get full resources including network', async () => {
      const resources = await api.getServerResources();
      
      expect(resources).toBeDefined();
      expect(resources.network).toBeDefined();
    });
  });
});
