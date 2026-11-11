/**
 * LXD HTTP client for connecting via Unix socket
 */

import http from 'http';
import { URL } from 'url';
import {
  LXDError,
  LXDNotFoundError,
  LXDAuthError,
  LXDPermissionError,
  LXDConflictError,
  LXDNotImplementedError,
  LXDServerError,
  MCPConnectionError,
  MCPParseError,
} from './errors.js';
import { createLogger } from '../logging/index.js';


const log = createLogger('lxd-client');

export interface LXDClientConfig {
  socketPath: string;
  timeout?: number; // Default timeout in ms
}

/**
 * Query parameters for paginated and filtered LXD API requests
 */
export interface LXDQueryParams {
  /** Maximum number of items to return (default: 100, max: 500) */
  limit?: number;
  /** Number of items to skip (default: 0) */
  offset?: number;
  /** OData filter expression (e.g., 'status eq "Running"') */
  filter?: string;
  /** Recursion depth for nested resources */
  recursion?: number;
}

/**
 * Build a query string from LXD query parameters
 * Handles limit, offset, filter, and recursion parameters
 */
export function buildQueryString(params?: LXDQueryParams): string {
  if (!params) {
    return '';
  }

  const queryParts: string[] = [];

  if (params.limit !== undefined && params.limit > 0) {
    // Enforce max limit of 500
    const effectiveLimit = Math.min(params.limit, 500);
    queryParts.push(`limit=${encodeURIComponent(effectiveLimit)}`);
  }

  if (params.offset !== undefined && params.offset > 0) {
    queryParts.push(`offset=${encodeURIComponent(params.offset)}`);
  }

  if (params.filter) {
    queryParts.push(`filter=${encodeURIComponent(params.filter)}`);
  }

  if (params.recursion !== undefined && params.recursion >= 0) {
    queryParts.push(`recursion=${encodeURIComponent(params.recursion)}`);
  }

  return queryParts.length > 0 ? '?' + queryParts.join('&') : '';
}

export interface LXDResponse<T = unknown> {
  type: string;
  status: string;
  status_code: number;
  metadata: T;
}

export interface LXDErrorResponse {
  type: string;
  error: string;
  error_code: number;
}

/**
 * Pagination metadata from LXD response headers
 */
export interface LXDPaginationMetadata {
  /** Total number of items available */
  total: number;
  /** Total items without filter applied */
  totalUnfiltered: number;
  /** Items remaining after current page */
  itemsRemaining: number;
}

/**
 * Extended LXD response with pagination metadata
 */
export interface LXDPaginatedResponse<T = unknown> extends LXDResponse<T> {
  pagination?: LXDPaginationMetadata;
}

/**
 * Create a typed LXD error based on HTTP status and error_code
 */
function createLXDTypedError(httpStatus: number, errorCode: number, originalMessage: string): LXDError {
  // Provide user-friendly messages based on error type
  switch (errorCode) {
    case 401:
      return new LXDAuthError('Authentication failed. Please check your credentials.', errorCode, originalMessage);
    case 403:
      return new LXDPermissionError('Permission denied. You do not have access to this resource.', errorCode, originalMessage);
    case 404:
      return new LXDNotFoundError('The requested resource was not found.', errorCode, originalMessage);
    case 409:
      return new LXDConflictError('Conflict: The resource is in an invalid state for this operation.', errorCode, originalMessage);
    case 501:
      return new LXDNotImplementedError('This operation is not supported by the LXD server.', errorCode, originalMessage);
    default:
      if (httpStatus >= 500) {
        return new LXDServerError(`LXD server error: ${originalMessage}`, errorCode, originalMessage);
      }
      if (httpStatus >= 400) {
        return new LXDError(`LXD API error: ${originalMessage}`, errorCode, originalMessage);
      }
      return new LXDError(originalMessage, errorCode, originalMessage);
  }
}

export class LXDClient {
  private socketPath: string;
  private defaultTimeout?: number;

