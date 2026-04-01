/**
 * LXD Socket Detection Module
 * 
 * Automatically detects the LXD Unix socket path by checking common installation locations.
 * Supports environment variable overrides (LXD_SOCKET_PATH, LXD_DIR).
 */

import { access, constants } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Error thrown when no LXD socket is found
 */
export class LXDSocketNotFoundError extends Error {
  public readonly checkedPaths: Array<{ path: string; source: string }>;

  constructor(checkedPaths: Array<{ path: string; source: string }>) {
    const pathList = checkedPaths
      .map(p => `  - ${p.path} (${p.source})`)
      .join('\n');
    const message = `LXD socket not found. Checked paths:\n${pathList}\nSet LXD_SOCKET_PATH to override.`;
    super(message);
    this.name = 'LXDSocketNotFoundError';
    this.checkedPaths = checkedPaths;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LXDSocketNotFoundError);
    }
  }
}

/**
 * Expand ~ to user's home directory
 */
function expandHome(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Socket path information including the source of detection
 */
export interface SocketDetectionResult {
  /** The detected socket path */
  path: string;
  /** Source of the detection (e.g., 'LXD_SOCKET_PATH', 'snap', 'apt', 'LXD_DIR', 'source') */
  source: string;
}

/**
 * Check if a socket path is accessible
 */
async function isSocketAccessible(socketPath: string): Promise<boolean> {
  try {
    await access(socketPath, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Common socket paths to check, in order of priority
 */
const SOCKET_PATHS = {
  snap: '/var/snap/lxd/common/lxd/unix.socket',
  apt: '/var/lib/lxd/unix.socket',
  source: '~/.config/lxd/unix.socket',
} as const;

/**
 * Detect the LXD socket path by checking common installation locations
 * 
 * Detection order:
 * 1. LXD_SOCKET_PATH - Explicit override (always checked first)
 * 2. LXD_DIR/unix.socket - If LXD_DIR env var is set
 * 3. /var/snap/lxd/common/lxd/unix.socket - Snap default
 * 4. /var/lib/lxd/unix.socket - APT/pacman default
 * 5. ~/.config/lxd/unix.socket - Source/custom builds
 * 
 * @returns The detected socket path with source information
 * @throws Error if no socket is found
 */
export async function detectSocketPath(): Promise<SocketDetectionResult> {
  // Track all checked paths for error messages
  const checkedPaths: Array<{ path: string; source: string }> = [];

  // 1. Check explicit LXD_SOCKET_PATH override
  const explicitPath = process.env.LXD_SOCKET_PATH;
  if (explicitPath) {
    const expandedPath = expandHome(explicitPath);
    checkedPaths.push({ path: expandedPath, source: 'LXD_SOCKET_PATH' });
    
    if (await isSocketAccessible(expandedPath)) {
      return { path: expandedPath, source: 'LXD_SOCKET_PATH' };
    }
  }

  // 2. Check LXD_DIR if set (non-snap installations)
  const lxdDir = process.env.LXD_DIR;
  if (lxdDir) {
    const lxdDirSocket = expandHome(lxdDir).replace(/\/$/, '') + '/unix.socket';
    checkedPaths.push({ path: lxdDirSocket, source: 'LXD_DIR' });
    
    if (await isSocketAccessible(lxdDirSocket)) {
      return { path: lxdDirSocket, source: 'LXD_DIR' };
    }
  }

  // 3. Check snap socket path
  checkedPaths.push({ path: SOCKET_PATHS.snap, source: 'snap' });
  if (await isSocketAccessible(SOCKET_PATHS.snap)) {
    return { path: SOCKET_PATHS.snap, source: 'snap' };
  }

  // 4. Check APT/pacman socket path
  checkedPaths.push({ path: SOCKET_PATHS.apt, source: 'apt/pacman' });
  if (await isSocketAccessible(SOCKET_PATHS.apt)) {
    return { path: SOCKET_PATHS.apt, source: 'apt/pacman' };
  }

  // 5. Check source/custom build socket path
  const sourcePath = expandHome(SOCKET_PATHS.source);
  checkedPaths.push({ path: sourcePath, source: 'source' });
  if (await isSocketAccessible(sourcePath)) {
    return { path: sourcePath, source: 'source' };
  }

  // No socket found - throw custom error with all checked paths
  throw new LXDSocketNotFoundError(checkedPaths);
}
