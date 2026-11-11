#!/usr/bin/env node
/**
 * Main entry point for LXD MCP Server
 */

import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { parseConfig } from './config.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LXDClient } from './lxd/client.js';
import { LXDApi } from './lxd/api.js';
import { ScopedLXDApi, LXDApiLike } from './lxd/scoped-api.js';
import { detectSocketPath } from './lxd/socket-detection.js';
import { registerInstanceTools } from './tools/instances.js';
import { registerImageTools } from './tools/images.js';
import { registerServerTools } from './tools/server.js';
import { registerExecTools } from './tools/exec.js';
import { registerConfigTools } from './tools/config.js';
import { registerProfileTools } from './tools/profiles.js';
import { registerFileTools } from './tools/files.js';
import { registerLogsTools } from './tools/logs.js';
import { registerMonitorTools } from './tools/monitor.js';
import { createLogger } from './logging/index.js';

// Main async IIFE to handle async socket detection
(async () => {
  const log = createLogger('server');
  const mcpLog = createLogger('mcp');
  const config = parseConfig(process.argv.slice(2));

  // Detect LXD socket path at startup
  let socketPath: string;
  let socketSource: string;

  // If LXD_SOCKET_PATH is explicitly set, use it directly
  if (process.env.LXD_SOCKET_PATH) {
    socketPath = process.env.LXD_SOCKET_PATH;
    socketSource = 'LXD_SOCKET_PATH';
    log.info({ socketPath, source: socketSource }, 'Using explicit LXD_SOCKET_PATH');
  } else {
    // Auto-detect the socket path
    try {
      const result = await detectSocketPath();
      socketPath = result.path;
      socketSource = result.source;
      log.info({ socketPath, source: socketSource }, `Auto-detected LXD socket (${socketSource})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error: errorMessage }, 'Failed to detect LXD socket');
      process.exit(1);
    }
  }

  // Initialize LXD client and API
  const lxdClient = new LXDClient({ socketPath });
  const lxdApi = new LXDApi(lxdClient);

  // Create scoped API if projects are configured
  const scopedLxdApi = config.allowedProjects.length > 0
    ? new ScopedLXDApi({ api: lxdApi, allowedProjects: config.allowedProjects })
    : null;

  // Use scoped API if available, otherwise use base API
  // Note: Both LXDApi and ScopedLXDApi implement LXDApiLike interface
  const apiForTools: LXDApiLike = scopedLxdApi || lxdApi;

  // Bearer token authentication middleware
  function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Case-insensitive Bearer token check
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = parts[1];
    if (Buffer.byteLength(token) !== Buffer.byteLength(config.accessToken) || !timingSafeEqual(Buffer.from(token), Buffer.from(config.accessToken))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  }

  // Create a function to create a fresh MCP server instance per request
  function createMcpServer() {
    const server = new McpServer(
      {
        name: 'lxd-mcp',
        version: '1.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
    
    // Register tools - both LXDApi and ScopedLXDApi implement LXDApiLike
    registerInstanceTools(server, apiForTools, log);
    registerImageTools(server, apiForTools, log);
    registerServerTools(server, apiForTools, log);
    registerExecTools(server, apiForTools, log);
    registerConfigTools(server, apiForTools, log);
    registerProfileTools(server, apiForTools, log);
    registerFileTools(server, apiForTools, log);
    registerLogsTools(server, apiForTools, log);
    registerMonitorTools(server, apiForTools, log);
    
    return server;
  }

  // Create Express app
  const app = express();
  app.disable('x-powered-by');
  app.use('/mcp', authMiddleware);
  app.use(express.json({ limit: '24mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    log.debug({ method: req.method, path: req.path }, 'Incoming request');
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      log.info({ method: req.method, path: req.path, statusCode: res.statusCode, duration: `${duration}ms` }, 'Request completed');
    });
    
    next();
  });

  // MCP endpoint using Streamable HTTP
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      mcpLog.error({ error: error instanceof Error ? error.message : String(error) }, 'MCP error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Also support SSE endpoint for backwards compatibility
  app.get('/mcp', async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      mcpLog.error({ error: error instanceof Error ? error.message : String(error) }, 'MCP error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Start server
  const server = app.listen(config.port, config.host, () => {
    log.info({ host: config.host, port: config.port }, 'Server started');
    log.info({ socketPath, source: socketSource }, 'LXD socket configuration');
    log.info({ url: `http://${config.host}:${config.port}/mcp` }, 'MCP endpoint');
    if (config.allowedProjects.length > 0) {
      log.info({ projects: config.allowedProjects }, 'Project restriction enabled');
    }
  });

  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  server.on('error', (err) => {
    log.error({ error: err.message }, 'Server error');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log.info('Received SIGINT, shutting down');
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    log.info('Received SIGTERM, shutting down');
    server.close(() => {
      process.exit(0);
    });
  });
})().catch(() => {
  // Configuration errors must not accidentally include secret values.
  console.error('LXD MCP startup failed. Check configuration and socket access.');
  process.exitCode = 1;
});
