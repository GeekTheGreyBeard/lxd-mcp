/**
 * LXDClient Unit Tests
 * 
 * Tests for the LXD HTTP client in isolation using mocked HTTP requests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LXDClient, LXDClientConfig } from '../../../src/lxd/client.ts';

// Mock http module
vi.mock('http', async () => {
  return {
    default: {
      request: vi.fn(),
    },
  };
});

import http from 'http';

describe('LXDClient', () => {
  let client: LXDClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const config: LXDClientConfig = {
        socketPath: '/var/lib/lxd/unix.socket'
      };
      
      const lxdClient = new LXDClient(config);
      
      expect(lxdClient).toBeInstanceOf(LXDClient);
    });

    it('should initialize with empty socket path', () => {
      const config: LXDClientConfig = {
        socketPath: ''
      };
      
      const lxdClient = new LXDClient(config);
      
      expect(lxdClient).toBeInstanceOf(LXDClient);
    });

    it('should throw on nil config', () => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        new LXDClient(null);
      }).toThrow();
    });
  });
});
