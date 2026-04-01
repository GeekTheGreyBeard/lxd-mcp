/**
 * Profile management MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LXDProfile } from '../lxd/api.js';
import type { LXDPaginationMetadata } from '../lxd/client.js';
import { createLogger } from '../logging/index.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('profiles');

/**
 * Format a list of profiles for display
 */
function formatProfiles(profiles: LXDProfile[]): string {
  if (profiles.length === 0) {
    return 'No profiles found';
  }
  return profiles.map(p => `${p.name} (${p.description || 'No description'})`).join('\n');
}

/**
 * Format a single profile for display
 */
function formatProfile(profile: LXDProfile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * Format profile configuration for display
 */
function formatProfileConfig(profile: LXDProfile): string {
  const lines: string[] = [];
  lines.push(`Profile: ${profile.name}`);
  lines.push(`Description: ${profile.description || '(none)'}`);
  lines.push(`Used by: ${profile.used_by.length > 0 ? profile.used_by.join(', ') : '(none)'}`);
  
  if (Object.keys(profile.config).length > 0) {
    lines.push('\nConfiguration:');
    for (const [key, value] of Object.entries(profile.config)) {
      lines.push(`  ${key}: ${value}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Format devices for display
 */
function formatDevices(devices: Record<string, { type: string; [key: string]: string }>): string {
  if (Object.keys(devices).length === 0) {
    return 'No devices';
  }
  const lines: string[] = [];
  for (const [name, device] of Object.entries(devices)) {
    lines.push(`${name} (${device.type}):`);
    for (const [key, value] of Object.entries(device)) {
      if (key !== 'type') {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }
  return lines.join('\n');
}

function formatPagination(pagination: LXDPaginationMetadata): string {
  const hasMore = pagination.itemsRemaining > 0;
  return JSON.stringify({
    total: pagination.total,
    hasMore,
  });
}

export function registerProfileTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // List profiles tool
  server.registerTool(
    'list_profiles',
    {
      title: 'List LXD Profiles',
      description: 'List all LXD profiles with optional pagination and filtering',
      inputSchema: z.object({
        project: z.string().optional().describe('LXD project name (optional)'),
        limit: z.number().min(1).max(500).optional().describe('Maximum number of profiles to return (default: 100, max: 500)'),
        offset: z.number().min(0).optional().describe('Number of profiles to skip (for pagination)'),
        filter: z.string().optional().describe('OData filter expression (e.g., \'name eq "default"\')'),
      }),
    },
    async (args: { project?: string; limit?: number; offset?: number; filter?: string }) => {
      log.info({ project: args.project, limit: args.limit, offset: args.offset, filter: args.filter }, 'Listing profiles');
      try {
        const queryParams = {
          limit: args.limit,
          offset: args.offset,
          filter: args.filter,
        };
        const result = await api.listProfiles(args.project, queryParams);
        log.info({ count: result.items.length, project: args.project, pagination: result.pagination }, 'Profiles listed successfully');
        return {
          content: [{ type: 'text', text: formatProfiles(result.items) }],
          pagination: result.pagination ? formatPagination(result.pagination) : undefined,
        };
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to list profiles');
        throw error;
      }
    }
  );

  // Get profile tool
  server.registerTool(
    'get_profile',
    {
      title: 'Get LXD Profile',
      description: 'Get detailed information about a specific LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Getting profile');
      try {
        const profile = await api.getProfile(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Profile retrieved successfully');
        return { content: [{ type: 'text', text: formatProfile(profile) }] };
      } catch (error) {
        log.error({ name: args.name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to get profile');
        throw error;
      }
    }
  );

  // Create profile tool
  server.registerTool(
    'create_profile',
    {
      title: 'Create LXD Profile',
      description: 'Create a new LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        description: z.string().optional().describe('Profile description'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; description?: string; project?: string }) => {
      log.info({ name: args.name, description: args.description, project: args.project }, 'Creating profile');
      try {
        await api.createProfile(args.name, args.description, args.project);
        log.info({ name: args.name, project: args.project }, 'Profile created successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Profile ${args.name} created` }) }] };
      } catch (error) {
        log.error({ name: args.name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to create profile');
        throw error;
      }
    }
  );

  // Delete profile tool
  server.registerTool(
    'delete_profile',
    {
      title: 'Delete LXD Profile',
      description: 'Delete an LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; project?: string }) => {
      log.info({ name: args.name, project: args.project }, 'Deleting profile');
      try {
        await api.deleteProfile(args.name, args.project);
        log.info({ name: args.name, project: args.project }, 'Profile deleted successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Profile ${args.name} deleted` }) }] };
      } catch (error) {
        log.error({ name: args.name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to delete profile');
        throw error;
      }
    }
  );

  // Set profile config tool
  server.registerTool(
    'set_profile_config',
    {
      title: 'Set Profile Configuration',
      description: 'Set configuration options for an LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        config: z.record(z.string(), z.string()).describe('Configuration key-value pairs'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; config: Record<string, string>; project?: string }) => {
      log.info({ name: args.name, config: args.config, project: args.project }, 'Setting profile config');
      try {
        // Get current profile to merge with existing config
        const profile = await api.getProfile(args.name, args.project);
        const mergedConfig = { ...profile.config, ...args.config };
        
        await api.patchProfile(args.name, { config: mergedConfig }, args.project);
        log.info({ name: args.name, project: args.project }, 'Profile config updated successfully');
        
        const updatedProfile = await api.getProfile(args.name, args.project);
        return { content: [{ type: 'text', text: formatProfileConfig(updatedProfile) }] };
      } catch (error) {
        log.error({ name: args.name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to set profile config');
        throw error;
      }
    }
  );

  // Add profile device tool
  server.registerTool(
    'add_profile_device',
    {
      title: 'Add Profile Device',
      description: 'Add a device to an LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        device_name: z.string().describe('Device name'),
        device_type: z.string().describe('Device type (e.g., "nic", "disk", "gpu", "proxy", "usb")'),
        device_config: z.record(z.string(), z.string()).describe('Device configuration key-value pairs'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; device_name: string; device_type: string; device_config: Record<string, string>; project?: string }) => {
      log.info({ name: args.name, device_name: args.device_name, device_type: args.device_type, project: args.project }, 'Adding profile device');
      try {
        // Get current profile to merge with existing devices
        const profile = await api.getProfile(args.name, args.project);
        const devices = { ...profile.devices };
        devices[args.device_name] = {
          type: args.device_type,
          ...args.device_config,
        };
        
        await api.patchProfile(args.name, { devices }, args.project);
        log.info({ name: args.name, device_name: args.device_name, project: args.project }, 'Profile device added successfully');
        
        const updatedProfile = await api.getProfile(args.name, args.project);
        return { content: [{ type: 'text', text: formatDevices(updatedProfile.devices) }] };
      } catch (error) {
        log.error({ name: args.name, device_name: args.device_name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to add profile device');
        throw error;
      }
    }
  );

  // Remove profile device tool
  server.registerTool(
    'remove_profile_device',
    {
      title: 'Remove Profile Device',
      description: 'Remove a device from an LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        device_name: z.string().describe('Device name to remove'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; device_name: string; project?: string }) => {
      log.info({ name: args.name, device_name: args.device_name, project: args.project }, 'Removing profile device');
      try {
        // Get current profile to modify devices
        const profile = await api.getProfile(args.name, args.project);
        const devices = { ...profile.devices };
        
        if (!devices[args.device_name]) {
          throw new Error(`Device ${args.device_name} not found in profile ${args.name}`);
        }
        
        delete devices[args.device_name];
        
        await api.patchProfile(args.name, { devices }, args.project);
        log.info({ name: args.name, device_name: args.device_name, project: args.project }, 'Profile device removed successfully');
        
        const updatedProfile = await api.getProfile(args.name, args.project);
        return { content: [{ type: 'text', text: formatDevices(updatedProfile.devices) }] };
      } catch (error) {
        log.error({ name: args.name, device_name: args.device_name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to remove profile device');
        throw error;
      }
    }
  );

  // Set profile device tool
  server.registerTool(
    'set_profile_device',
    {
      title: 'Set Profile Device Configuration',
      description: 'Set configuration options for a device in an LXD profile',
      inputSchema: z.object({
        name: z.string().describe('Profile name'),
        device_name: z.string().describe('Device name'),
        device_config: z.record(z.string(), z.string()).describe('Device configuration key-value pairs'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { name: string; device_name: string; device_config: Record<string, string>; project?: string }) => {
      log.info({ name: args.name, device_name: args.device_name, project: args.project }, 'Setting profile device config');
      try {
        // Get current profile to modify device
        const profile = await api.getProfile(args.name, args.project);
        
        if (!profile.devices[args.device_name]) {
          throw new Error(`Device ${args.device_name} not found in profile ${args.name}`);
        }
        
        const devices = { ...profile.devices };
        devices[args.device_name] = {
          ...devices[args.device_name],
          ...args.device_config,
        };
        
        await api.patchProfile(args.name, { devices }, args.project);
        log.info({ name: args.name, device_name: args.device_name, project: args.project }, 'Profile device config updated successfully');
        
        const updatedProfile = await api.getProfile(args.name, args.project);
        return { content: [{ type: 'text', text: formatDevices(updatedProfile.devices) }] };
      } catch (error) {
        log.error({ name: args.name, device_name: args.device_name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to set profile device config');
        throw error;
      }
    }
  );

  // Add profile to instance tool
  server.registerTool(
    'add_profile_to_instance',
    {
      title: 'Add Profile to Instance',
      description: 'Apply a profile to an LXD instance',
      inputSchema: z.object({
        instance_name: z.string().describe('Instance name'),
        profile_name: z.string().describe('Profile name to add'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { instance_name: string; profile_name: string; project?: string }) => {
      log.info({ instance_name: args.instance_name, profile_name: args.profile_name, project: args.project }, 'Adding profile to instance');
      try {
        await api.addProfileToInstance(args.instance_name, args.profile_name, args.project);
        log.info({ instance_name: args.instance_name, profile_name: args.profile_name, project: args.project }, 'Profile added to instance successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Profile ${args.profile_name} added to instance ${args.instance_name}` }) }] };
      } catch (error) {
        log.error({ instance_name: args.instance_name, profile_name: args.profile_name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to add profile to instance');
        throw error;
      }
    }
  );

  // Remove profile from instance tool
  server.registerTool(
    'remove_profile_from_instance',
    {
      title: 'Remove Profile from Instance',
      description: 'Remove a profile from an LXD instance',
      inputSchema: z.object({
        instance_name: z.string().describe('Instance name'),
        profile_name: z.string().describe('Profile name to remove'),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: { instance_name: string; profile_name: string; project?: string }) => {
      log.info({ instance_name: args.instance_name, profile_name: args.profile_name, project: args.project }, 'Removing profile from instance');
      try {
        await api.removeProfileFromInstance(args.instance_name, args.profile_name, args.project);
        log.info({ instance_name: args.instance_name, profile_name: args.profile_name, project: args.project }, 'Profile removed from instance successfully');
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Profile ${args.profile_name} removed from instance ${args.instance_name}` }) }] };
      } catch (error) {
        log.error({ instance_name: args.instance_name, profile_name: args.profile_name, error: error instanceof Error ? error.message : String(error), project: args.project }, 'Failed to remove profile from instance');
        throw error;
      }
    }
  );
}
