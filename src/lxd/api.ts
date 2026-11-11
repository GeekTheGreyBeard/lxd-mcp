/**
 * LXD API wrapper for common operations
 */

import { executeRecordedCommand, type ExecResult } from './exec-operation.js';
import { collectEvents } from './event-stream.js';
import { safePathSegment, resourceName } from './path.js';
import { LXDClient, LXDResponse, LXDQueryParams, LXDPaginatedResponse } from './client.js';
import { MCPConnectionError } from './errors.js';
import { createLogger } from '../logging/index.js';
import type { LXDApiLike } from './scoped-api.js';

const log = createLogger('lxd-api');

// Instance types
export interface LXDInstance {
  name: string;
  type: 'container' | 'virtual-machine';
  status: string;
  arch: number;
  created_at: string;
  started_at: string;
  ephemeral: boolean;
  pinned: boolean;
  restricted: boolean;
  max_priority: string;
  profiles: string[];
  config: Record<string, string>;
  devices: Record<string, unknown>;
  stateful: boolean;
  state_code: number;
  state_message: string;
}

export interface LXDInstanceState {
  status: string;
  status_code: number;
  cpu: number;
  memory: number;
  disk: number;
  network: Record<string, unknown>;
}

export interface LXDSnapshot {
  name: string;
  stateful: boolean;
  created_at: string;
  expiry_date: string;
}

export interface LXDImage {
  fingerprint: string;
  filename: string;
  size: number;
  public: boolean;
  auto_update: boolean;
  architecture: number;
  type: string;
  created_at: string;
  uploaded_at: string;
  expires_at: string;
  properties: Record<string, string>;
  aliases: LXDAlias[];
}

export interface LXDAlias {
  name: string;
  description: string;
  type: string;
}

export interface LXDServerInfo {
  api_extensions: string[];
  api_version: string;
  auth: string;
  config: Record<string, string>;
  environment: Record<string, string>;
  public: boolean;
  server: string;
  server_version: string;
  cluster?: LXDClusterInfo;
}

export interface LXDServerResources {
  cpu: LXDCPUResources;
  memory: LXDMemoryResources;
  gpu: LXDGPUResources[];
  network: Record<string, unknown>;
  storage: Record<string, unknown>;
}

export interface LXDCPUResources {
  cores: number;
  sockets: number;
  threads: number;
  frequency: number;
  frequency_usable: boolean;
  voltage: string;
}

export interface LXDMemoryResources {
  total: number;
  used: number;
  free: number;
}

export interface LXDGPUResources {
  numa_node: number;
  vendor: string;
  variant: string;
  device_address: string;
  driver_version: string;
  drm_render_node: string;
  name: string;
  num_vf: number;
  pci_address: string;
  pf_driver: string;
  type: string;
}

export interface LXDClusterInfo {
  enabled: boolean;
  member: boolean;
  server_name: string;
  cluster: string;
}

export interface LXDProject {
  name: string;
  description: string;
  config: Record<string, string>;
  used_by: string[];
}

export interface LXDProfile {
  name: string;
  description: string;
  config: Record<string, string>;
  devices: Record<string, {
    type: string;
    [key: string]: string;
  }>;
  used_by: string[];
}

// Exec output log file types
export interface LXDExecOutputLogFile {
  name: string;
  mtime: string;
  size: number;
}

export interface LXDExecOutputLogFiles {
  metadata: LXDExecOutputLogFile[];
}

// File operation types
export interface LXDFileContent {
  /** Base64-encoded file content */
  content: string;
  /** File mode (e.g., "0644") */
  mode: string;
  /** File uid */
  uid: string;
  /** File gid */
  gid: string;
}

export interface LXDFilePushRequest {
  /** Base64-encoded file content */
  content: string;
  /** File mode (e.g., "0644") */
  mode?: string;
  /** File uid (default: "0") */
  uid?: string;
  /** File gid (default: "0") */
  gid?: string;
  /** Type field required by LXD API */
  type?: string;
}

// Event types
export type LXDEventType = 'logging' | 'operation' | 'lifecycle';

/**
 * Lifecycle event from LXD
 */
export interface LXDLifecycleEvent {
  type: 'lifecycle';
  timestamp: string;
  location?: string;
  metadata: {
    action: string;
    source: string;
    requestor?: {
      protocol: string;
      username: string;
    };
    context?: Record<string, unknown>;
  };
}

