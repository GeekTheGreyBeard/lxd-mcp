/**
 * Logs management MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('logs');

export function registerLogsTools(server: McpServer, api: LXDApiLike, logger: Logger): void {
  // Get container logs tool
  server.registerTool(
    'lxd_logs',
    {
      title: 'Get LXD Container Logs',
      description: [
        'Get log files from a container. Use to list available log files or retrieve their content for debugging container startup issues.',
        '',
        '### Log File Naming Patterns:',
        '- Log files are stored as separate files in LXD (e.g., <container-name>.stdout, <container-name>.stderr).',
        '- Use without log_file parameter to first list available log files.',
        '- Common log file names: "journald", "lxc.conf", "<name>.stdout", "<name>.stderr".',
        '',
        '### Retrieving Logs from Running Processes:',
        '- To check logs from a running server process, first list available logs (omit log_file parameter).',
        '- Then retrieve the specific log file using the appropriate file name.',
        '- Poll logs at appropriate intervals to monitor long-running process progress.',
        '- If no logs exist for a container, returns an empty list.',
      ].join('\n'),
      inputSchema: z.object({
        name: z.string().describe('Container name'),
        log_file: z.string().optional().describe('Log file name to retrieve (e.g., "journald", "lxc.conf"). If omitted, lists available log files.'),
        lines: z.number().optional().describe('Number of lines to retrieve from end of log file (default: all)'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { 
      name: string; 
      log_file?: string;
      lines?: number;
      project?: string;
    }) => {
      log.info({ name: args.name, log_file: args.log_file, project: args.project }, 'Fetching container logs');
      try {
        let result: string | string[];
        
        if (args.log_file) {
          // Get specific log file content
          const content = await api.getInstanceLog(args.name, args.log_file, args.project);
          
          // Apply line limit if specified
          let lines = content.split('\n');
          if (args.lines && args.lines > 0) {
            lines = lines.slice(-args.lines);
          }
          
          result = lines;
        } else {
          // List available log files
          const logFiles = await api.listInstanceLogs(args.name, args.project);
          result = logFiles;
        }
        
        log.info({ name: args.name, project: args.project }, 'Logs retrieved successfully');
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to get container logs');
        throw error;
      }
    }
  );
}
