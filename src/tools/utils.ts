/**
 * Utility functions for MCP tool handlers
 */

import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

/**
 * Helper function to wrap tool handler logic with consistent error handling
 * 
 * This utility reduces code duplication by centralizing error handling
 * and logging for tool handlers. It ensures that all tool handlers
 * follow a consistent pattern for error reporting.
 * 
 * @param log - Logger instance for logging errors
 * @param context - Context object for logging (used for structured logging)
 * @param operation - Description of the operation being performed (for logging)
 * @param handler - The actual tool handler function that performs the operation
 * @returns Promise that resolves to the tool response content
 */
export async function handleToolError<T>(
  log: Logger,
  context: Record<string, unknown>,
  operation: string,
  handler: () => Promise<T>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    const result = await handler();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    log.error({ ...context, error: error instanceof Error ? error.message : String(error) }, operation);
    throw error;
  }
}