/**
 * Operation event from LXD
 */
export interface LXDOperationEvent {
  type: 'operation';
  timestamp: string;
  location?: string;
  metadata: {
    id: string;
    class: string;
    description: string;
    created_at: string;
    updated_at: string;
    status: string;
    status_code: number;
    resources: Record<string, unknown>;
    metadata: Record<string, unknown>;
    may_cancel: boolean;
    err?: string;
  };
}

// Exec operation types
export interface LXDExecRequest {
  command: string[];
  environment?: Record<string, string>;
  user?: number;
  group?: number;
  cwd?: string;
  'interactive'?: boolean;
  'record-output'?: boolean;
}

export interface LXDExecResponse extends ExecResult {}

// Async operation response from LXD
interface LXDOperationMetadata {
  id: string;
  class: string;
  description: string;
  status: string;
  status_code: number;
  err?: string;
  metadata?: {
    exit_code: number;
    stdout: string;
    stderr: string;
  };
}

interface LXDOperationResponse {
  type: string;
  status: string;
  status_code: number;
  operation: string;
  error_code: number;
  error: string;
  metadata: LXDOperationMetadata;
}

/**
 * Result of a paginated list operation
 */
export interface LXDPaginatedResult<T> {
  items: T[];
  pagination?: LXDPaginationMetadata;
}

export interface LXDPaginationMetadata {
  /** Total number of items available */
  total: number;
  /** Total items without filter applied */
  totalUnfiltered: number;
  /** Items remaining after current page */
  itemsRemaining: number;
}

export class LXDApi implements LXDApiLike {
  private client: LXDClient;
  private log = log;

  constructor(client: LXDClient) {
    this.client = client;
  }

  private async completeOperation(response: LXDResponse<unknown>, project?: string): Promise<void> {
    if (response.type !== 'async') return;
    const id = (response.metadata as { id?: string })?.id;
    if (!id) throw new Error('LXD asynchronous response omitted operation ID; outcome unknown');
    const params = new URLSearchParams({ timeout: '120' });
    if (project) params.set('project', project);
    const result = await this.client.get<{ status_code: number; status: string; err?: string }>(
      `/1.0/operations/${safePathSegment(id)}/wait?${params}`, undefined, { timeout: 125000 });
    if (result.metadata.status_code !== 200 || result.metadata.err) {
      throw new Error(`LXD operation did not succeed: ${result.metadata.err || result.metadata.status || result.metadata.status_code}; operation ${id}`);
    }
  }

  // Instance operations

