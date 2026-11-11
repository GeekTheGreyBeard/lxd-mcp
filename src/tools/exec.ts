/**
 * Command execution MCP tools for LXD containers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';
import { EXEC_UNAVAILABLE } from '../lxd/exec-policy.js';

/** Retain the tool name for compatibility, but fail before all daemon access. */
export function registerExecTools(server: McpServer, _api: LXDApiLike, _log: Logger): void {
  server.registerTool('exec_command', {
    title: 'Execute Command (Unavailable)',
    description: EXEC_UNAVAILABLE,
    inputSchema: z.object({
      container: z.string(), command: z.string(),
      user: z.number().optional(), group: z.number().optional(), cwd: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
      timeoutMs: z.number().min(1000).max(120000).optional(), project: z.string().optional(),
    }),
  }, async () => ({ content: [{type: 'text' as const, text: EXEC_UNAVAILABLE}], isError: true }));
}
