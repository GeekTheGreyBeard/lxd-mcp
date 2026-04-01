/**
 * LXD API wrapper for common operations
 */

import http from 'http';
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

export interface LXDExecResponse {
  exit_code: number;
  stdout: string;  // Base64 encoded
  stderr: string; // Base64 encoded
}

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
      const name = instanceUrl.split('/').pop();
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
      ? `/1.0/instances/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}`;
    const response = await this.client.get<LXDInstance>(path);
    return response.metadata;
  }

  async getInstanceState(name: string, project?: string): Promise<LXDInstanceState> {
    const path = project 
      ? `/1.0/instances/${name}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}/state`;
    const response = await this.client.get<LXDInstanceState>(path);
    return response.metadata;
  }

  async startInstance(name: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${name}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}/state`;
    await this.client.put(path, { action: 'start', force: true });
  }

  async stopInstance(name: string, project?: string): Promise<void> {
    const state = await this.getInstanceState(name, project);
    if (state.status === 'Stopped') {
      return;
    }

    const path = project 
      ? `/1.0/instances/${name}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}/state`;
    await this.client.put(path, { action: 'stop', force: true });
    
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
      ? `/1.0/instances/${name}/state?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}/state`;
    await this.client.put(path, { action: 'restart', force: true });
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
        // Proceed with deletion even if state check fails. This can happen if:
        // - The instance is already stopped/stopped but in an unexpected state
        // - There's a temporary API error
        // - The instance no longer exists but we want to ensure cleanup
        // The delete operation itself will succeed if the instance exists, or fail gracefully if it doesn't.
        log.warn({ name, error: error instanceof Error ? error.message : String(error) }, 'Instance state check failed, proceeding with delete attempt');
      }
    }
    
    let path = project 
      ? `/1.0/instances/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}`;
    
    if (force) {
      path += path.includes('?') ? '&force=true' : '?force=true';
    }
    
    log.info({ path, force, autoStop }, 'DELETE request path and parameters');
    
    try {
      await this.client.delete(path);
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

    const response = await this.client.post(path, instanceData);

    if (response.type === 'async') {
      const operationId = (response.metadata as { id: string }).id;
      if (operationId) {
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const op = await this.client.get<Record<string, unknown>>(`/1.0/operations/${operationId}`);
            const opData = op.metadata as Record<string, unknown>;
            const status = (opData.status as string) || '';
            const statusCode = (opData.status_code as number) || 0;

            if (status === 'Success') {
              break;
            }

            if (status === 'Failure' || statusCode >= 400) {
              const err = (opData.err as string) || 'Unknown error';
              throw new Error(`Instance creation failed: ${err}`);
            }
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('Instance creation failed:')) {
              throw e;
            }
          }
        }
      }
    }
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
      ? `/1.0/instances/${name}/snapshots?${queryString}`
      : `/1.0/instances/${name}/snapshots`;

    const response = await this.client.get<string[]>(path);
    const snapshots: LXDSnapshot[] = [];
    for (const snapshotUrl of response.metadata) {
      const snapshotName = snapshotUrl.split('/').pop();
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
      ? `/1.0/instances/${instanceName}/snapshots/${snapshotName}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/snapshots/${snapshotName}`;
    const response = await this.client.get<LXDSnapshot>(path);
    return response.metadata;
  }

  async createSnapshot(instanceName: string, snapshotName: string, stateful: boolean = false, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${instanceName}/snapshots?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/snapshots`;
    await this.client.post(path, {
      name: snapshotName,
      stateful,
    });
  }

  async restoreSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${instanceName}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}`;
    await this.client.put(path, { restore: snapshotName });
  }

  async deleteSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${instanceName}/snapshots/${snapshotName}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/snapshots/${snapshotName}`;
    await this.client.delete(path);
  }

  // Exec operations

  async exec(
    instanceName: string,
    command: string,
    options: {
      user?: number;
      group?: number;
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    } = {},
    project?: string
  ): Promise<LXDExecResponse> {
    const environment: Record<string, string> = {
      'HOME': '/root',
      'USER': 'root',
      ...options.env,
    };

    const execRequest: LXDExecRequest = {
      command: ['/bin/sh', '-c', command],
      environment,
      'interactive': false,
      'record-output': true,
    };

    if (options.user !== undefined) {
      execRequest.user = options.user;
    }
    if (options.group !== undefined) {
      execRequest.group = options.group;
    }
    if (options.cwd) {
      execRequest.cwd = options.cwd;
    }

    const path = project 
      ? `/1.0/instances/${instanceName}/exec?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/exec`;

    // Validate and clamp timeout to prevent resource exhaustion from extreme values
    // Bounds: 1 second minimum (prevents accidental micro-timeouts), 120 seconds maximum (matches LXD client default)
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 30000, 1000), 120000);

    try {
      const response = await this.client.post<any>(path, execRequest, { timeout: timeoutMs });
      
      if (response.type === 'async' && response.metadata?.id) {
        const operationId = response.metadata.id;
        
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const opResponse = await this.client.get<any>(`/1.0/operations/${operationId}`);
          const opData = opResponse.metadata;
          
          const isDone = opData?.status_code === 200 || opData?.status_code === 400 || 
                         opData?.status === 'Success' || opData?.status === 'Failure';
          
          if (isDone) {
            if (opData?.status === 'Failure' || opData?.status_code === 400) {
              throw new Error(`Command execution failed: ${opData?.err || 'Unknown error'}`);
            }
            
            const exitCode = opData?.metadata?.metadata?.exit_code ?? 0;
            
            let stdout = '';
            let stderr = '';
            
            try {
              const outputMap = opData?.metadata?.metadata?.output as Record<string, string> | undefined;
              
              let stdoutFilename: string | undefined;
              let stderrFilename: string | undefined;
              
              if (outputMap) {
                const stdoutPath = outputMap['1'];
                const stderrPath = outputMap['2'];
                
                if (stdoutPath) {
                  stdoutFilename = stdoutPath.split('/').pop();
                }
                if (stderrPath) {
                  stderrFilename = stderrPath.split('/').pop();
                }
              }
              
              if (!stdoutFilename && !stderrFilename) {
                const logFiles = await this.listExecOutputLogs(instanceName, project);
                const stdoutFile = logFiles.find(f => f.name.endsWith('.stdout'));
                const stderrFile = logFiles.find(f => f.name.endsWith('.stderr'));
                stdoutFilename = stdoutFile?.name;
                stderrFilename = stderrFile?.name;
              }
              
              if (stdoutFilename) {
                try {
                  const stdoutBase64 = await this.getExecOutputLog(instanceName, stdoutFilename, project);
                  stdout = Buffer.from(stdoutBase64, 'base64').toString('utf-8');
                } catch {
                  stdout = '';
                }
              }
              
              if (stderrFilename) {
                try {
                  const stderrBase64 = await this.getExecOutputLog(instanceName, stderrFilename, project);
                  stderr = Buffer.from(stderrBase64, 'base64').toString('utf-8');
                } catch {
                  stderr = '';
                }
              }
              
              try {
                if (stdoutFilename) {
                  await this.deleteExecOutputLog(instanceName, stdoutFilename, project);
                }
              } catch {
              }
              try {
                if (stderrFilename) {
                  await this.deleteExecOutputLog(instanceName, stderrFilename, project);
                }
              } catch {
              }
            } catch (listError) {
              stdout = '';
              stderr = '';
            }
            
            return {
              exit_code: exitCode,
              stdout,
              stderr,
            };
          }
        }
        
        return {
          exit_code: 137,
          stdout: '',
          stderr: `Command timed out after ${timeoutMs}ms\n`,
        };
      }
      
      let stdout = '';
      let stderr = '';
      const exitCode = response.metadata?.metadata?.exit_code ?? 0;
      
      try {
        const outputMap = response.metadata?.metadata?.output as Record<string, string> | undefined;
        
        let stdoutFilename: string | undefined;
        let stderrFilename: string | undefined;
        
        if (outputMap) {
          const stdoutPath = outputMap['1'];
          const stderrPath = outputMap['2'];
          
          if (stdoutPath) {
            stdoutFilename = stdoutPath.split('/').pop();
          }
          if (stderrPath) {
            stderrFilename = stderrPath.split('/').pop();
          }
        }
        
        if (!stdoutFilename && !stderrFilename) {
          const logFiles = await this.listExecOutputLogs(instanceName, project);
          const stdoutFile = logFiles.find(f => f.name.endsWith('.stdout'));
          const stderrFile = logFiles.find(f => f.name.endsWith('.stderr'));
          stdoutFilename = stdoutFile?.name;
          stderrFilename = stderrFile?.name;
        }
        
        if (stdoutFilename) {
          try {
            const stdoutBase64 = await this.getExecOutputLog(instanceName, stdoutFilename, project);
            stdout = Buffer.from(stdoutBase64, 'base64').toString('utf-8');
          } catch {
            stdout = '';
          }
        }
        
        if (stderrFilename) {
          try {
            const stderrBase64 = await this.getExecOutputLog(instanceName, stderrFilename, project);
            stderr = Buffer.from(stderrBase64, 'base64').toString('utf-8');
          } catch {
            stderr = '';
          }
        }
        
        try {
          if (stdoutFilename) {
            await this.deleteExecOutputLog(instanceName, stdoutFilename, project);
          }
        } catch {
        }
        try {
          if (stderrFilename) {
            await this.deleteExecOutputLog(instanceName, stderrFilename, project);
          }
        } catch {
        }
      } catch {
        stdout = response.metadata?.stdout ? Buffer.from(response.metadata.stdout, 'base64').toString('utf-8') : '';
        stderr = response.metadata?.stderr ? Buffer.from(response.metadata.stderr, 'base64').toString('utf-8') : '';
      }
      
      return {
        exit_code: exitCode,
        stdout,
        stderr,
      };
    } catch (error) {
      if (error instanceof MCPConnectionError && error.message.includes('timed out')) {
        return {
          exit_code: 137,
          stdout: '',
          stderr: `Command timed out after ${timeoutMs}ms\n`,
        };
      }
      throw error;
    }
  }

  async listExecOutputLogs(instanceName: string, project?: string): Promise<LXDExecOutputLogFile[]> {
    const path = project 
      ? `/1.0/instances/${instanceName}/logs/exec-output?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/logs/exec-output`;
    const response = await this.client.get<LXDExecOutputLogFiles>(path);
    return response.metadata.metadata;
  }

  async getExecOutputLog(instanceName: string, filename: string, project?: string): Promise<string> {
    const path = project 
      ? `/1.0/instances/${instanceName}/logs/exec-output/${filename}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/logs/exec-output/${filename}`;
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
      ? `/1.0/instances/${instanceName}/logs/exec-output/${filename}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/logs/exec-output/${filename}`;
    await this.client.delete(path);
  }

  async pullFile(instanceName: string, path: string, project?: string): Promise<LXDFileContent> {
    const apiPath = project 
      ? `/1.0/instances/${instanceName}/files?path=${encodeURIComponent(path)}&project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/files?path=${encodeURIComponent(path)}`;
    
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
      ? `/1.0/instances/${instanceName}/logs?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/logs`;
    const response = await this.client.get<string[]>(path);
    return response.metadata.map((url: string) => {
      const parts = url.split('/');
      return parts[parts.length - 1];
    });
  }

  async getInstanceLog(instanceName: string, logFile: string, project?: string, lines?: number): Promise<string> {
    let path = project 
      ? `/1.0/instances/${instanceName}/logs/${logFile}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/logs/${logFile}`;
    
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
      ? `/1.0/instances/${instanceName}/files?path=${encodeURIComponent(path)}&project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}/files?path=${encodeURIComponent(path)}`;
    
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
      const fingerprint = imageUrl.split('/').pop();
      if (fingerprint) {
        const details = await this.getImage(fingerprint);
        images.push(details);
      }
    }

    return {
      items: images,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getImage(fingerprint: string): Promise<LXDImage> {
    const path = `/1.0/images/${fingerprint}`;
    const response = await this.client.get<LXDImage>(path);
    return response.metadata;
  }

  async deleteImage(fingerprint: string): Promise<void> {
    const path = `/1.0/images/${fingerprint}`;
    await this.client.delete(path);
  }

  // Alias operations

  async listAliases(queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDAlias>> {
    const params = new URLSearchParams();
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
      const name = aliasUrl.split('/').pop();
      if (name) {
        const details = await this.getAlias(name);
        aliases.push(details);
      }
    }

    return {
      items: aliases,
      pagination: (response as LXDPaginatedResponse).pagination,
    };
  }

  async getAlias(name: string): Promise<LXDAlias> {
    const path = `/1.0/images/aliases/${name}`;
    const response = await this.client.get<LXDAlias>(path);
    return response.metadata;
  }

  async createAlias(name: string, description: string, target: string): Promise<void> {
    const path = '/1.0/images/aliases';
    await this.client.post(path, {
      name,
      description,
      target,
    });
  }

  async deleteAlias(name: string): Promise<void> {
    const path = `/1.0/images/aliases/${name}`;
    await this.client.delete(path);
  }

  // Server operations

  async getServerInfo(): Promise<LXDServerInfo> {
    const response = await this.client.get<LXDServerInfo>('/1.0');
    return response.metadata;
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
      const name = projectUrl.split('/').pop();
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
    const path = `/1.0/projects/${name}`;
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
      const name = profileUrl.split('/').pop();
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
      ? `/1.0/profiles/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${name}`;
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
    await this.client.post(path, profileData);
  }

  async patchProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${name}`;
    await this.client.patch(path, updates);
  }

  async patchInstance(name: string, updates: {
    config?: Record<string, string>;
    description?: string;
    profiles?: string[];
  }, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/instances/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${name}`;
    await this.client.patch(path, updates);
  }

  async updateProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${name}`;
    await this.client.put(path, updates);
  }

  async deleteProfile(name: string, project?: string): Promise<void> {
    const path = project 
      ? `/1.0/profiles/${name}?project=${encodeURIComponent(project)}`
      : `/1.0/profiles/${name}`;
    await this.client.delete(path);
  }

  async addProfileToInstance(instanceName: string, profileName: string, project?: string): Promise<void> {
    const instance = await this.getInstance(instanceName, project);
    const profiles = [...instance.profiles, profileName];
    
    const path = project 
      ? `/1.0/instances/${instanceName}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}`;
    await this.client.patch(path, { profiles });
  }

  async removeProfileFromInstance(instanceName: string, profileName: string, project?: string): Promise<void> {
    const instance = await this.getInstance(instanceName, project);
    const profiles = instance.profiles.filter(p => p !== profileName);
    
    const path = project 
      ? `/1.0/instances/${instanceName}?project=${encodeURIComponent(project)}`
      : `/1.0/instances/${instanceName}`;
    await this.client.patch(path, { profiles });
  }

  async getEvents(options: {
    types?: LXDEventType[];
    project?: string;
    timeoutMs?: number;
  } = {}): Promise<Array<LXDLifecycleEvent | LXDOperationEvent>> {
    const types = options.types ?? ['lifecycle', 'operation'];
    const project = options.project;
    const timeoutMs = options.timeoutMs ?? 5000;

    const typeParams = types.map(t => `type=${t}`).join('&');
    const projectParam = project ? `&project=${encodeURIComponent(project)}` : '';
    const queryString = `?${typeParams}${projectParam}`;

    return new Promise((resolve, reject) => {
      const events: Array<LXDLifecycleEvent | LXDOperationEvent> = [];
      
      const socketPath = (this.client as any).socketPath;
      
      const url = new URL('/1.0/events' + queryString, 'http://localhost');
      
      const requestOptions: http.RequestOptions = {
        socketPath: socketPath,
        method: 'GET',
        path: url.pathname + url.search,
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': generateWebSocketKey(),
        },
      };

      const req = http.request(requestOptions, (res) => {
        const upgrade = res.headers.upgrade;
        if (upgrade !== 'websocket') {
          reject(new Error('WebSocket upgrade failed'));
          return;
        }

        const socket = (res as any).socket;
        
        const timeout = setTimeout(() => {
          socket.end();
        }, timeoutMs);

        let buffer = Buffer.alloc(0);

        socket.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
          
          const content = buffer.toString('utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              events.push(event);
            } catch {
            }
          }
          buffer = Buffer.alloc(0);
        });

        socket.on('close', () => {
          clearTimeout(timeout);
          resolve(events);
        });

        socket.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }
}

function generateWebSocketKey(): string {
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes.toString('base64');
}