/**
 * LXD MCP Client with project-based access control
 * 
 * This client provides a way to pre-configure allowed projects on the client side,
 * providing defense-in-depth - the client can further restrict access even if the server allows more.
 */

import { MCPProjectNotAllowedError, MCPProjectRequiredError } from '../lxd/errors.js';

export interface LXDMCPClientConfig {
  /** URL of the LXD MCP server */
  serverUrl: string;
  /** Optional: List of allowed projects. If not specified, uses LXD_PROJECTS env var. */
  projects?: string[];
  /** Optional: Request timeout in milliseconds */
  timeout?: number;
}

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Validates that a project is allowed
 * @throws MCPProjectNotAllowedError if project is not allowed
 * @throws MCPProjectRequiredError if project is required but not provided
 */
function validateProject(project: string | undefined, allowedProjects: string[]): string {
  // If no allowed projects are configured, allow all
  if (allowedProjects.length === 0) {
    return project || 'default';
  }

  // If allowed projects are configured, project is required
  if (!project) {
    throw new MCPProjectRequiredError(allowedProjects);
  }

  // Check if the project is in the allowed list
  if (!allowedProjects.includes(project)) {
    throw new MCPProjectNotAllowedError(project, allowedProjects);
  }

  return project;
}

/**
 * LXD MCP Client with project scoping support
 */
export class LXDMCPClient {
  private serverUrl: string;
  private allowedProjects: string[];
  private timeout: number;
  private requestId: number = 1;

  constructor(config: LXDMCPClientConfig) {
    this.serverUrl = config.serverUrl;
    this.timeout = config.timeout || 30000;

    // Use provided projects or fall back to environment variable
    if (config.projects && config.projects.length > 0) {
      this.allowedProjects = config.projects;
    } else {
      // Try to read from LXD_PROJECTS environment variable
      const envProjects = process.env.LXD_PROJECTS;
      this.allowedProjects = envProjects 
        ? envProjects.split(',').map(p => p.trim()).filter(p => p.length > 0)
        : [];
    }
  }

  /**
   * Check if the client is in scoped mode (project restriction enabled)
   */
  isScoped(): boolean {
    return this.allowedProjects.length > 0;
  }

  /**
   * Get the list of allowed projects
   */
  getAllowedProjects(): string[] {
    return [...this.allowedProjects];
  }

  /**
   * Make a request to the MCP server with project validation
   */
  async request<T = unknown>(
    method: string, 
    params?: Record<string, unknown>
  ): Promise<T> {
    // Extract project from params for validation
    let project = params?.project as string | undefined;
    
    // For single-project configuration, auto-inject the project BEFORE validation
    if (this.allowedProjects.length === 1 && project === undefined) {
      project = this.allowedProjects[0];
      params = { ...params, project };
    }

    // Validate project if client is scoped
    if (this.isScoped()) {
      validateProject(project, this.allowedProjects);
    }

    // For multi-project configuration, require explicit project specification
    // (already validated above)

    const response = await this.sendRequest<T>(method, params);
    return response;
  }

  /**
   * Send a raw request to the MCP server
   */
  private async sendRequest<T = unknown>(
    method: string, 
    params?: Record<string, unknown>
  ): Promise<T> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as MCPResponse;

      if (data.error) {
        throw new Error(`MCP error: ${data.error.message}`);
      }

      return data.result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  // Convenience methods for common operations

  /**
   * List instances with optional project filtering
   */
  async listInstances(project?: string): Promise<unknown> {
    return this.request('tools/list_instances', { project });
  }

  /**
   * Get an instance with optional project filtering
   */
  async getInstance(name: string, project?: string): Promise<unknown> {
    return this.request('tools/get_instance', { name, project });
  }

  /**
   * Start an instance with optional project filtering
   */
  async startInstance(name: string, project?: string): Promise<unknown> {
    return this.request('tools/start_instance', { name, project });
  }

  /**
   * Stop an instance with optional project filtering
   */
  async stopInstance(name: string, project?: string): Promise<unknown> {
    return this.request('tools/stop_instance', { name, project });
  }

  /**
   * Restart an instance with optional project filtering
   */
  async restartInstance(name: string, project?: string): Promise<unknown> {
    return this.request('tools/restart_instance', { name, project });
  }

  /**
   * Delete an instance with optional project filtering
   */
  async deleteInstance(name: string, project?: string, options?: { force?: boolean; autoStop?: boolean }): Promise<unknown> {
    return this.request('tools/delete_instance', { name, project, ...options });
  }

  /**
   * Create an instance with optional project filtering
   */
  async createInstance(params: {
    name: string;
    image: string;
    remote?: string;
    type?: 'container' | 'virtual-machine';
    project?: string;
    config?: Record<string, string>;
    start?: boolean;
  }): Promise<unknown> {
    return this.request('tools/create_instance', params);
  }

  /**
   * List snapshots with optional project filtering
   */
  async listSnapshots(name: string, project?: string): Promise<unknown> {
    return this.request('tools/list_snapshots', { name, project });
  }

  /**
   * Create a snapshot with optional project filtering
   */
  async createSnapshot(instanceName: string, snapshotName: string, project?: string, stateful?: boolean): Promise<unknown> {
    return this.request('tools/create_snapshot', { name: instanceName, snapshot_name: snapshotName, project, stateful });
  }

  /**
   * Restore a snapshot with optional project filtering
   */
  async restoreSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<unknown> {
    return this.request('tools/restore_snapshot', { name: instanceName, snapshot_name: snapshotName, project });
  }

  /**
   * List images with optional project filtering
   */
  async listImages(project?: string): Promise<unknown> {
    return this.request('tools/list_images', { project });
  }

  /**
   * Get server info
   */
  async getServerInfo(): Promise<unknown> {
    return this.request('tools/get_server_info');
  }

  /**
   * Get server resources
   */
  async getServerResources(): Promise<unknown> {
    return this.request('tools/get_server_resources');
  }
}
