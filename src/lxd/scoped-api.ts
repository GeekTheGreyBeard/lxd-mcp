/**
 * Scoped LXD API wrapper that enforces project-based access control
 */

import { LXDApi, LXDInstance, LXDInstanceState, LXDSnapshot, LXDImage, LXDServerInfo, LXDServerResources, LXDProject, LXDProfile, LXDAlias, LXDPaginatedResult, LXDExecResponse, LXDFileContent } from './api.js';
import type { LXDQueryParams } from './client.js';
import { MCPProjectNotAllowedError, MCPProjectRequiredError } from './errors.js';

/**
 * Interface defining the LXD API methods used by MCP tools.
 * Both LXDApi and ScopedLXDApi implement this interface.
 */
export interface LXDApiLike {
  // Instance operations
  listInstances(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDInstance>>;
  getInstance(name: string, project?: string): Promise<LXDInstance>;
  getInstanceState(name: string, project?: string): Promise<LXDInstanceState>;
  startInstance(name: string, project?: string): Promise<void>;
  stopInstance(name: string, project?: string): Promise<void>;
  restartInstance(name: string, project?: string): Promise<void>;
  deleteInstance(name: string, project?: string, options?: { force?: boolean; autoStop?: boolean }): Promise<void>;
  createInstanceFromRemote(params: {
    name: string;
    image: string;
    remote?: string;
    remoteName?: string;
    type?: 'container' | 'virtual-machine';
    project?: string;
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    start?: boolean;
  }): Promise<void>;

  // Snapshot operations
  listSnapshots(name: string, project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDSnapshot>>;
  getSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<LXDSnapshot>;
  createSnapshot(instanceName: string, snapshotName: string, stateful?: boolean, project?: string): Promise<void>;
  restoreSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void>;
  deleteSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void>;

  // Image operations
  listImages(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDImage>>;
  getImage(fingerprint: string): Promise<LXDImage>;
  deleteImage(fingerprint: string): Promise<void>;

  // Alias operations
  listAliases(queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDAlias>>;
  getAlias(name: string): Promise<LXDAlias>;
  createAlias(name: string, description: string, target: string): Promise<void>;
  deleteAlias(name: string): Promise<void>;

  // Profile operations
  listProfiles(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDProfile>>;
  getProfile(name: string, project?: string): Promise<LXDProfile>;
  createProfile(name: string, description?: string, project?: string): Promise<void>;
  patchProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void>;
  patchInstance(name: string, updates: {
    config?: Record<string, string>;
    description?: string;
    profiles?: string[];
  }, project?: string): Promise<void>;
  updateProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void>;
  deleteProfile(name: string, project?: string): Promise<void>;
  addProfileToInstance(instanceName: string, profileName: string, project?: string): Promise<void>;
  removeProfileFromInstance(instanceName: string, profileName: string, project?: string): Promise<void>;

  // Server operations
  getServerInfo(): Promise<LXDServerInfo>;
  getServerResources(): Promise<LXDServerResources>;

  // Project operations - getProject takes a name, not a project context parameter
  listProjects(queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDProject>>;
  getProject(name: string): Promise<LXDProject>;

  // Exec operations
  exec(instanceName: string, command: string, options?: {
    user?: number;
    group?: number;
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }, project?: string): Promise<LXDExecResponse>;

  // File operations
  pullFile(instanceName: string, path: string, project?: string): Promise<LXDFileContent>;
  pushFile(instanceName: string, path: string, content: string, mode?: string, uid?: string, gid?: string, project?: string): Promise<void>;

  // Log operations
  listInstanceLogs(instanceName: string, project?: string): Promise<string[]>;
  getInstanceLog(instanceName: string, logFile: string, project?: string, lines?: number): Promise<string>;

  // Event operations
  getEvents(options?: {
    types?: Array<'logging' | 'operation' | 'lifecycle'>;
    project?: string;
    timeoutMs?: number;
  }): Promise<Array<{
    type: string;
    timestamp: string;
    location?: string;
    metadata: unknown;
  }>>;
}

/**
 * Configuration for ScopedLXDApi
 */
export interface ScopedLXDApiConfig {
  /** The underlying LXD API to wrap */
  api: LXDApi;
  /** List of allowed projects. If empty, no restriction is applied. */
  allowedProjects: string[];
}

/**
 * Validates that a project is allowed
 * @throws MCPProjectNotAllowedError if project is not allowed
 * @throws MCPProjectRequiredError if project is required but not provided
 * @returns The validated project, or the original value (which may be undefined for passthrough)
 */
function validateProject(project: string | undefined, allowedProjects: string[]): string | undefined {
  // If no allowed projects are configured, allow all (passthrough)
  if (allowedProjects.length === 0) {
    return project; // Pass through as-is, let LXD use default
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
 * Wrapper around LXDApi that enforces project-based access control
 */
export class ScopedLXDApi implements LXDApiLike {
  private api: LXDApi;
  private allowedProjects: string[];

  constructor(config: ScopedLXDApiConfig) {
    this.api = config.api;
    this.allowedProjects = config.allowedProjects;
  }

  /**
   * Check if the server is in scoped mode (project restriction enabled)
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

  // Instance operations with project validation

  async listInstances(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDInstance>> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.listInstances(validatedProject, queryParams);
  }

  async getInstance(name: string, project?: string): Promise<LXDInstance> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.getInstance(name, validatedProject);
  }

  async getInstanceState(name: string, project?: string): Promise<LXDInstanceState> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.getInstanceState(name, validatedProject);
  }

  async startInstance(name: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.startInstance(name, validatedProject);
  }

  async stopInstance(name: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.stopInstance(name, validatedProject);
  }

  async restartInstance(name: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.restartInstance(name, validatedProject);
  }

  async deleteInstance(name: string, project?: string, options?: { force?: boolean; autoStop?: boolean }): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.deleteInstance(name, validatedProject, options);
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
    const validatedProject = validateProject(params.project, this.allowedProjects);
    return this.api.createInstanceFromRemote({ ...params, project: validatedProject });
  }

  // Snapshot operations with project validation

  async listSnapshots(name: string, project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDSnapshot>> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.listSnapshots(name, validatedProject, queryParams);
  }

  async getSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<LXDSnapshot> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.getSnapshot(instanceName, snapshotName, validatedProject);
  }

  async createSnapshot(instanceName: string, snapshotName: string, stateful?: boolean, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.createSnapshot(instanceName, snapshotName, stateful, validatedProject);
  }

  async restoreSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.restoreSnapshot(instanceName, snapshotName, validatedProject);
  }

  async deleteSnapshot(instanceName: string, snapshotName: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.deleteSnapshot(instanceName, snapshotName, validatedProject);
  }

  // Image operations with project validation

  async listImages(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDImage>> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.listImages(validatedProject, queryParams);
  }

  async getImage(fingerprint: string): Promise<LXDImage> {
    // Images can be accessed across projects, but we can restrict to allowed projects
    // For now, we'll keep this unrestricted as images are typically global
    return this.api.getImage(fingerprint);
  }

  async deleteImage(fingerprint: string): Promise<void> {
    return this.api.deleteImage(fingerprint);
  }

  async listAliases(queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDAlias>> {
    return this.api.listAliases(queryParams);
  }

  async getAlias(name: string): Promise<LXDAlias> {
    return this.api.getAlias(name);
  }

  async createAlias(name: string, description: string, target: string): Promise<void> {
    return this.api.createAlias(name, description, target);
  }

  async deleteAlias(name: string): Promise<void> {
    return this.api.deleteAlias(name);
  }

  // Profile operations with project validation

  async listProfiles(project?: string, queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDProfile>> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.listProfiles(validatedProject, queryParams);
  }

  async getProfile(name: string, project?: string): Promise<LXDProfile> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.getProfile(name, validatedProject);
  }

  async createProfile(name: string, description?: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.createProfile(name, description, validatedProject);
  }

  async patchProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.patchProfile(name, updates, validatedProject);
  }

  async patchInstance(name: string, updates: {
    config?: Record<string, string>;
    description?: string;
    profiles?: string[];
  }, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.patchInstance(name, updates, validatedProject);
  }

  async updateProfile(name: string, updates: {
    config?: Record<string, string>;
    devices?: Record<string, unknown>;
    description?: string;
  }, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.updateProfile(name, updates, validatedProject);
  }

  async deleteProfile(name: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.deleteProfile(name, validatedProject);
  }

  async addProfileToInstance(instanceName: string, profileName: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.addProfileToInstance(instanceName, profileName, validatedProject);
  }

  async removeProfileFromInstance(instanceName: string, profileName: string, project?: string): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.removeProfileFromInstance(instanceName, profileName, validatedProject);
  }

  // Server operations (not project-scoped)

  async getServerInfo(): Promise<LXDServerInfo> {
    return this.api.getServerInfo();
  }

  async getServerResources(): Promise<LXDServerResources> {
    return this.api.getServerResources();
  }

  // Project operations

  async listProjects(queryParams?: LXDQueryParams): Promise<LXDPaginatedResult<LXDProject>> {
    // If scoped, filter to only show allowed projects
    if (this.allowedProjects.length > 0) {
      const result = await this.api.listProjects(queryParams);
      return {
        ...result,
        items: result.items.filter(p => this.allowedProjects.includes(p.name)),
      };
    }
    return this.api.listProjects(queryParams);
  }

  async getProject(name: string): Promise<LXDProject> {
    // When getProject is called, 'name' is always a string (the project name to look up)
    // validateProject will either:
    // - Return the name as-is if not scoped (allowedProjects is empty)
    // - Throw if scoped and name is not in allowed list
    // The validated result is always a string when successful
    const validatedProject = validateProject(name, this.allowedProjects);
    if (validatedProject === undefined) {
      // This can only happen if not scoped, which shouldn't reach here with undefined
      throw new Error('Invalid project state');
    }
    return this.api.getProject(validatedProject);
  }

  // Exec operations with project validation

  async exec(
    instanceName: string,
    command: string,
    options?: {
      user?: number;
      group?: number;
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    },
    project?: string
  ): Promise<LXDExecResponse> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.exec(instanceName, command, options, validatedProject);
  }

  // File operations with project validation

  async pullFile(instanceName: string, path: string, project?: string) {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.pullFile(instanceName, path, validatedProject);
  }

  async pushFile(
    instanceName: string,
    path: string,
    content: string,
    mode?: string,
    uid?: string,
    gid?: string,
    project?: string
  ): Promise<void> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.pushFile(instanceName, path, content, mode, uid, gid, validatedProject);
  }

  // Log operations with project validation

  async listInstanceLogs(instanceName: string, project?: string): Promise<string[]> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.listInstanceLogs(instanceName, validatedProject);
  }

  async getInstanceLog(instanceName: string, logFile: string, project?: string, lines?: number): Promise<string> {
    const validatedProject = validateProject(project, this.allowedProjects);
    return this.api.getInstanceLog(instanceName, logFile, validatedProject, lines);
  }

  // Event operations with project validation

  async getEvents(options?: {
    types?: Array<'logging' | 'operation' | 'lifecycle'>;
    project?: string;
    timeoutMs?: number;
  }) {
    const validatedProject = options?.project ? validateProject(options.project, this.allowedProjects) : undefined;
    return this.api.getEvents({ ...options, project: validatedProject });
  }
}
