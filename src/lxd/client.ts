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
import { sanitizeObject } from '../logging/sanitize.js';

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
    this.defaultTimeout = config.timeout;
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
      const url = new URL(path, 'http://localhost');
      const requestTimeout = timeout ? Math.min(timeout, 120000) : undefined; // Cap at 2 minutes
      
      // Log the request (sanitizing sensitive data)
      log.debug({
        method,
        path,
        // Sanitize the body before logging to prevent sensitive data exposure
        body: body ? sanitizeObject(body) : undefined,
        timeout: requestTimeout
      }, 'LXD API request');
      
      const options: http.RequestOptions = {
        socketPath: this.socketPath,
        method,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              // Extract error_code from LXD response if available
              const lxdError = parsed as LXDErrorResponse;
              const errorCode = lxdError.error_code || res.statusCode;
              const originalMessage = lxdError.error || JSON.stringify(parsed);
              
              // Create typed error based on HTTP status and error_code
              const error = createLXDTypedError(res.statusCode, errorCode, originalMessage);
              log.error({
                method,
                path,
                statusCode: res.statusCode,
                errorCode,
                message: originalMessage
              }, 'LXD API error response');
              reject(error);
            } else {
              log.debug({
                method,
                path,
                statusCode: res.statusCode,
                // Only log response metadata, not the full response body to avoid sensitive data
                metadata: parsed?.metadata ? sanitizeObject(parsed.metadata) : undefined
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
              rawResponse: data
            }, 'Failed to parse LXD response');
            reject(new MCPParseError(`Failed to parse LXD response: ${data}`, data));
          }
        });
      });

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
    const fullPath = path + queryString;
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

  /**
   * GET request that returns raw binary data (not JSON)
   * Used for fetching log file contents
   */
  async getRaw(path: string): Promise<Buffer | string> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, 'http://localhost');
      
      const options: http.RequestOptions = {
        socketPath: this.socketPath,
        method: 'GET',
        path: url.pathname + url.search,
        headers: {
          'Accept': 'application/octet-stream',
        },
      };

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new MCPConnectionError(`Failed to fetch raw data: HTTP ${res.statusCode}`));
          } else {
            const buffer = Buffer.concat(chunks);
            // Try to return as string first (for text content)
            const text = buffer.toString('utf-8');
            // If it looks like binary (contains null bytes), return buffer
            if (buffer.includes(Buffer.from([0]))) {
              resolve(buffer);
            } else {
              resolve(text);
            }
          }
        });
      });

      req.on('error', (e) => reject(new MCPConnectionError(`Failed to connect to LXD: ${e.message}`)));
      req.end();
    });
  }

/**
 * GET request for binary file content from LXD file API
 * Returns the raw buffer content
 */
async getFileRaw(path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost');
    
    const options: http.RequestOptions = {
      socketPath: this.socketPath,
      method: 'GET',
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/octet-stream',
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new MCPConnectionError(`Failed to fetch file: HTTP ${res.statusCode}`));
        } else {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        }
      });
    });

    req.on('error', (e) => reject(new MCPConnectionError(`Failed to connect to LXD: ${e.message}`)));
    req.end();
  });
}

/**
 * GET request for binary file content from LXD file API with headers
 * Returns both the raw buffer content and response headers
 */
async getFileRawWithHeaders(path: string): Promise<{ buffer: Buffer; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost');
    
    const options: http.RequestOptions = {
      socketPath: this.socketPath,
      method: 'GET',
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/octet-stream',
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new MCPConnectionError(`Failed to fetch file: HTTP ${res.statusCode}`));
        } else {
          const buffer = Buffer.concat(chunks);
          // Return buffer and headers
          resolve({
            buffer,
            headers: res.headers as Record<string, string>
          });
        }
      });
    });

    req.on('error', (e) => reject(new MCPConnectionError(`Failed to connect to LXD: ${e.message}`)));
    req.end();
  });
}

  /**
   * POST request for binary file content to LXD file API
   * Sends raw binary data
   */
  async postFileRaw(path: string, body: Buffer | string, headers: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, 'http://localhost');
      
      const options: http.RequestOptions = {
        socketPath: this.socketPath,
        method: 'POST',
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers,
        },
      };

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const errorBody = Buffer.concat(chunks).toString('utf-8');
            reject(new MCPConnectionError(`Failed to push file: HTTP ${res.statusCode} - ${errorBody}`));
          } else {
            resolve();
          }
        });
      });

      req.on('error', (e) => reject(new MCPConnectionError(`Failed to connect to LXD: ${e.message}`)));
      
      // Write the body content
      if (typeof body === 'string') {
        req.write(Buffer.from(body));
      } else {
        req.write(body);
      }
      req.end();
    });
  }
}
