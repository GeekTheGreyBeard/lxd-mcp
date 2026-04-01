/**
 * Server information MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LXDServerInfo, LXDServerResources, LXDProject } from '../lxd/api.js';
import type { LXDPaginationMetadata } from '../lxd/client.js';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('server-tools');

export function registerServerTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // Get server info tool
  server.registerTool(
    'get_server_info',
    {
      title: 'Get LXD Server Info',
      description: 'Get information about the LXD server',
      inputSchema: z.object({}),
    },
    async () => {
      log.info('Getting server info');
      try {
        const info = await api.getServerInfo();
        log.info('Server info retrieved successfully');
        return { content: [{ type: 'text', text: formatServerInfo(info) }] };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to get server info');
        throw error;
      }
    }
  );

  // Get server resources tool
  server.registerTool(
    'get_server_resources',
    {
      title: 'Get LXD Server Resources',
      description: 'Get hardware resources of the LXD server',
      inputSchema: z.object({}),
    },
    async () => {
      log.info('Getting server resources');
      try {
        const resources = await api.getServerResources();
        log.info('Server resources retrieved successfully');
        return { content: [{ type: 'text', text: formatServerResources(resources) }] };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to get server resources');
        throw error;
      }
    }
  );

  // Get cluster info tool
  server.registerTool(
    'get_cluster_info',
    {
      title: 'Get LXD Cluster Info',
      description: 'Get information about the LXD cluster (if clustering is enabled)',
      inputSchema: z.object({}),
    },
    async () => {
      log.info('Getting cluster info');
      try {
        const info = await api.getServerInfo();
        if (!info.cluster) {
          log.info('Clustering is not enabled');
          return { content: [{ type: 'text', text: JSON.stringify({ cluster_enabled: false, message: 'Clustering is not enabled' }) }] };
        }
        log.info('Cluster info retrieved successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ cluster_enabled: true, cluster: info.cluster }) }] };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to get cluster info');
        throw error;
      }
    }
  );

  // List projects tool
  server.registerTool(
    'list_projects',
    {
      title: 'List LXD Projects',
      description: 'List all LXD projects with optional pagination and filtering',
      inputSchema: z.object({
        limit: z.number().min(1).max(500).optional().describe('Maximum number of projects to return (default: 100, max: 500)'),
        offset: z.number().min(0).optional().describe('Number of projects to skip (for pagination)'),
        filter: z.string().optional().describe('OData filter expression (e.g., \'name eq "default"\')'),
      }),
    },
    async (args: { limit?: number; offset?: number; filter?: string }) => {
      log.info({ limit: args.limit, offset: args.offset, filter: args.filter }, 'Listing projects');
      try {
        const queryParams = {
          limit: args.limit,
          offset: args.offset,
          filter: args.filter,
        };
        const result = await api.listProjects(queryParams);
        log.info({ count: result.items.length, pagination: result.pagination }, 'Projects listed successfully');
        return {
          content: [{ type: 'text', text: formatProjects(result.items) }],
          pagination: result.pagination ? formatPagination(result.pagination) : undefined,
        };
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to list projects');
        throw error;
      }
    }
  );

  // Get project tool
  server.registerTool(
    'get_project',
    {
      title: 'Get LXD Project',
      description: 'Get detailed information about a specific LXD project',
      inputSchema: z.object({
        name: z.string().describe('Project name'),
      }),
    },
    async (args: { name: string }) => {
      log.info({ name: args.name }, 'Getting project');
      try {
        const project = await api.getProject(args.name);
        log.info({ name: args.name }, 'Project retrieved successfully');
        return { content: [{ type: 'text', text: formatProject(project) }] };
      } catch (error) {
        log.error({ 
          name: args.name,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to get project');
        throw error;
      }
    }
  );
}

function formatServerInfo(info: LXDServerInfo): string {
  return JSON.stringify({
    server: info.server,
    version: info.server_version,
    api_version: info.api_version,
    api_extensions_count: info.api_extensions.length,
    auth: info.auth,
    public: info.public,
    cluster: info.cluster,
  }, null, 2);
}

function formatServerResources(resources: LXDServerResources): string {
  return JSON.stringify({
    cpu: {
      cores: resources.cpu.cores,
      sockets: resources.cpu.sockets,
      threads: resources.cpu.threads,
      frequency: resources.cpu.frequency,
    },
    memory: {
      total: formatBytes(resources.memory.total),
      used: formatBytes(resources.memory.used),
      free: formatBytes(resources.memory.free),
    },
    gpu_count: resources.gpu?.length || 0,
  }, null, 2);
}

function formatProjects(projects: LXDProject[]): string {
  if (projects.length === 0) {
    return 'No projects found';
  }
  const lines = projects.map(p => `${p.name} - ${p.description || 'no description'}`);
  return lines.join('\n');
}

function formatProject(project: LXDProject): string {
  return JSON.stringify(project, null, 2);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
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
