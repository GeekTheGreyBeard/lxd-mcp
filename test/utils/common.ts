/**
 * Test Utilities - Common patterns for testing LXD MCP
 */

import { vi } from 'vitest';
import { MCPClient } from './mcp-client.ts';
import { checkLXD, LXDCheckResult } from './lxd.ts';

/**
 * Test utility for skipping tests when LXD is not available
 */
export function skipIfNoLXD(result: LXDCheckResult): void {
  if (!result.available) {
    // This will cause the test to be skipped
    throw new Error(`SKIP: ${result.error}`);
  }
}

/**
 * Mock implementation for common LXD operations
 */
export function mockLXDClient() {
  return {
    // Mock methods for testing
    listInstances: vi.fn(),
    getInstance: vi.fn(),
    createInstance: vi.fn(),
    deleteInstance: vi.fn(),
    startInstance: vi.fn(),
    stopInstance: vi.fn(),
    restartInstance: vi.fn(),
    // Add more methods as needed
  };
}

/**
 * Test utility for creating unique resource names
 */
export function createTestResourceName(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Test utility for creating mock MCP responses
 */
export function createMockResponse<T>(data: T): { result: T; error?: undefined } {
  return {
    result: data,
    error: undefined,
  };
}

/**
 * Test utility for creating mock MCP error responses
 */
export function createMockError(message: string, code?: number): { result?: undefined; error: { message: string; code?: number } } {
  return {
    error: {
      message,
      code,
    },
  };
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Test utility for creating test fixtures
 */
export function createTestFixture<T>(data: T): T {
  return { ...data };
}

/**
 * Test utility for cleaning up test resources
 */
export async function cleanupTestResources(resources: Array<{ cleanup?: () => Promise<void> }>): Promise<void> {
  for (const resource of resources) {
    if (resource.cleanup) {
      await resource.cleanup();
    }
  }
}

/**
 * Test utility for validating LXD configuration
 */
export async function validateLXDConfig(socketPath?: string): Promise<LXDCheckResult> {
  return checkLXD(socketPath);
}