/**
 * Unit tests for LXD profile tools
 * Basic import and functionality tests
 */
import { test, expect, vi, describe } from 'vitest';
import { registerProfileTools } from '../../src/tools/profiles.js';
import { LXDApi, LXDProfile } from '../../src/lxd/api.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock the LXD API with all required methods
const mockLxdApi: Partial<LXDApi> = {
  listProfiles: vi.fn().mockResolvedValue([]),
  getProfile: vi.fn().mockResolvedValue({
    name: 'test-profile',
    description: 'Test profile',
    config: {},
    devices: {},
    used_by: [],
  } as LXDProfile),
  createProfile: vi.fn().mockResolvedValue(undefined),
  patchProfile: vi.fn().mockResolvedValue(undefined),
  deleteProfile: vi.fn().mockResolvedValue(undefined),
  addProfileToInstance: vi.fn().mockResolvedValue(undefined),
  removeProfileFromInstance: vi.fn().mockResolvedValue(undefined),
  getInstance: vi.fn().mockResolvedValue({
    name: 'test-instance',
    type: 'container' as const,
    status: 'Running',
    profiles: ['default'],
    config: {},
    devices: {},
  }),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('Profile Tools', () => {
  test('registerProfileTools function exists and can be called', () => {
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
    
    // This should not throw
    expect(() => registerProfileTools(server, mockLxdApi as LXDApi, mockLogger as any)).not.toThrow();
  });
});

describe('LXDProfile interface', () => {
  test('LXDProfile interface is exported', () => {
    const profile: LXDProfile = {
      name: 'test',
      description: 'test description',
      config: { key: 'value' },
      devices: {
        eth0: {
          type: 'nic',
          network: 'lxdbr0',
        },
      },
      used_by: ['/1.0/instances/web'],
    };
    
    expect(profile.name).toBe('test');
    expect(profile.devices.eth0.type).toBe('nic');
  });
});

describe('Profile API methods exist on LXDApi', () => {
  test('LXDApi has listProfiles method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).listProfiles).toBe('function');
  });
  
  test('LXDApi has getProfile method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).getProfile).toBe('function');
  });
  
  test('LXDApi has createProfile method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).createProfile).toBe('function');
  });
  
  test('LXDApi has patchProfile method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).patchProfile).toBe('function');
  });
  
  test('LXDApi has deleteProfile method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).deleteProfile).toBe('function');
  });
  
  test('LXDApi has addProfileToInstance method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).addProfileToInstance).toBe('function');
  });
  
  test('LXDApi has removeProfileFromInstance method', () => {
    const api = new LXDApi({} as any);
    expect(typeof (api as any).removeProfileFromInstance).toBe('function');
  });
});
