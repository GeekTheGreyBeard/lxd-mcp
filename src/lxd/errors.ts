/**
 * LXD-specific error classes for typed error handling
 */

/**
 * Base error class for all LXD API errors
 */
export class LXDError extends Error {
  public readonly errorCode: number;
  public readonly originalMessage: string;

  constructor(message: string, errorCode: number, originalMessage?: string) {
    super(message);
    this.name = 'LXDError';
    this.errorCode = errorCode;
    this.originalMessage = originalMessage || message;
    
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LXDError);
    }
  }
}

/**
 * Error thrown when a requested resource is not found (404)
 */
export class LXDNotFoundError extends LXDError {
  constructor(message: string, errorCode: number = 404, originalMessage?: string) {
    super(message, errorCode, originalMessage);
    this.name = 'LXDNotFoundError';
  }
}

/**
 * Error thrown when authentication fails (401, 403)
 */
export class LXDAuthError extends LXDError {
  constructor(message: string, errorCode: number = 401, originalMessage?: string) {
    super(message, errorCode, originalMessage);
    this.name = 'LXDAuthError';
  }
}

/**
 * Error thrown when permission is denied (403)
 */
export class LXDPermissionError extends LXDError {
  constructor(message: string, errorCode: number = 403, originalMessage?: string) {
    super(message, errorCode, originalMessage);
    this.name = 'LXDPermissionError';
  }
}

/**
 * Error thrown when there's a conflict (409)
 */
export class LXDConflictError extends LXDError {
  constructor(message: string, errorCode: number = 409, originalMessage?: string) {
    super(message, errorCode, originalMessage);
    this.name = 'LXDConflictError';
  }
}

/**
 * Error thrown when operation is not implemented (501)
 */
export class LXDNotImplementedError extends LXDError {
  constructor(message: string, errorCode: number = 501, originalMessage?: string) {
    super(message, errorCode, originalMessage);
    this.name = 'LXDNotImplementedError';
  }
}

/**
 * Error thrown when LXD server returns an error (5xx)
 */
export class LXDServerError extends LXDError {
  constructor(message: string, errorCode: number = 500, originalMessage?: string) {
    super(message, errorCode, originalMessage);
    this.name = 'LXDServerError';
  }
}

// MCP-specific errors

/**
 * Error thrown when connection to LXD fails
 */
export class MCPConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPConnectionError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPConnectionError);
    }
  }
}

/**
 * Error thrown when parsing LXD response fails
 */
export class MCPParseError extends Error {
  constructor(message: string, public readonly rawData?: string) {
    super(message);
    this.name = 'MCPParseError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPParseError);
    }
  }
}

// Project namespace errors

/**
 * Error thrown when accessing a project that is not allowed
 */
export class MCPProjectNotAllowedError extends Error {
  public readonly requestedProject: string;
  public readonly allowedProjects: string[];

  constructor(requestedProject: string, allowedProjects: string[]) {
    const message = `Project "${requestedProject}" is not allowed. Allowed projects: ${allowedProjects.join(', ')}`;
    super(message);
    this.name = 'MCPProjectNotAllowedError';
    this.requestedProject = requestedProject;
    this.allowedProjects = allowedProjects;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPProjectNotAllowedError);
    }
  }
}

/**
 * Error thrown when no project is specified but server requires one
 */
export class MCPProjectRequiredError extends Error {
  public readonly allowedProjects: string[];

  constructor(allowedProjects: string[]) {
    const message = `Project is required. Server is restricted to: ${allowedProjects.join(', ')}`;
    super(message);
    this.name = 'MCPProjectRequiredError';
    this.allowedProjects = allowedProjects;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPProjectRequiredError);
    }
  }
}
