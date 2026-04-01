/**
 * File operations MCP tools for LXD containers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LXDApi } from '../lxd/api.js';
import { LXDError, LXDNotFoundError } from '../lxd/errors.js';
import { validateFilePath } from '../lxd/validation.js';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('files');

// Maximum file size: 500KB
const MAX_FILE_SIZE = 500 * 1024;

/**
 * Calculate the size of base64-encoded content
 */
function getDecodedSize(base64Content: string): number {
  // Base64 encoding: 3 bytes become 4 characters
  // Add padding: each = or == adds 1 byte
  const padding = base64Content.endsWith('==') ? 2 : base64Content.endsWith('=') ? 1 : 0;
  return (base64Content.length * 3) / 4 - padding;
}

export function registerFileTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // Pull file from container tool
  server.registerTool(
    'lxd_file_pull',
    {
      title: 'Pull File from Container',
      description: [
        'Pull a single file from an LXD container.',
        'Returns the file content as base64-encoded string along with file metadata (mode, uid, gid).',
        'Works with both running and stopped containers.',
        '',
        'Security:',
        '- Path must be absolute (start with /)',
        '- Path traversal (..) is blocked',
        '- Blocked paths: /proc, /sys, /dev, /run',
        '- Maximum file size: 500KB',
        '',
        'Parameters:',
        '- container: Name of the container',
        '- path: Absolute path to the file in the container',
        '- project: LXD project name (optional)',
      ].join('\n'),
      inputSchema: z.object({
        container: z.string().describe('Container name'),
        path: z.string().describe('Absolute path to the file in the container'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: {
      container: string;
      path: string;
      project?: string;
    }) => {
      const { container, path, project } = args;
      
      log.debug({ container, path, project }, 'Pulling file from container');

      try {
        // Validate path
        const pathError = validateFilePath(path);
        if (pathError) {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: `Path validation failed: ${pathError}`,
              }, null, 2),
            }],
          };
        }

        // Check if container exists
        try {
          await api.getInstance(container, project);
        } catch (error) {
          if (error instanceof LXDNotFoundError) {
            log.error({ container, project }, 'Container not found during file pull');
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify({
                  success: false,
                  error: `Container "${container}" not found`,
                  details: error.message,
                }, null, 2),
              }],
            };
          }
          throw error;
        }

        // Pull the file
        const fileContent = await api.pullFile(container, path, project);
        
        // Check size limit
        const decodedSize = getDecodedSize(fileContent.content);
        if (decodedSize > MAX_FILE_SIZE) {
          log.error({ container, path, size: decodedSize, limit: MAX_FILE_SIZE }, 'File exceeds size limit');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: `File exceeds maximum size limit of 500KB (${Math.round(decodedSize / 1024)}KB)`,
              }, null, 2),
            }],
          };
        }

        log.debug({ 
          container, 
          path, 
          size: decodedSize,
          mode: fileContent.mode,
          uid: fileContent.uid,
          gid: fileContent.gid,
          project 
        }, 'File pulled successfully');

        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: true,
              content: fileContent.content,
              mode: fileContent.mode,
              uid: fileContent.uid,
              gid: fileContent.gid,
              size: decodedSize,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof LXDError) {
          log.error({ container, path, error: error.message, project }, 'LXD API error during file pull');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: 'LXD API error',
                details: error.message,
              }, null, 2),
            }],
          };
        }
        
        if (error instanceof Error) {
          log.error({ container, path, error: error.message, project }, 'File pull error');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: error.message,
              }, null, 2),
            }],
          };
        }
        
        log.error({ container, path, project }, 'Unknown error during file pull');
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: false,
              error: 'Unknown error occurred',
            }, null, 2),
          }],
        };
      }
    }
  );

  // Push file to container tool
  server.registerTool(
    'lxd_file_push',
    {
      title: 'Push File to Container',
      description: [
        'Push a single file to an LXD container.',
        'Writes base64-encoded content to the specified path with optional permissions.',
        'Works with both running and stopped containers.',
        '',
        'Security:',
        '- Path must be absolute (start with /)',
        '- Path traversal (..) is blocked',
        '- Blocked paths: /proc, /sys, /dev, /run',
        '- Maximum file size: 500KB',
        '',
        'Parameters:',
        '- container: Name of the container',
        '- path: Absolute path to the file in the container',
        '- content: Base64-encoded file content',
        '- mode: File permission mode (default: "0644")',
        '- uid: File owner UID (default: "0")',
        '- gid: File owner GID (default: "0")',
        '- project: LXD project name (optional)',
      ].join('\n'),
      inputSchema: z.object({
        container: z.string().describe('Container name'),
        path: z.string().describe('Absolute path to the file in the container'),
        content: z.string().describe('Base64-encoded file content'),
        mode: z.string().optional().describe('File permission mode (default: "0644")').default('0644'),
        uid: z.string().optional().describe('File owner UID (default: "0")').default('0'),
        gid: z.string().optional().describe('File owner GID (default: "0")').default('0'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: {
      container: string;
      path: string;
      content: string;
      mode?: string;
      uid?: string;
      gid?: string;
      project?: string;
    }) => {
      const { container, path, content, mode, uid, gid, project } = args;
      
      log.debug({ container, path, mode, uid, gid, project }, 'Pushing file to container');

      try {
        // Validate path
        const pathError = validateFilePath(path);
        if (pathError) {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: `Path validation failed: ${pathError}`,
              }, null, 2),
            }],
          };
        }

        // Check size limit
        const decodedSize = getDecodedSize(content);
        if (decodedSize > MAX_FILE_SIZE) {
          log.error({ container, path, size: decodedSize, limit: MAX_FILE_SIZE }, 'Content exceeds size limit');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: `Content exceeds maximum size limit of 500KB (${Math.round(decodedSize / 1024)}KB)`,
              }, null, 2),
            }],
          };
        }

        // Check if container exists
        try {
          await api.getInstance(container, project);
        } catch (error) {
          if (error instanceof LXDNotFoundError) {
            log.error({ container, project }, 'Container not found during file push');
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify({
                  success: false,
                  error: `Container "${container}" not found`,
                  details: error.message,
                }, null, 2),
              }],
            };
          }
          throw error;
        }

        // Push the file
        await api.pushFile(container, path, content, mode, uid, gid, project);

        log.debug({ 
          container, 
          path, 
          size: decodedSize,
          mode,
          uid,
          gid,
          project 
        }, 'File pushed successfully');

        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: true,
              path,
              size: decodedSize,
              mode,
              uid,
              gid,
            }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof LXDError) {
          log.error({ container, path, error: error.message, project }, 'LXD API error during file push');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: 'LXD API error',
                details: error.message,
              }, null, 2),
            }],
          };
        }
        
        if (error instanceof Error) {
          log.error({ container, path, error: error.message, project }, 'File push error');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: error.message,
              }, null, 2),
            }],
          };
        }
        
        log.error({ container, path, project }, 'Unknown error during file push');
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: false,
              error: 'Unknown error occurred',
            }, null, 2),
          }],
        };
      }
    }
  );
}
