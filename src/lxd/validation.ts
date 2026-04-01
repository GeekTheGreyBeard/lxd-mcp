/**
 * LXD validation utilities for instance and snapshot names
 */

/**
 * Validates an instance name according to LXD naming conventions
 * 
 * LXD instance names must:
 * - Be between 1 and 63 characters long
 * - Start and end with alphanumeric characters
 * - Contain only alphanumeric characters, hyphens, and underscores
 * - Not contain consecutive hyphens or underscores
 * - Not start or end with hyphen or underscore
 */
export function validateInstanceName(name: string): boolean {
  // Check length
  if (name.length < 1 || name.length > 63) {
    return false;
  }
  
  // Check that it starts with a letter (not number, hyphen, or underscore)
  if (!/^[a-zA-Z]/.test(name)) {
    return false;
  }
  
  // Check that it ends with alphanumeric characters
  if (!/[a-zA-Z0-9]$/.test(name)) {
    return false;
  }
  
  // Check that it only contains alphanumeric, hyphen, or underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return false;
  }
  
  // Check for consecutive hyphens or underscores
  if (/[-_]{2}/.test(name)) {
    return false;
  }
  
  return true;
}

/**
 * Validates a snapshot name according to LXD naming conventions
 * 
 * LXD snapshot names must:
 * - Be between 1 and 63 characters long
 * - Start and end with alphanumeric characters
 * - Contain only alphanumeric characters, hyphens, and underscores
 * - Not contain consecutive hyphens or underscores
 * - Not start or end with hyphen or underscore
 */
export function validateSnapshotName(name: string): boolean {
  // Check length
  if (name.length < 1 || name.length > 63) {
    return false;
  }
  
  // Check that it starts and ends with alphanumeric characters
  if (!/^[a-zA-Z0-9]/.test(name) || !/[a-zA-Z0-9]$/.test(name)) {
    return false;
  }
  
  // Check that it only contains alphanumeric, hyphen, or underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return false;
  }
  
  // Check for consecutive hyphens or underscores
  if (/[-_]{2}/.test(name)) {
    return false;
  }
  
  return true;
}

// File path validation

/**
 * List of dangerous paths that should be blocked for security reasons
 */
const BLOCKED_PATHS = ['/proc', '/sys', '/dev', '/run'];

/**
 * Validates that a file path is absolute (starts with /)
 * @param path The file path to validate
 * @returns true if the path is absolute, false otherwise
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

/**
 * Checks if a path contains path traversal attempts (..)
 * @param path The file path to validate
 * @returns true if the path attempts traversal, false otherwise
 */
export function containsPathTraversal(path: string): boolean {
  // Normalize the path and check for ..
  const normalized = path.replace(/\/+/g, '/');
  return normalized.includes('..');
}

/**
 * Checks if a path is in the blocked list (dangerous system paths)
 * @param path The file path to validate
 * @returns true if the path is blocked, false otherwise
 */
export function isBlockedPath(path: string): boolean {
  // Check if path starts with any blocked prefix
  const normalizedPath = path.replace(/\/+/g, '/').replace(/\/$/, '');
  return BLOCKED_PATHS.some(blocked => 
    normalizedPath === blocked || normalizedPath.startsWith(blocked + '/')
  );
}

/**
 * Validates a file path for security
 * Returns an error message if validation fails, undefined if valid
 * @param path The file path to validate
 */
export function validateFilePath(path: string): string | undefined {
  if (!isAbsolutePath(path)) {
    return 'Path must be absolute (must start with /)';
  }
  
  if (containsPathTraversal(path)) {
    return 'Path traversal (..) is not allowed';
  }
  
  if (isBlockedPath(path)) {
    return `Path is in blocked list: ${BLOCKED_PATHS.join(', ')}`;
  }
  
  return undefined;
}