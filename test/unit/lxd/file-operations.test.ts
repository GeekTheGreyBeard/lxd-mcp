/**
 * LXD File Operations Unit Tests
 * 
 * Tests for file pull/push operations with header capture and metadata handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LXDApi } from '../../../src/lxd/api.ts';
import { LXDClient } from '../../../src/lxd/client.ts';

// Mock the LXDClient
vi.mock('../../../src/lxd/client.ts', () => ({
  LXDClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getFileRaw: vi.fn(),
    getFileRawWithHeaders: vi.fn(),
    postFileRaw: vi.fn(),
  })),
  LXDResponse: class LXDResponse {
    type: string;
    status: string;
    status_code: number;
    metadata: unknown;
    
    constructor(data: { type: string; status: string; status_code: number; metadata: unknown }) {
      this.type = data.type;
      this.status = data.status;
      this.status_code = data.status_code;
      this.metadata = data.metadata;
    }
  },
}));

describe('LXDApi File Operations', () => {
  let api: LXDApi;
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getFileRaw: ReturnType<typeof vi.fn>;
    getFileRawWithHeaders: ReturnType<typeof vi.fn>;
    postFileRaw: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create a mock client instance
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      getFileRaw: vi.fn(),
      getFileRawWithHeaders: vi.fn(),
      postFileRaw: vi.fn(),
    };
    
    // Mock the constructor to return our instance
    vi.mocked(LXDClient).mockImplementation(() => mockClient as unknown as LXDClient);
    
    api = new LXDApi(mockClient as unknown as LXDClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock LXD responses
  const createMockResponse = <T>(metadata: T) => ({
    type: 'sync',
    status: 'Success',
    status_code: 200,
    metadata,
  });

  describe('pullFile', () => {
    it('should pull file with metadata from headers', async () => {
      // Mock the getFileRawWithHeaders to return buffer and headers
      const mockHeaders = {
        'x-lxd-mode': '0644',
        'x-lxd-uid': '1000',
        'x-lxd-gid': '1000',
      };
      
      const mockBuffer = Buffer.from('test file content');
      vi.mocked(mockClient.getFileRawWithHeaders).mockResolvedValueOnce({
        buffer: mockBuffer,
        headers: mockHeaders
      });

      const result = await api.pullFile('test-instance', '/etc/test.txt');

      expect(result.content).toBe('dGVzdCBmaWxlIGNvbnRlbnQ='); // base64 encoded
      expect(result.mode).toBe('0644');
      expect(result.uid).toBe('1000');
      expect(result.gid).toBe('1000');
      expect(mockClient.getFileRawWithHeaders).toHaveBeenCalledWith('/1.0/instances/test-instance/files?path=%2Fetc%2Ftest.txt');
    });

    it('should pull file with fallback defaults when headers missing', async () => {
      // Mock the getFileRawWithHeaders to return buffer and headers with missing metadata
      const mockHeaders = {
        'x-lxd-type': 'file', // missing mode, uid, gid
      };
      
      const mockBuffer = Buffer.from('test file content');
      vi.mocked(mockClient.getFileRawWithHeaders).mockResolvedValueOnce({
        buffer: mockBuffer,
        headers: mockHeaders
      });

      const result = await api.pullFile('test-instance', '/etc/test.txt');

      expect(result.content).toBe('dGVzdCBmaWxlIGNvbnRlbnQ='); // base64 encoded
      expect(result.mode).toBe('0644'); // fallback default
      expect(result.uid).toBe('0'); // fallback default
      expect(result.gid).toBe('0'); // fallback default
    });

    it('should pull file with project parameter', async () => {
      const mockHeaders = {
        'x-lxd-mode': '0755',
        'x-lxd-uid': '0',
        'x-lxd-gid': '0',
      };
      
      const mockBuffer = Buffer.from('test file content');
      vi.mocked(mockClient.getFileRawWithHeaders).mockResolvedValueOnce({
        buffer: mockBuffer,
        headers: mockHeaders
      });

      const result = await api.pullFile('test-instance', '/etc/test.txt', 'my-project');

      expect(result.content).toBe('dGVzdCBmaWxlIGNvbnRlbnQ='); // base64 encoded
      expect(mockClient.getFileRawWithHeaders).toHaveBeenCalledWith('/1.0/instances/test-instance/files?path=%2Fetc%2Ftest.txt&project=my-project');
    });
  });

  describe('pushFile', () => {
    it('should push file with metadata headers', async () => {
      const mockContent = 'dGVzdCBmaWxlIGNvbnRlbnQ='; // base64 encoded content
      
      await api.pushFile('test-instance', '/etc/test.txt', mockContent, '0755', '1000', '1000');

      expect(mockClient.postFileRaw).toHaveBeenCalledWith(
        '/1.0/instances/test-instance/files?path=%2Fetc%2Ftest.txt',
        Buffer.from('test file content'),
        {
          'X-LXD-mode': '493', // 0755 in decimal
          'X-LXD-uid': '1000',
          'X-LXD-gid': '1000',
        }
      );
    });

    it('should push file with default permissions and project', async () => {
      const mockContent = 'dGVzdCBmaWxlIGNvbnRlbnQ='; // base64 encoded content
      
      await api.pushFile('test-instance', '/etc/test.txt', mockContent, '0644', '0', '0', 'my-project');

      expect(mockClient.postFileRaw).toHaveBeenCalledWith(
        '/1.0/instances/test-instance/files?path=%2Fetc%2Ftest.txt&project=my-project',
        Buffer.from('test file content'),
        {
          'X-LXD-mode': '420', // 0644 in decimal
          'X-LXD-uid': '0',
          'X-LXD-gid': '0',
        }
      );
    });

    it('should push file with octal conversion for mode', async () => {
      const mockContent = 'dGVzdCBmaWxlIGNvbnRlbnQ='; // base64 encoded content
      
      // Test with different octal modes
      await api.pushFile('test-instance', '/etc/test.txt', mockContent, '0600', '0', '0');

      expect(mockClient.postFileRaw).toHaveBeenCalledWith(
        '/1.0/instances/test-instance/files?path=%2Fetc%2Ftest.txt',
        Buffer.from('test file content'),
        {
          'X-LXD-mode': '384', // 0600 in decimal
          'X-LXD-uid': '0',
          'X-LXD-gid': '0',
        }
      );
    });
  });
});