  async listInstances(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDInstance>> {
    const params = new URLSearchParams();
    if (project) {
      params.set('project', project);
    }
    if (queryParams?.limit) {
      params.set('limit', queryParams.limit.toString());
    }
    if (queryParams?.offset) {
      params.set('offset', queryParams.offset.toString());
    }
    if (queryParams?.filter) {
      params.set('filter', queryParams.filter);
    }

    const queryString = params.toString();
    const path = queryString ? `/1.0/instances?${queryString}` : '/1.0/instances';

    const response = await this.client.get<string[]>(path);

    const instances: LXDInstance[] = [];
    for (const instanceUrl of response.metadata) {
      const name = resourceName(instanceUrl);
      if (name) {
        const details = await this.getInstance(name, project);
        instances.push(details);
      }
    }

    return {
      items: instances,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getInstance(name: string, project?: string): Promise<LXDInstance> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}`;
    const response = await this.client.get<LXDInstance>(path);
    return response.metadata;
  }

  async getInstanceState(name: string, project?: string): Promise<LXDInstanceState> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(name)}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}/state`;
    const response = await this.client.get<LXDInstanceState>(path);
    return response.metadata;
  }

  async startInstance(name: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(name)}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}/state`;
    await this.completeOperation(await this.client.put(path, { action: 'start', force: true }), project);
  }

  async stopInstance(name: string, project?: string): Promise<void> {
    const state = await this.getInstanceState(name, project);
    if (state.status === 'Stopped') {
      return;
    }

    const path = project 
      ? `/1.0/instances/${safePathSegment(name)}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}/state`;
    await this.completeOperation(await this.client.put(path, { action: 'stop', force: true }), project);
    
    await this.waitForInstanceStop(name, project);
  }

  private async waitForInstanceStop(name: string, project?: string, maxAttempts: number = 30, intervalMs: number = 1000): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const state = await this.getInstanceState(name, project);
      if (state.status === 'Stopped') {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Instance ${name} did not stop within expected time`);
  }

  async restartInstance(name: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(name)}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}/state`;
    await this.completeOperation(await this.client.put(path, { action: 'restart', force: true }), project);
  }

  async deleteInstance(name: string, project?: string, options: { force?: boolean; autoStop?: boolean } = {}): Promise<void> {
    const force = options.force ?? false;
    const autoStop = options.autoStop ?? false;
    
    log.info({ name, project, force, autoStop }, 'deleteInstance called with options');
    
    if (force || autoStop) {
      try {
        const state = await this.getInstanceState(name, project);
        log.debug({ name, state: state.status }, 'Instance state check result');
        if (state.status !== 'Stopped') {
          if (force) {
            log.info({ name }, 'Force delete - skipping stop, will use force query param');
          } else if (autoStop) {
            log.info({ name }, 'Auto-stop mode - stopping instance first');
            await this.stopInstance(name, project);
          }
        }
      } catch (error) {
        // Fail closed when state could not be verified.
        throw error;
      }
    }
    
    let path = project 
      ? `/1.0/instances/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}`;
    
    if (force) {
      path += path.includes('?') ? '&force=true' : '?force=true';
    }
    
    log.info({ path, force, autoStop }, 'DELETE request path and parameters');
    
    try {
      await this.completeOperation(await this.client.delete(path), project);
    } catch (error) {
      log.error({ path, force, autoStop, error: error instanceof Error ? error.message : String(error) }, 'DELETE request failed');
      throw error;
    }
  }

  async createInstanceFromRemote(params: {
    name: string;
    image: string;
    remote?: string;
    remoteName?: string;
    type?: 'container' | 'virtual-machine';
    project?: string;
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    start?: boolean;
  }): Promise<void> {
    let server = params.remote || 'https://images.lxd.canonical.com';
    let alias = params.image;
    
    let isUbuntuRemote = false;
    if (params.remoteName) {
      if (params.remoteName === 'images') {
        server = 'https://images.lxd.canonical.com';
      } else if (params.remoteName === 'ubuntu') {
        server = 'https://cloud-images.ubuntu.com/releases/';
        isUbuntuRemote = true;
      } else if (params.remoteName === 'ubuntu-daily') {
        server = 'https://cloud-images.ubuntu.com/daily/';
        isUbuntuRemote = true;
      }
      alias = params.image;
    } else if (params.image.includes(':')) {
      const [remote, img] = params.image.split(':', 2);
      if (remote === 'images') {
        server = 'https://images.lxd.canonical.com';
        alias = img;
        if (img.startsWith('ubuntu/')) {
          isUbuntuRemote = true;
        }
      } else if (remote === 'ubuntu') {
        server = 'https://cloud-images.ubuntu.com/releases/';
        alias = img;
        isUbuntuRemote = true;
      } else {
        alias = params.image;
      }
    } else {
      if (params.image.startsWith('ubuntu/')) {
        isUbuntuRemote = true;
        server = 'https://cloud-images.ubuntu.com/releases/';
        alias = params.image.substring(7);
      }
    }

    if (isUbuntuRemote && alias.startsWith('ubuntu/')) {
      alias = alias.substring(7);
    }

    const path = params.project
      ? `/1.0/instances?project=${encodeURIComponent(params.project)}`
      : '/1.0/instances';

    const instanceData: Record<string, unknown> = {
      name: params.name,
      type: params.type || 'container',
      source: {
        type: 'image',
        protocol: 'simplestreams',
        server: server,
        alias: alias,
      },
    };

    if (params.config) {
      instanceData.config = params.config;
    }

    if (params.devices) {
      instanceData.devices = params.devices;
    }

    if (params.start !== false) {
      instanceData.start = true;
    }

    this.log.debug({ 
      name: params.name, 
      image: params.image, 
      remote: params.remote, 
      type: params.type,
    }, 'Creating instance from remote image');

    await this.completeOperation(await this.client.post(path, instanceData), params.project);
  }

  // Snapshot operations

  async listSnapshots(name: string, project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDSnapshot>> {
    const params = new URLSearchParams();
    if (project) {
      params.set('project', project);
    }
    if (queryParams?.limit) {
      params.set('limit', queryParams.limit.toString());
    }
    if (queryParams?.offset) {
      params.set('offset', queryParams.offset.toString());
    }

    const queryString = params.toString();
    const path = queryString 
      ? `/1.0/instances/${safePathSegment(name)}/snapshots?${queryString}`
      : `/1.0/instances/${safePathSegment(name)}/snapshots`;

    const response = await this.client.get<string[]>(path);
    const snapshots: LXDSnapshot[] = [];
    for (const snapshotUrl of response.metadata) {
      const snapshotName = resourceName(snapshotUrl);
      if (snapshotName) {
        const details = await this.getSnapshot(name, snapshotName, project);
        snapshots.push(details);
      }
    }

    return {
      items: snapshots,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<LXDSnapshot> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/snapshots/${safePathSegment(snapshotName)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/snapshots/${safePathSegment(snapshotName)}`;
    const response = await this.client.get<LXDSnapshot>(path);
    return response.metadata;
  }

  async createSnapshot(instanceName: string, snapshotName: string, stateful: boolean = false, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/snapshots?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/snapshots`;
    await this.completeOperation(await this.client.post(path, {
      name: snapshotName,
      stateful,
    }), project);
  }

  async restoreSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}`;
    await this.completeOperation(await this.client.put(path, { restore: snapshotName }), project);
  }

  async deleteSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/snapshots/${safePathSegment(snapshotName)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/snapshots/${safePathSegment(snapshotName)}`;
    await this.completeOperation(await this.client.delete(path), project);
  }

  // Exec operations

  async exec(
    instanceName: string,
    command: string,
    options: { user?: number; group?: number; cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
    project?: string
  ): Promise<LXDExecResponse> {
    return executeRecordedCommand(this.client, instanceName, command, options, project);
  }

  async listExecOutputLogs(instanceName: string, project?: string): Promise<LXDExecOutputLogFile[]> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/logs/exec-output?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/logs/exec-output`;
    const response = await this.client.get<LXDExecOutputLogFiles>(path);
    return response.metadata.metadata;
  }

  async getExecOutputLog(instanceName: string, filename: string, project?: string): Promise<string> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/logs/exec-output/${safePathSegment(filename)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/logs/exec-output/${safePathSegment(filename)}`;
    const response = await this.client.getRaw(path);
    if (response instanceof Buffer) {
      return response.toString('base64');
    }
    if (typeof response === 'string') {
      return Buffer.from(response).toString('base64');
    }
    const uint8Array = response as Uint8Array;
    const buffer = Buffer.from(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    return buffer.toString('base64');
  }

  async deleteExecOutputLog(instanceName: string, filename: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/logs/exec-output/${safePathSegment(filename)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/logs/exec-output/${safePathSegment(filename)}`;
    await this.client.delete(path);
  }

  async pullFile(instanceName: string, path: string, project?: string): Promise<LXDFileContent> {
    const apiPath = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/files?path=${encodeURIComponent(path)}&project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/files?path=${encodeURIComponent(path)}`;
    
    const { buffer, headers } = await this.client.getFileRawWithHeaders(apiPath);
    
    const contentBase64 = buffer.toString('base64');
    
    const mode = headers['x-lxd-mode'] || '0644';
    const uid = headers['x-lxd-uid'] || '0';
    const gid = headers['x-lxd-gid'] || '0';
    
    return {
      content: contentBase64,
      mode,
      uid,
      gid,
    };
  }

  async listInstanceLogs(instanceName: string, project?: string): Promise<string[]> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/logs?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/logs`;
    const response = await this.client.get<string[]>(path);
    return response.metadata.map((url: string) => {
      return resourceName(url);
    });
  }

  async getInstanceLog(instanceName: string, logFile: string, project?: string, lines?: number): Promise<string> {
    let path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/logs/${safePathSegment(logFile)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/logs/${safePathSegment(logFile)}`;
    
    if (lines !== undefined && lines > 0) {
      path += path.includes('?') ? '&' : '?';
      path += `lines=${encodeURIComponent(lines.toString())}`;
    }
    
    const response = await this.client.getRaw(path);
    if (typeof response === 'string') {
      return response;
    }
    return response.toString('utf-8');
  }

  async pushFile(
    instanceName: string, 
    path: string, 
    content: string, 
    mode: string = '0644', 
    uid: string = '0', 
    gid: string = '0',
    project?: string
  ): Promise<void> {
    const apiPath = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}/files?path=${encodeURIComponent(path)}&project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}/files?path=${encodeURIComponent(path)}`;
    
    const contentBuffer = Buffer.from(content, 'base64');
    
    const headers: Record<string, string> = {
      'X-LXD-mode': parseInt(mode, 8).toString(),
      'X-LXD-uid': uid,
      'X-LXD-gid': gid,
    };
    
    await this.client.postFileRaw(apiPath, contentBuffer, headers);
  }

  // Image operations

  async listImages(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDImage>> {
    const params = new URLSearchParams();
    if (project) {
      params.set('project', project);
    }
    if (queryParams?.limit) {
      params.set('limit', queryParams.limit.toString());
    }
    if (queryParams?.offset) {
      params.set('offset', queryParams.offset.toString());
    }
    if (queryParams?.filter) {
      params.set('filter', queryParams.filter);
    }

    const queryString = params.toString();
    const path = queryString ? `/1.0/images?${queryString}` : '/1.0/images';

    const response = await this.client.get<string[]>(path);
    const images: LXDImage[] = [];
    for (const imageUrl of response.metadata) {
      const fingerprint = resourceName(imageUrl);
      if (fingerprint) {
        const details = await this.getImage(fingerprint, project);
        images.push(details);
      }
    }

    return {
      items: images,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getImage(fingerprint: string, project?: string): Promise<LXDImage> {
    const path = `/1.0/images/${safePathSegment(fingerprint)}` + (project ? `?project=${encodeURIComponent(project)}` : '');
    const response = await this.client.get<LXDImage>(path);
    return response.metadata;
  }

  async deleteImage(fingerprint: string, project?: string): Promise<void> {
    const path = `/1.0/images/${safePathSegment(fingerprint)}` + (project ? `?project=${encodeURIComponent(project)}` : '');
    await this.completeOperation(await this.client.delete(path), project);
  }

  // Alias operations

  async listAliases(queryParams?: LXDQueryParams, project?: string): Promise<LXDPaginatedResult<LXDAlias>> {
    const params = new URLSearchParams();
    if (project) params.set('project', project);
    if (queryParams?.limit) {
      params.set('limit', queryParams.limit.toString());
    }
    if (queryParams?.offset) {
      params.set('offset', queryParams.offset.toString());
    }

    const queryString = params.toString();
    const path = queryString ? `/1.0/images/aliases?${queryString}` : '/1.0/images/aliases';

    const response = await this.client.get<string[]>(path);
    const aliases: LXDAlias[] = [];
    for (const aliasUrl of response.metadata) {
      const name = resourceName(aliasUrl);
      if (name) {
        const details = await this.getAlias(name, project);
        aliases.push(details);
      }
    }

    return {
      items: aliases,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getAlias(name: string, project?: string): Promise<LXDAlias> {
    const path = `/1.0/images/aliases/${safePathSegment(name)}` + (project ? `?project=${encodeURIComponent(project)}` : '');
    const response = await this.client.get<LXDAlias>(path);
    return response.metadata;
  }

  async createAlias(name: string, description: string, target: string, project?: string): Promise<void> {
    const path = '/1.0/images/aliases' + (project ? `?project=${encodeURIComponent(project)}` : '');
    await this.completeOperation(await this.client.post(path, {
      name,
      description,
      target,
    }), project);
  }

  async deleteAlias(name: string, project?: string): Promise<void> {
    const path = `/1.0/images/aliases/${safePathSegment(name)}` + (project ? `?project=${encodeURIComponent(project)}` : '');
    await this.completeOperation(await this.client.delete(path), project);
  }

  // Server operations

  async getServerInfo(): Promise<LXDServerInfo> {
    const response = await this.client.get<LXDServerInfo>('/1.0');
    const cluster = await this.client.get<LXDClusterInfo>('/1.0/cluster');
    return { ...response.metadata, cluster: cluster.metadata.enabled ? cluster.metadata : undefined };
  }

  async getServerResources(): Promise<LXDServerResources> {
    const response = await this.client.get<LXDServerResources>('/1.0/resources');
    return response.metadata;
  }

  // Project operations

  async listProjects(queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDProject>> {
    const params = new URLSearchParams();
    if (queryParams?.limit) {
      params.set('limit', queryParams.limit.toString());
    }
    if (queryParams?.offset) {
      params.set('offset', queryParams.offset.toString());
    }
    if (queryParams?.filter) {
      params.set('filter', queryParams.filter);
    }

    const queryString = params.toString();
    const path = queryString ? `/1.0/projects?${queryString}` : '/1.0/projects';

    const response = await this.client.get<string[]>(path);
    const projects: LXDProject[] = [];
    for (const projectUrl of response.metadata) {
      const name = resourceName(projectUrl);
      if (name) {
        const details = await this.getProject(name);
        projects.push(details);
      }
    }

    return {
      items: projects,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getProject(name: string): Promise<LXDProject> {
    const path = `/1.0/projects/${safePathSegment(name)}`;
    const response = await this.client.get<LXDProject>(path);
    return response.metadata;
  }

  // Profile operations

  async listProfiles(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDProfile>> {
    const params = new URLSearchParams();
    if (project) {
      params.set('project', project);
    }
    if (queryParams?.limit) {
      params.set('limit', queryParams.limit.toString());
    }
    if (queryParams?.offset) {
      params.set('offset', queryParams.offset.toString());
    }
    if (queryParams?.filter) {
      params.set('filter', queryParams.filter);
    }

    const queryString = params.toString();
    const path = queryString ? `/1.0/profiles?${queryString}` : '/1.0/profiles';

    const response = await this.client.get<string[]>(path);
    const profiles: LXDProfile[] = [];
    for (const profileUrl of response.metadata) {
      const name = resourceName(profileUrl);
      if (name) {
        const details = await this.getProfile(name, project);
        profiles.push(details);
      }
    }

    return {
      items: profiles,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getProfile(name: string, project?: string): Promise<LXDProfile> {
    const path = project 
      ? `/1.0/profiles/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${safePathSegment(name)}`;
    const response = await this.client.get<LXDProfile>(path);
    return response.metadata;
  }

  async createProfile(name: string, description?: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles?project=${encodeURIComponent(project)}`
      : '/1.0/profiles';
    const profileData: Record<string, unknown> = {
      name,
    };
    if (description) {
      profileData.description = description;
    }
    await this.completeOperation(await this.client.post(path, profileData), project);
  }

  async patchProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${safePathSegment(name)}`;
    await this.completeOperation(await this.client.patch(path, updates), project);
  }

  async patchInstance(name: string, updates: {
    config?: Record<string, string>;
    description?: string;
    profiles?: string[];
  }, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(name)}`;
    await this.completeOperation(await this.client.patch(path, updates), project);
  }

  async updateProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${safePathSegment(name)}`;
    await this.completeOperation(await this.client.put(path, updates), project);
  }

  async deleteProfile(name: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles/${safePathSegment(name)}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${safePathSegment(name)}`;
    await this.completeOperation(await this.client.delete(path), project);
  }

  async addProfileToInstance(instanceName: string, profileName: string, project?: string): Promise<void> {
    const instance = await this.getInstance(instanceName, project);
    const profiles = [...instance.profiles, profileName];
    
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}`;
    await this.completeOperation(await this.client.patch(path, { profiles }), project);
  }

  async removeProfileFromInstance(instanceName: string, profileName: string, project?: string): Promise<void> {
    const instance = await this.getInstance(instanceName, project);
    const profiles = instance.profiles.filter(p => p !== profileName);
    
    const path = project 
      ? `/1.0/instances/${safePathSegment(instanceName)}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${safePathSegment(instanceName)}`;
    await this.completeOperation(await this.client.patch(path, { profiles }), project);
  }

  async getEvents(options: {
    types?: LXDEventType[];
    project?: string;
    timeoutMs?: number;
  } = {}): Promise<Array<LXDLifecycleEvent | LXDOperationEvent>> {
    return collectEvents(this.client.getSocketPath(), options) as Promise<Array<LXDLifecycleEvent | LXDOperationEvent>>;
  }
}
