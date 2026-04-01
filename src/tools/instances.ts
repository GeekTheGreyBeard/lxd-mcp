/**
 * Instance management MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LXDInstance, LXDInstanceState, LXDSnapshot, LXDPaginatedResult } from '../lxd/api.js';
import type { LXDPaginationMetadata } from '../lxd/client.js';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';
import { validateInstanceName } from '../lxd/validation.js';

const log = createLogger('instances');

export function registerInstanceTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // List instances tool
  server.registerTool(
    'list_instances',
    {
      title: 'List LXD Instances',
      description: 'List all LXD instances (containers and virtual machines) with optional pagination and filtering',
      inputSchema: z.object({
        project: z.string().optional().describe('LXD project name (optional)'),
        limit: z.number().min(1).max(500).optional().describe('Maximum number of instances to return (default: 100, max: 500)'),
        offset: z.number().min(0).optional().describe('Number of instances to skip (for pagination)'),
        filter: z.string().optional().describe('OData filter expression (e.g., \'status eq "Running"\', \'type eq "container"\')'),
      }),
    },
    async (args: { project?: string; limit?: number; offset?: number; filter?: string }) => {
      log.info({ project: args.project, limit: args.limit, offset: args.offset, filter: args.filter }, 'Listing instances');
      try {
        const queryParams = {
          limit: args.limit,
          offset: args.offset,
          filter: args.filter,
        };
        const result = await api.listInstances(args.project, queryParams);
        log.info({ count: result.items.length, project: args.project, pagination: result.pagination }, 'Instances listed successfully');
        return {
          content: [{ type: 'text', text: formatInstances(result.items) }],
          pagination: result.pagination ? formatPagination(result.pagination) : undefined,
        };
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to list instances');
        throw error;
      }
    }
  );

  // Create instance from remote image tool
  server.registerTool(
    'create_instance',
    {
      title: 'Create LXD Instance',
      description: 'Create a new LXD instance from a remote image (e.g., images:alpine/3.20, ubuntu:22.04)',
      inputSchema: z.object({
        name: z.string().refine(
          validateInstanceName,
          {
            message: 'Invalid instance name. Must be 1-63 characters, start/end with alphanumeric, no consecutive hyphens/underscores'
          }
        ).describe('Name for the new instance'),
        image: z.string().describe('Image to use (e.g., "alpine/3.20", "ubuntu/22.04", "debian/12")'),
        remote: z.string().optional().describe('Remote image server: "images" (default), "ubuntu", "ubuntu-daily", or full URL'),
        type: z.enum(['container', 'virtual-machine']).optional().describe('Instance type (default: container)'),
        project: z.string().optional().describe('LXD project name (optional)'),
        config: z.record(z.string(), z.string()).optional().describe('Instance configuration (e.g., {"limits.cpu": "2", "limits.memory": "2GiB"})'),
        start: z.boolean().optional().describe('Start instance after creation (default: true)'),
      }),
    },
    async (args: { 
      name: string; 
      image: string; 
      remote?: string;
      type?: 'container' | 'virtual-machine';
      project?: string;
      config?: Record<string, unknown>;
      start?: boolean;
    }) => {
      log.info({ name: args.name, image: args.image, project: args.project }, 'Creating instance');
      try {
        await api.createInstanceFromRemote({
          name: args.name,
          image: args.image,
          remoteName: args.remote,
          type: args.type,
          project: args.project,
          config: args.config as Record<string, string> | undefined,
          start: args.start,
        });
        log.info({ name: args.name, project: args.project }, 'Instance created successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Instance ${args.name} created${args.start !== false ? ' and started' : ''}` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to create instance');
        throw error;
      }
    }
  );

  // Get instance tool
  server.registerTool(
    'get_instance',
    {
      title: 'Get LXD Instance',
      description: 'Get detailed information about a specific LXD instance',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Getting instance');
      try {
        const instance = await api.getInstance(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Instance retrieved successfully');
        return { content: [{ type: 'text', text: formatInstance(instance) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to get instance');
        throw error;
      }
    }
  );

  // Get instance state tool
  server.registerTool(
    'get_instance_state',
    {
      title: 'Get Instance State',
      description: 'Get runtime state of an instance (CPU, memory, disk)',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Getting instance state');
      try {
        const state = await api.getInstanceState(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Instance state retrieved successfully');
        return { content: [{ type: 'text', text: formatInstanceState(state) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to get instance state');
        throw error;
      }
    }
  );

  // Start instance tool
  server.registerTool(
    'start_instance',
    {
      title: 'Start LXD Instance',
      description: 'Start a stopped LXD instance',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Starting instance');
      try {
        await api.startInstance(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Instance started successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Instance ${args.name} started` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to start instance');
        throw error;
      }
    }
  );

  // Stop instance tool
  server.registerTool(
    'stop_instance',
    {
      title: 'Stop LXD Instance',
      description: 'Stop a running LXD instance',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Stopping instance');
      try {
        await api.stopInstance(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Instance stopped successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Instance ${args.name} stopped` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to stop instance');
        throw error;
      }
    }
  );

  // Restart instance tool
  server.registerTool(
    'restart_instance',
    {
      title: 'Restart LXD Instance',
      description: 'Restart an LXD instance',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Restarting instance');
      try {
        await api.restartInstance(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Instance restarted successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Instance ${args.name} restarted` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to restart instance');
        throw error;
      }
    }
  );

  // Delete instance tool
  server.registerTool(
    'delete_instance',
    {
      title: 'Delete LXD Instance',
      description: 'Delete an LXD instance. Use autoStop=true to automatically stop the instance before deletion, or force=true to forcefully delete a running instance.',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
        autoStop: z.boolean().optional().describe('Automatically stop the instance before deletion (default: false)').default(false),
        force: z.boolean().optional().describe('Force delete a running instance (default: false)').default(false),
      }),
    },
    async (args: { name: string; project?: string; autoStop?: boolean; force?: boolean }) => {
      log.info({ name: args.name, project: args.project, autoStop: args.autoStop, force: args.force }, 'Deleting instance');
      try {
        await api.deleteInstance(args.name, args.project, { force: args.force ?? false, autoStop: args.autoStop ?? false });
        log.info({ name: args.name, project: args.project }, 'Instance deleted successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Instance ${args.name} deleted` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to delete instance');
        throw error;
      }
    }
  );

  // List snapshots tool
  server.registerTool(
    'list_snapshots',
    {
      title: 'List Instance Snapshots',
      description: 'List all snapshots for an instance with optional pagination',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        project: z.string().optional().describe('LXD project name (optional)'),
        limit: z.number().min(1).max(500).optional().describe('Maximum number of snapshots to return (default: 100, max: 500)'),
        offset: z.number().min(0).optional().describe('Number of snapshots to skip (for pagination)'),
      }),
    },
    async (args: { name: string; project?: string; limit?: number; offset?: number }) => {
      log.info({ name: args.name, project: args.project, limit: args.limit, offset: args.offset }, 'Listing snapshots');
      try {
        const queryParams = {
          limit: args.limit,
          offset: args.offset,
        };
        const result = await api.listSnapshots(args.name, args.project, queryParams);
        log.info({ name: args.name, count: result.items.length, project: args.project, pagination: result.pagination }, 'Snapshots listed successfully');
        return {
          content: [{ type: 'text', text: formatSnapshots(result.items) }],
          pagination: result.pagination ? formatPagination(result.pagination) : undefined,
        };
      } catch (error) {
        log.error({ 
          name: args.name, 
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to list snapshots');
        throw error;
      }
    }
  );

  // Create snapshot tool
  server.registerTool(
    'create_snapshot',
    {
      title: 'Create Instance Snapshot',
      description: 'Create a snapshot of an instance',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        snapshot_name: z.string().describe('Name for the new snapshot'),
        stateful: z.boolean().optional().describe('Include runtime state in snapshot').default(false),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; snapshot_name: string; stateful?: boolean; project?: string }) => {
      log.info({ name: args.name, snapshot_name: args.snapshot_name, project: args.project }, 'Creating snapshot');
      try {
        await api.createSnapshot(args.name, args.snapshot_name, args.stateful || false, args.project);
        log.info({ name: args.name, snapshot_name: args.snapshot_name, project: args.project }, 'Snapshot created successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Snapshot ${args.snapshot_name} created for ${args.name}` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          snapshot_name: args.snapshot_name,
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to create snapshot');
        throw error;
      }
    }
  );

  // Restore snapshot tool
  server.registerTool(
    'restore_snapshot',
    {
      title: 'Restore Instance Snapshot',
      description: 'Restore an instance from a snapshot',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        snapshot_name: z.string().describe('Snapshot name to restore'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; snapshot_name: string; project?: string }) => {
      log.info({ name: args.name, snapshot_name: args.snapshot_name, project: args.project }, 'Restoring snapshot');
      try {
        await api.restoreSnapshot(args.name, args.snapshot_name, args.project);
        log.info({ name: args.name, snapshot_name: args.snapshot_name, project: args.project }, 'Snapshot restored successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Instance ${args.name} restored from snapshot ${args.snapshot_name}` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          snapshot_name: args.snapshot_name,
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to restore snapshot');
        throw error;
      }
    }
  );

  // Delete snapshot tool
  server.registerTool(
    'delete_snapshot',
    {
      title: 'Delete Instance Snapshot',
      description: 'Delete a snapshot from an instance',
      inputSchema: z.object({
        name: z.string().describe('Instance name'),
        snapshot_name: z.string().describe('Snapshot name to delete'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; snapshot_name: string; project?: string }) => {
      log.info({ name: args.name, snapshot_name: args.snapshot_name, project: args.project }, 'Deleting snapshot');
      try {
        await api.deleteSnapshot(args.name, args.snapshot_name, args.project);
        log.info({ name: args.name, snapshot_name: args.snapshot_name, project: args.project }, 'Snapshot deleted successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Snapshot ${args.snapshot_name} deleted from ${args.name}` }) }] };
      } catch (error) {
        log.error({ 
          name: args.name, 
          snapshot_name: args.snapshot_name,
          error: error instanceof Error ? error.message : String(error), 
          project: args.project 
        }, 'Failed to delete snapshot');
        throw error;
      }
    }
  );
}

function formatInstances(instances: LXDInstance[]): string {
  if (instances.length === 0) {
    return 'No instances found';
  }
  const lines = instances.map(i => `${i.name} (${i.type}) - ${i.status}`);
  return lines.join('\n');
}

function formatInstance(instance: LXDInstance): string {
  return JSON.stringify(instance, null, 2);
}

function formatInstanceState(state: LXDInstanceState): string {
  return JSON.stringify(state, null, 2);
}

function formatSnapshots(snapshots: LXDSnapshot[]): string {
  if (snapshots.length === 0) {
    return 'No snapshots found';
  }
  const lines = snapshots.map(s => `${s.name} (stateful: ${s.stateful}) - created: ${s.created_at}`);
  return lines.join('\n');
}

function formatPagination(pagination: LXDPaginationMetadata): string {
  const hasMore = pagination.itemsRemaining > 0;
  return JSON.stringify({
    total: pagination.total,
    hasMore,
  });
}
