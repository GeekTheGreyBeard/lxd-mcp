/**
 * LXD Socket Availability Checker
 */

import { detectSocketPath, LXDSocketNotFoundError } from '../../src/lxd/socket-detection.js';

export interface LXDCheckResult {
  available: boolean;
  socketPath: string;
  source?: string;
  error?: string;
}

/**
 * Check if LXD socket is available
 */
export async function checkLXD(): Promise<LXDCheckResult> {
  try {
    const result = await detectSocketPath();
    return {
      available: true,
      socketPath: result.path,
      source: result.source,
    };
  } catch (error) {
    if (error instanceof LXDSocketNotFoundError) {
      return {
        available: false,
        socketPath: '',
        error: error.message,
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      socketPath: '',
      error: `Failed to detect LXD socket: ${errorMessage}`,
    };
  }
}

/**
 * Skip tests if LXD is not available
 */
export function skipIfNoLXD(result: LXDCheckResult): void {
  if (!result.available) {
    throw new Error(`SKIP: ${result.error}`);
  }
}
