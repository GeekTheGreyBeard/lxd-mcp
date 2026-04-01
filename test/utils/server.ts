/**
 * MCP Server Subprocess Management
 */

import { spawn, ChildProcess } from 'child_process';

export interface ServerOptions {
  port?: number;
  socketPath?: string;
  logLevel?: string;
}

export interface ServerReadyResult {
  ready: boolean;
  baseUrl: string;
  error?: string;
}

let serverProcess: ChildProcess | null = null;
let serverPort: number = 3000;

export const TEST_SERVER_PORT_BASE = 3100;

/**
 * Start the MCP server as a subprocess
 */
export async function startServer(options: ServerOptions = {}): Promise<ChildProcess> {
  if (serverProcess) {
    await stopServer();
  }

  serverPort = options.port || TEST_SERVER_PORT_BASE;

  const env = {
    ...process.env,
    PORT: String(serverPort),
    LXD_SOCKET_PATH: options.socketPath || process.env.LXD_SOCKET_PATH || '/var/snap/lxd/common/lxd/unix.socket',
    LOG_LEVEL: options.logLevel || 'error',
  };

  // Use npm start which runs the compiled server
  serverProcess = spawn('npm', ['run', 'start'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (error) => {
    console.error(`[Server] Process error: ${error.message}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Server] Process exited with code ${code}`);
  });

  // Wait for server to be ready
  await waitForServer(serverPort);

  return serverProcess;
}

/**
 * Stop the MCP server subprocess
 */
export async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    
    // Give time for clean shutdown
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Wait for server to be ready by checking health endpoint
 */
async function waitForServer(port: number, maxAttempts = 30): Promise<void> {
  const baseUrl = `http://localhost:${port}`;
  const healthUrl = `${baseUrl}/health`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log(`[Server] Ready on port ${port}`);
        return;
      }
    } catch {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Server not ready after ${maxAttempts} attempts`);
}

/**
 * Get the base URL for the test server
 */
export function getServerUrl(): string {
  return `http://localhost:${serverPort}/mcp`;
}

/**
 * Get server health status
 */
export async function getServerHealth(port?: number): Promise<ServerReadyResult> {
  const p = port || serverPort;
  const healthUrl = `http://localhost:${p}/health`;

  try {
    const response = await fetch(healthUrl);
    return {
      ready: response.ok,
      baseUrl: `http://localhost:${p}/mcp`,
    };
  } catch (error) {
    return {
      ready: false,
      baseUrl: `http://localhost:${p}/mcp`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