  constructor(config: LXDClientConfig) {
    this.socketPath = config.socketPath;
    this.defaultTimeout = config.timeout ?? 30000;
  }

  getSocketPath(): string { return this.socketPath; }

  private requestPath(path: string): string {
    if (!path.startsWith('/1.0') || path.startsWith('//') || path.includes('#')) throw new Error('Invalid LXD API path');
    const url = new URL(path, 'http://localhost');
    if (url.origin !== 'http://localhost' || !/^\/1\.0(?:\/|$)/.test(url.pathname)) throw new Error('Invalid LXD API path');
    if (url.searchParams.getAll('project').length > 1) throw new Error('Duplicate project parameter');
    return url.pathname + url.search;
  }

  /**
   * Make a request to the LXD API via Unix socket
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options?: { timeout?: number }
  ): Promise<LXDResponse<T>> {
    const timeout = options?.timeout ?? this.defaultTimeout;
    
    return new Promise((resolve, reject) => {
      const requestPath = this.requestPath(path);
      const requestTimeout = Math.min(Math.max(timeout ?? 30000, 1), 130000); // Cap at 2 minutes
      
      // Log the request (sanitizing sensitive data)
      log.debug({
        method,
        path,
        // Sanitize the body before logging to prevent sensitive data exposure
        // Do not log payloads: commands and environment/config values may be secrets.
        timeout: requestTimeout
      }, 'LXD API request');
      
      const options: http.RequestOptions = {
        socketPath: this.socketPath,
        method,
        path: requestPath,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        let bytes = 0;
        res.on('data', (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes > 16 * 1024 * 1024) { req.destroy(); reject(new MCPConnectionError('LXD response exceeds 16 MiB limit')); return; } data += chunk; });
        res.on('aborted', () => reject(new MCPConnectionError('LXD response aborted')));
        res.on('error', (e) => reject(new MCPConnectionError(e.message)));
        res.on('end', () => {
          clearTimeout(deadline);
          try {
            const parsed = JSON.parse(data);
            if ((res.statusCode && res.statusCode >= 400) || parsed.type === 'error') {
              // Extract error_code from LXD response if available
              const lxdError = parsed as LXDErrorResponse;
              const errorCode = lxdError.error_code || res.statusCode || 500;
              const originalMessage = lxdError.error || JSON.stringify(parsed);
              
              // Create typed error based on HTTP status and error_code
              const error = createLXDTypedError(res.statusCode || 500, errorCode, originalMessage);
              log.error({
                method,
                path,
                statusCode: res.statusCode,
                errorCode,
                // Server error details may contain secrets; omit from logs.
              }, 'LXD API error response');
              reject(error);
            } else {
              log.debug({
                method,
                path,
                statusCode: res.statusCode,
                // Only log response metadata, not the full response body to avoid sensitive data
                // Do not log response metadata (guest output, config, and credentials).
              }, 'LXD API success response');

              // Extract pagination headers if present
              const response = parsed as LXDPaginatedResponse<T>;
              const paginationHeaders = res.headers;

              if (paginationHeaders['x-lxd-total'] || paginationHeaders['x-lxd-items-remaining']) {
                response.pagination = {
                  total: parseInt(paginationHeaders['x-lxd-total'] as string, 10) || 0,
                  totalUnfiltered: parseInt(paginationHeaders['x-lxd-total-unfiltered'] as string, 10) || 0,
                  itemsRemaining: parseInt(paginationHeaders['x-lxd-items-remaining'] as string, 10) || 0,
                };
              }

              resolve(response);
            }
          } catch (e) {
            log.error({
              method,
              path,
              error: e instanceof Error ? e.message : String(e),
              // Response body deliberately omitted from diagnostics.
            }, 'Failed to parse LXD response');
            reject(new MCPParseError("Failed to parse LXD response", "[redacted]"));
          }
        });
      });

      const deadline = setTimeout(() => {
        req.destroy();
        reject(new MCPConnectionError(`Request timed out after ${requestTimeout}ms; outcome may be unknown`));
      }, requestTimeout);
      deadline.unref();
      req.on('close', () => clearTimeout(deadline));
      // Set up timeout
      if (requestTimeout) {
        req.setTimeout(requestTimeout, () => {
          req.destroy();
          reject(new MCPConnectionError(`Request timed out after ${requestTimeout}ms`));
        });
      }

      req.on('error', (e) => {
log.error({
              method,
              path,
              error: e.message
            }, 'LXD connection error');
        reject(new MCPConnectionError(`Failed to connect to LXD: ${e.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * GET request
   * @param path - API path (without query string)
   * @param queryParams - Optional query parameters for pagination/filtering
   * @param options - Request options (timeout)
   */
  async get<T = unknown>(
    path: string,
    queryParams?: LXDQueryParams,
    options?: { timeout?: number }
  ): Promise<LXDResponse<T>> {
    const queryString = buildQueryString(queryParams);
    const fullPath = queryString ? path + (path.includes('?') ? '&' + queryString.slice(1) : queryString) : path;
    return this.request<T>('GET', fullPath, undefined, options);
  }

