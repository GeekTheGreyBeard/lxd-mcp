/**
 * Image management MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type LXDImage, type LXDAlias } from '../lxd/api.js';
import type { LXDPaginationMetadata } from '../lxd/client.js';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('images');

export function registerImageTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // List images tool
  server.registerTool(
    'list_images',
    {
      title: 'List LXD Images',
      description: 'List all LXD images with optional pagination and filtering',
      inputSchema: z.object({
        project: z.string().optional().describe('LXD project name (optional)'),
        limit: z.number().min(1).max(500).optional().describe('Maximum number of images to return (default: 100, max: 500)'),
        offset: z.number().min(0).optional().describe('Number of images to skip (for pagination)'),
        filter: z.string().optional().describe('OData filter expression (e.g., \'type eq "container"\', \'public eq true\')'),
      }),
    },
    async (args: { project?: string; limit?: number; offset?: number; filter?: string }) => {
      log.info({ project: args.project, limit: args.limit, offset: args.offset, filter: args.filter }, 'Listing images');
      try {
        const queryParams = {
          limit: args.limit,
          offset: args.offset,
          filter: args.filter,
        };
        const result = await api.listImages(args.project, queryParams);
        log.info({ count: result.items.length, project: args.project, pagination: result.pagination }, 'Images listed successfully');
        return {
          content: [{ type: 'text', text: formatImages(result.items) }],
          pagination: result.pagination ? formatPagination(result.pagination) : undefined,
        };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to list images');
        throw error;
      }
    }
  );

  // Get image tool
  server.registerTool(
    'get_image',
    {
      title: 'Get LXD Image',
      description: 'Get detailed information about a specific LXD image',
      inputSchema: z.object({
        fingerprint: z.string().describe('Image fingerprint or alias'),
      }),
    },
    async (args: { fingerprint: string }) => {
      log.info({ fingerprint: args.fingerprint }, 'Getting image');
      try {
        const image = await api.getImage(args.fingerprint);
        log.info({ fingerprint: args.fingerprint }, 'Image retrieved successfully');
        return { content: [{ type: 'text', text: formatImage(image) }] };
      } catch (error) {
        log.error({ 
          fingerprint: args.fingerprint,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to get image');
        throw error;
      }
    }
  );

  // Delete image tool
  server.registerTool(
    'delete_image',
    {
      title: 'Delete LXD Image',
      description: 'Delete an LXD image',
      inputSchema: z.object({
        fingerprint: z.string().describe('Image fingerprint'),
      }),
    },
    async (args: { fingerprint: string }) => {
      log.info({ fingerprint: args.fingerprint }, 'Deleting image');
      try {
        await api.deleteImage(args.fingerprint);
        log.info({ fingerprint: args.fingerprint }, 'Image deleted successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Image ${args.fingerprint} deleted` }) }] };
      } catch (error) {
        log.error({ 
          fingerprint: args.fingerprint,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to delete image');
        throw error;
      }
    }
  );

  // List aliases tool
  server.registerTool(
    'list_aliases',
    {
      title: 'List Image Aliases',
      description: 'List all LXD image aliases with optional pagination',
      inputSchema: z.object({
        limit: z.number().min(1).max(500).optional().describe('Maximum number of aliases to return (default: 100, max: 500)'),
        offset: z.number().min(0).optional().describe('Number of aliases to skip (for pagination)'),
      }),
    },
    async (args: { limit?: number; offset?: number }) => {
      log.info({ limit: args.limit, offset: args.offset }, 'Listing aliases');
      try {
        const queryParams = {
          limit: args.limit,
          offset: args.offset,
        };
        const result = await api.listAliases(queryParams);
        log.info({ count: result.items.length, pagination: result.pagination }, 'Aliases listed successfully');
        return {
          content: [{ type: 'text', text: formatAliases(result.items) }],
          pagination: result.pagination ? formatPagination(result.pagination) : undefined,
        };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to list aliases');
        throw error;
      }
    }
  );

  // Get alias tool
  server.registerTool(
    'get_alias',
    {
      title: 'Get Image Alias',
      description: 'Get information about a specific image alias',
      inputSchema: z.object({
        name: z.string().describe('Alias name'),
      }),
    },
    async (args: { name: string }) => {
      log.info({ name: args.name }, 'Getting alias');
      try {
        const alias = await api.getAlias(args.name);
        log.info({ name: args.name }, 'Alias retrieved successfully');
        return { content: [{ type: 'text', text: formatAlias(alias) }] };
      } catch (error) {
        log.error({ 
          name: args.name,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to get alias');
        throw error;
      }
    }
  );

  // Create alias tool
  server.registerTool(
    'create_alias',
    {
      title: 'Create Image Alias',
      description: 'Create a new image alias',
      inputSchema: z.object({
        name: z.string().describe('Alias name'),
        description: z.string().describe('Alias description'),
        target: z.string().describe('Target image fingerprint'),
      }),
    },
    async (args: { name: string; description: string; target: string }) => {
      log.info({ name: args.name, target: args.target }, 'Creating alias');
      try {
        await api.createAlias(args.name, args.description, args.target);
        log.info({ name: args.name }, 'Alias created successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Alias ${args.name} created` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to create alias');
        throw error;
      }
    }
  );

  // Delete alias tool
  server.registerTool(
    'delete_alias',
    {
      title: 'Delete Image Alias',
      description: 'Delete an image alias',
      inputSchema: z.object({
        name: z.string().describe('Alias name'),
      }),
    },
    async (args: { name: string }) => {
      log.info({ name: args.name }, 'Deleting alias');
      try {
        await api.deleteAlias(args.name);
        log.info({ name: args.name }, 'Alias deleted successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Alias ${args.name} deleted` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to delete alias');
        throw error;
      }
    }
  );
}

function formatImages(images: LXDImage[]): string {
  if (images.length === 0) {
    return 'No images found';
  }
  const lines = images.map(i => `${i.aliases.map(a => a.name).join(', ') || i.fingerprint.slice(0, 12)} (${i.type}) - ${formatBytes(i.size)}`);
  return lines.join('\n');
}

function formatImage(image: LXDImage): string {
  return JSON.stringify(image, null, 2);
}

function formatAliases(aliases: LXDAlias[]): string {
  if (aliases.length === 0) {
    return 'No aliases found';
  }
  const lines = aliases.map(a => `${a.name} - ${a.description}`);
  return lines.join('\n');
}

function formatAlias(alias: LXDAlias): string {
  return JSON.stringify(alias, null, 2);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatPagination(pagination: LXDPaginationMetadata): string {
  const hasMore = pagination.itemsRemaining > 0;
  return JSON.stringify({
    total: pagination.total,
    hasMore,
  });
}
