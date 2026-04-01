/**
 * ScopedLXDApi Unit Tests
 * 
 * Tests for the ScopedLXDApi wrapper that enforces project-based access control
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScopedLXDApi } from '../../../src/lxd/scoped-api.ts';
import { MCPProjectNotAllowedError, MCPProjectRequiredError } from '../../../src/lxd/errors.ts';

describe('ScopedLXDApi', () => {
  // Create a mock API that tracks calls
  const createMockApi = () => ({
    listInstances: vi.fn().mockResolvedValue({ items: [], pagination: undefined }),
    getInstance: vi.fn().mockResolvedValue({ name: 'test' }),
    getInstanceState: vi.fn().mockResolvedValue({ status: 'Running' }),
    startInstance: vi.fn().mockResolvedValue(undefined),
    stopInstance: vi.fn().mockResolvedValue(undefined),
    restartInstance: vi.fn().mockResolvedValue(undefined),
    deleteInstance: vi.fn().mockResolvedValue(undefined),
    createInstanceFromRemote: vi.fn().mockResolvedValue(undefined),
    listSnapshots: vi.fn().mockResolvedValue({ items: [], pagination: undefined }),
    getSnapshot: vi.fn().mockResolvedValue({ name: 'snap1' }),
    createSnapshot: vi.fn().mockResolvedValue(undefined),
    restoreSnapshot: vi.fn().mockResolvedValue(undefined),
    listImages: vi.fn().mockResolvedValue({ items: [], pagination: undefined }),
    getImage: vi.fn().mockResolvedValue({ fingerprint: 'abc' }),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    listAliases: vi.fn().mockResolvedValue({ items: [], pagination: undefined }),
    getAlias: vi.fn().mockResolvedValue({ name: 'alias1' }),
    createAlias: vi.fn().mockResolvedValue(undefined),
    deleteAlias: vi.fn().mockResolvedValue(undefined),
    getServerInfo: vi.fn().mockResolvedValue({ server: 'lxd' }),
    getServerResources: vi.fn().mockResolvedValue({ cpu: {} }),
    listProfiles: vi.fn().mockResolvedValue({ items: [], pagination: undefined }),
    listProjects: vi.fn().mockResolvedValue({ items: [], pagination: undefined }),
    getProject: vi.fn().mockResolvedValue({ name: 'test' }),
  });

  let mockApi: ReturnType<typeof createMockApi>;
  let scopedApi: ScopedLXDApi;

  beforeEach(() => {
    mockApi = createMockApi();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when NOT scoped (no allowed projects)', () => {
    beforeEach(() => {
      scopedApi = new ScopedLXDApi({ api: mockApi as any, allowedProjects: [] });
    });

    it('isScoped() should return false', () => {
      expect(scopedApi.isScoped()).toBe(false);
    });

    it('getAllowedProjects() should return empty array', () => {
      expect(scopedApi.getAllowedProjects()).toEqual([]);
    });

    it('listInstances() should call underlying API without project', async () => {
      await scopedApi.listInstances();
      // When not scoped, passes through undefined to let LXD use default
      expect(mockApi.listInstances).toHaveBeenCalledWith(undefined, undefined);
    });

    it('listInstances() with project should pass project to underlying API', async () => {
      await scopedApi.listInstances('my-project');
      expect(mockApi.listInstances).toHaveBeenCalledWith('my-project', undefined);
    });
  });

  describe('when scoped (allowed projects configured)', () => {
    beforeEach(() => {
      scopedApi = new ScopedLXDApi({ api: mockApi as any, allowedProjects: ['dev', 'test'] });
    });

    it('isScoped() should return true', () => {
      expect(scopedApi.isScoped()).toBe(true);
    });

    it('getAllowedProjects() should return allowed projects', () => {
      expect(scopedApi.getAllowedProjects()).toEqual(['dev', 'test']);
    });

    describe('project validation', () => {
      it('listInstances() with allowed project should succeed', async () => {
        await scopedApi.listInstances('dev');
        expect(mockApi.listInstances).toHaveBeenCalledWith('dev', undefined);
      });

      it('listInstances() with disallowed project should throw MCPProjectNotAllowedError', async () => {
        await expect(scopedApi.listInstances('prod')).rejects.toThrow(MCPProjectNotAllowedError);
      });

      it('listInstances() without project should throw MCPProjectRequiredError', async () => {
        await expect(scopedApi.listInstances()).rejects.toThrow(MCPProjectRequiredError);
      });

      it('getInstance() with allowed project should succeed', async () => {
        await scopedApi.getInstance('my-instance', 'test');
        expect(mockApi.getInstance).toHaveBeenCalledWith('my-instance', 'test');
      });

      it('getInstance() with disallowed project should throw MCPProjectNotAllowedError', async () => {
        await expect(scopedApi.getInstance('my-instance', 'staging')).rejects.toThrow(MCPProjectNotAllowedError);
      });

      it('startInstance() with allowed project should succeed', async () => {
        await scopedApi.startInstance('my-instance', 'dev');
        expect(mockApi.startInstance).toHaveBeenCalledWith('my-instance', 'dev');
      });

      it('stopInstance() with disallowed project should throw MCPProjectNotAllowedError', async () => {
        await expect(scopedApi.stopInstance('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
      });

      it('restartInstance() without project should throw MCPProjectRequiredError', async () => {
        await expect(scopedApi.restartInstance('my-instance')).rejects.toThrow(MCPProjectRequiredError);
      });

      it('deleteInstance() with allowed project should succeed', async () => {
        await scopedApi.deleteInstance('my-instance', 'dev');
        expect(mockApi.deleteInstance).toHaveBeenCalledWith('my-instance', 'dev', undefined);
      });

      it('createInstanceFromRemote() with allowed project should succeed', async () => {
        await scopedApi.createInstanceFromRemote({ name: 'new', image: 'alpine/3.20', project: 'test' });
        expect(mockApi.createInstanceFromRemote).toHaveBeenCalledWith({ name: 'new', image: 'alpine/3.20', project: 'test' });
      });

      it('listSnapshots() with disallowed project should throw MCPProjectNotAllowedError', async () => {
        await expect(scopedApi.listSnapshots('my-instance', 'prod')).rejects.toThrow(MCPProjectNotAllowedError);
      });

      it('getSnapshot() without project should throw MCPProjectRequiredError', async () => {
        await expect(scopedApi.getSnapshot('my-instance', 'snap1')).rejects.toThrow(MCPProjectRequiredError);
      });

      it('createSnapshot() with allowed project should succeed', async () => {
        await scopedApi.createSnapshot('my-instance', 'snap1', false, 'dev');
        expect(mockApi.createSnapshot).toHaveBeenCalledWith('my-instance', 'snap1', false, 'dev');
      });

      it('restoreSnapshot() with disallowed project should throw MCPProjectNotAllowedError', async () => {
        await expect(scopedApi.restoreSnapshot('my-instance', 'snap1', 'staging')).rejects.toThrow(MCPProjectNotAllowedError);
      });

      it('listImages() with allowed project should succeed', async () => {
        await scopedApi.listImages('dev');
        expect(mockApi.listImages).toHaveBeenCalledWith('dev', undefined);
      });
    });

    describe('server operations (not project-scoped)', () => {
      it('getServerInfo() should work without project', async () => {
        await scopedApi.getServerInfo();
        expect(mockApi.getServerInfo).toHaveBeenCalled();
      });

      it('getServerResources() should work without project', async () => {
        await scopedApi.getServerResources();
        expect(mockApi.getServerResources).toHaveBeenCalled();
      });
    });

    describe('project operations', () => {
      it('listProjects() should filter to allowed projects', async () => {
        mockApi.listProjects.mockResolvedValueOnce({
          items: [
            { name: 'dev', description: '', config: {}, used_by: [] },
            { name: 'test', description: '', config: {}, used_by: [] },
            { name: 'prod', description: '', config: {}, used_by: [] },
          ],
          pagination: undefined,
        });

        const result = await scopedApi.listProjects();
        expect(result.items).toHaveLength(2);
        expect(result.items.map(p => p.name)).toEqual(['dev', 'test']);
      });

      it('getProject() with allowed project should succeed', async () => {
        await scopedApi.getProject('dev');
        expect(mockApi.getProject).toHaveBeenCalledWith('dev');
      });

      it('getProject() with disallowed project should throw MCPProjectNotAllowedError', async () => {
        await expect(scopedApi.getProject('prod')).rejects.toThrow(MCPProjectNotAllowedError);
      });
    });
  });

  describe('single project configuration', () => {
    it('should allow operations with single allowed project', async () => {
      scopedApi = new ScopedLXDApi({ api: mockApi as any, allowedProjects: ['dev'] });

      // Should work without explicit project since there's only one allowed
      await scopedApi.listInstances('dev');
      expect(mockApi.listInstances).toHaveBeenCalledWith('dev', undefined);
    });
  });
});
