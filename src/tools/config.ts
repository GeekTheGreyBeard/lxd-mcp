/**
 * LXD Configuration management MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('config');

export function registerConfigTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // lxd_config_set tool - Set configuration options on a container
  server.registerTool(
    'lxd_config_set',
    {
      title: 'Set LXD Configuration',
      description: 'Set configuration options on an LXD container',
      inputSchema: z.object({
        container: z.string().describe('Name of the container'),
        config: z.record(z.string(), z.string()).describe('Configuration key-value pairs to set'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { container: string; config: Record<string, string>; project?: string }) => {
      log.info({ container: args.container, project: args.project }, 'Setting configuration');
      try {
        // Validate container name - should not be empty or contain invalid characters
        if (!args.container || args.container.trim() === '') {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container name is required' }) }] };
        }
        
        // Validate container name format (LXD allows alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9._-]+$/.test(args.container)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container name contains invalid characters' }) }] };
        }

        // Validate config object - check that it's a proper object with string key-value pairs
        if (!args.config || typeof args.config !== 'object' || Array.isArray(args.config)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Configuration must be a valid object with key-value pairs' }) }] };
        }

        // Check each key-value pair to ensure they are strings
        for (const [key, value] of Object.entries(args.config)) {
          if (typeof key !== 'string') {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Configuration keys must be strings' }) }] };
          }
          if (typeof value !== 'string') {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Configuration values must be strings' }) }] };
          }
        }
        
        // Additional validation: check for LXD config key restrictions
        for (const [key] of Object.entries(args.config)) {
          // LXD configuration keys should not contain spaces or special characters
          if (key.includes(' ')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Configuration keys cannot contain spaces' }) }] };
          }
          if (key.includes('\t')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Configuration keys cannot contain tabs' }) }] };
          }
        }

        // Get the existing instance to check it exists and get current config
        const instance = await api.getInstance(args.container, args.project);
        
        // Create updated config by merging new values with existing ones
        const updatedConfig = { ...instance.config, ...args.config };
        
        // Use the direct LXD API to patch the instance configuration
        // This eliminates the command injection vulnerability from using child_process.spawn
        await api.patchInstance(args.container, { config: updatedConfig }, args.project);
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: true, 
              message: `Configuration set successfully on container ${args.container}`,
              data: { container: args.container, config: args.config }
            }) 
          }] 
        };
      } catch (error) {
        log.error({ 
          container: args.container, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to set configuration');
        
        // Map common LXD errors to user-friendly messages
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container not found' }) }] };
          } else if (error.message.includes('permission denied')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Permission denied' }) }] };
          } else if (error.message.includes('invalid key')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Invalid configuration key' }) }] };
          }
        }
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Failed to set configuration' 
            }) 
          }] 
        };
      }
    }
  );

  // lxd_config_get tool - Get configuration options from a container
  server.registerTool(
    'lxd_config_get',
    {
      title: 'Get LXD Configuration',
      description: 'Get configuration options from an LXD container',
      inputSchema: z.object({
        container: z.string().describe('Name of the container'),
        key: z.string().optional().describe('Specific configuration key to retrieve (optional)'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { container: string; key?: string; project?: string }) => {
      log.info({ container: args.container, key: args.key, project: args.project }, 'Getting configuration');
      try {
        // Validate container name - should not be empty or contain invalid characters
        if (!args.container || args.container.trim() === '') {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container name is required' }) }] };
        }
        
        // Validate container name format (LXD allows alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9._-]+$/.test(args.container)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container name contains invalid characters' }) }] };
        }

        // Get the instance configuration
        const instance = await api.getInstance(args.container, args.project);
        
        if (args.key) {
          // Return specific configuration key
          const value = instance.config[args.key];
          if (value === undefined) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Configuration key not found' }) }] };
          }
          
          return { 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                success: true, 
                message: `Retrieved configuration key ${args.key}`,
                data: { 
                  container: args.container, 
                  key: args.key, 
                  value: value 
                } 
              }) 
            }] 
          };
        } else {
          // Return all configuration values
          return { 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                success: true, 
                message: 'Retrieved all configuration',
                data: { 
                  container: args.container, 
                  config: instance.config 
                } 
              }) 
            }] 
          };
        }
      } catch (error) {
        log.error({ 
          container: args.container, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to get configuration');
        
        // Map common LXD errors to user-friendly messages
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container not found' }) }] };
          } else if (error.message.includes('permission denied')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Permission denied' }) }] };
          }
        }
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Failed to get configuration' 
            }) 
          }] 
        };
      }
    }
  );

  // lxd_config_show tool - Show full expanded configuration for a container
  server.registerTool(
    'lxd_config_show',
    {
      title: 'Show LXD Configuration',
      description: 'Show full expanded configuration for an LXD container including inherited values',
      inputSchema: z.object({
        container: z.string().describe('Name of the container'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { container: string; project?: string }) => {
      log.info({ container: args.container, project: args.project }, 'Showing configuration');
      try {
        // Validate container name - should not be empty or contain invalid characters
        if (!args.container || args.container.trim() === '') {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container name is required' }) }] };
        }
        
        // Validate container name format (LXD allows alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9._-]+$/.test(args.container)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container name contains invalid characters' }) }] };
        }

        // Get the instance configuration
        const instance = await api.getInstance(args.container, args.project);
        
        // Return all configuration including inherited values
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: true, 
              message: 'Retrieved configuration',
              data: { 
                container: args.container, 
                config: instance.config 
              } 
            }) 
          }] 
        };
      } catch (error) {
        log.error({ 
          container: args.container, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to show configuration');
        
        // Map common LXD errors to user-friendly messages
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Container not found' }) }] };
          } else if (error.message.includes('permission denied')) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Permission denied' }) }] };
          }
        }
        
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: false, 
              error: error instanceof Error ? error.message : 'Failed to show configuration' 
            }) 
          }] 
        };
      }
    }
  );
}
