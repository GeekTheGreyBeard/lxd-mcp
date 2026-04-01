/**
 * Monitor MCP tools - for tracking LXD events
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('monitor');

export function registerMonitorTools(server: McpServer, api: LXDApiLike, logger: Logger): void {
  // Monitor container events tool
  server.registerTool(
    'lxd_monitor',
    {
      title: 'Monitor LXD Events',
      description: 'Monitor LXD lifecycle and operation events. Use to track container start/stop, image pulls, and other operations in real-time.',
      inputSchema: z.object({
        types: z.array(z.enum(['lifecycle', 'operation'])).optional().describe('Event types to monitor: "lifecycle" (instance-started, etc.) and/or "operation" (image-pull, etc.). Default: both'),
        project: z.string().optional().describe('LXD project name (optional)'),
        timeout: z.number().optional().describe('Timeout in milliseconds to wait for events (default: 5000, max: 30000)'),
      }),
    },
    async (args: { 
      types?: ('lifecycle' | 'operation')[];
      project?: string;
      timeout?: number;
    }) => {
      log.info({ types: args.types, project: args.project, timeout: args.timeout }, 'Monitoring LXD events');
      try {
        // Clamp timeout between 1000 and 30000 ms
        const timeoutMs = args.timeout 
          ? Math.min(Math.max(args.timeout, 1000), 30000)
          : 5000;
        
        const events = await api.getEvents({
          types: args.types,
          project: args.project,
          timeoutMs,
        });
        
        log.info({ count: events.length, project: args.project }, 'Events retrieved successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, events }, null, 2) }] };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to monitor events');
        throw error;
      }
    }
  );
}
