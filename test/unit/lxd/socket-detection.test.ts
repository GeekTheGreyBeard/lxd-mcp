/**
 * Unit tests for socket detection module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LXDSocketNotFoundError } from '../../../src/lxd/socket-detection.ts';

// Use vi.hoisted to properly mock modules before import
const { mockAccess } = vi.hoisted(() => {
  return {
    mockAccess: vi.fn(),
  };
});

vi.mock('fs/promises', () => ({
  access: mockAccess,
}));

import { detectSocketPath } from '../../../src/lxd/socket-detection.ts';

describe('socket-detection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear env vars before each test
    delete process.env.LXD_SOCKET_PATH;
    delete process.env.LXD_DIR;
  });

  describe('detectSocketPath', () => {
    it('should throw LXDSocketNotFoundError when no socket is accessible', async () => {
      // All paths fail
      mockAccess.mockRejectedValue(new Error('not found'));

      await expect(detectSocketPath()).rejects.toThrow(LXDSocketNotFoundError);
    });

    it('should include checked paths in error when no socket found', async () => {
      mockAccess.mockRejectedValue(new Error('not found'));

      try {
        await detectSocketPath();
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LXDSocketNotFoundError);
        const lxdError = error as LXDSocketNotFoundError;
        // Should have checked snap, apt and source paths
        expect(lxdError.checkedPaths.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('LXDSocketNotFoundError', () => {
    it('should have correct name', () => {
      const error = new LXDSocketNotFoundError([]);
      expect(error.name).toBe('LXDSocketNotFoundError');
    });

    it('should include checked paths in error', () => {
      const paths = [
        { path: '/path1', source: 'source1' },
        { path: '/path2', source: 'source2' },
      ];
      const error = new LXDSocketNotFoundError(paths);
      expect(error.checkedPaths).toEqual(paths);
      expect(error.message).toContain('/path1 (source1)');
      expect(error.message).toContain('/path2 (source2)');
    });
  });
});