  /**
   * POST request
   */
  async post<T = unknown>(path: string, body?: unknown, options?: { timeout?: number }): Promise<LXDResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * PUT request
   */
  async put<T = unknown>(path: string, body?: unknown): Promise<LXDResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(path: string, body?: unknown): Promise<LXDResponse<T>> {
    return this.request<T>('PATCH', path, body);
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(path: string): Promise<LXDResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  private async rawRequest(method: string, path: string, body?: Buffer | string,
    headers: Record<string, string> = {}, options?: { timeout?: number; maxBytes?: number }): Promise<{ buffer: Buffer; headers: Record<string, string> }> {
    const requestPath = this.requestPath(path);
    const timeout = Math.min(Math.max(options?.timeout ?? this.defaultTimeout ?? 30000, 1), 130000);
    const maxBytes = options?.maxBytes ?? 500 * 1024;
    if (body !== undefined && Buffer.byteLength(body) > maxBytes) throw new Error('File exceeds maximum size limit of 500KB');
    return new Promise((resolve, reject) => {
      const req = http.request({ socketPath: this.socketPath, method, path: requestPath,
        headers: { Accept: 'application/octet-stream', ...headers } }, res => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > maxBytes) { req.destroy(); reject(new MCPConnectionError('LXD raw response exceeds configured size limit')); return; }
          chunks.push(Buffer.from(chunk));
        });
        res.on('aborted', () => reject(new MCPConnectionError('LXD response aborted')));
        res.on('error', err => reject(new MCPConnectionError(err.message)));
        res.on('end', () => {
          clearTimeout(deadline);
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new MCPConnectionError(`LXD raw request failed: HTTP ${res.statusCode}`));
          } else resolve({ buffer: Buffer.concat(chunks), headers: res.headers as Record<string, string> });
        });
      });
      const deadline = setTimeout(() => { req.destroy(); reject(new MCPConnectionError(`Request timed out after ${timeout}ms; outcome may be unknown`)); }, timeout);
      deadline.unref();
      req.on('close', () => clearTimeout(deadline));
      req.on('error', err => { clearTimeout(deadline); reject(new MCPConnectionError(`Failed to connect to LXD: ${err.message}`)); });
      if (body !== undefined) req.write(body);
      req.end();
    });
  }

  async getRaw(path: string, options?: { timeout?: number }): Promise<Buffer | string> {
    return (await this.rawRequest('GET', path, undefined, {}, options)).buffer;
  }

  async getFileRaw(path: string): Promise<Buffer> {
    return (await this.rawRequest('GET', path)).buffer;
  }

  async getFileRawWithHeaders(path: string): Promise<{ buffer: Buffer; headers: Record<string, string> }> {
    return this.rawRequest('GET', path);
  }

  async postFileRaw(path: string, body: Buffer | string, headers: Record<string, string> = {}): Promise<void> {
    await this.rawRequest('POST', path, body, { 'Content-Type': 'application/octet-stream', ...headers });
  }
}
