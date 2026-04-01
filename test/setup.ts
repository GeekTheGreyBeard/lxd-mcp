/**
 * Global test setup for Vitest
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Setup global test environment
beforeAll(async () => {
  // Global setup before all tests
  console.log('[Test Setup] Starting test environment...');
});

afterAll(async () => {
  // Global cleanup after all tests
  console.log('[Test Setup] Cleaning up test environment...');
});

afterEach(async () => {
  // Cleanup after each test
  vi.clearAllMocks();
});
