/**
 * Command execution MCP tools for LXD containers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LXDInstance } from '../lxd/api.js';
import { LXDError, LXDNotFoundError } from '../lxd/errors.js';
import { createLogger } from '../logging/index.js';
import { sanitizeObject, detectSensitiveEnvVars } from '../logging/sanitize.js';
import type { Logger } from 'pino';
import type { LXDApiLike } from '../lxd/scoped-api.js';

const log = createLogger('exec');

/**
 * Validate that an instance is a container (not a VM)
 * VM exec requires lxd-agent which is not always available
 */
async function validateContainerType(api: LXDApiLike, instanceName: string, project?: string): Promise<LXDInstance> {
  const instance = await api.getInstance(instanceName, project);
  
  if (instance.type === 'virtual-machine') {
    throw new Error(
      `Instance "${instanceName}" is a virtual machine. ` +
      `Command execution is only supported for containers, not VMs. ` +
      `VM exec requires lxd-agent running inside the VM.`
    );
  }
  
  return instance;
}

/**
 * Check if container is running
 */
async function validateContainerRunning(api: LXDApiLike, instanceName: string, project?: string): Promise<void> {
  const state = await api.getInstanceState(instanceName, project);
  
  if (state.status !== 'Running') {
    throw new Error(
      `Instance "${instanceName}" is not running (current state: ${state.status}). ` +
      `Please start the container first using start_instance.`
    );
  }
}

export function registerExecTools(server: McpServer, api: LXDApiLike, log: Logger): void {
  // Execute command in container tool
  server.registerTool(
    'exec_command',
    {
      title: 'Execute Command in Container',
      description: [
        'Execute a shell command inside a running LXD container.',
        'Commands are automatically wrapped in /bin/sh -c to support shell features like pipes, redirects, and environment variables.',
        'Note: This tool only works with containers, not virtual machines.',
        'Security Note: Environment variables containing sensitive data (such as passwords, API keys, tokens) will be sanitized in logs and warnings will be issued when detected.',
        '',
        'Parameters:',
        '- container: Name of the container',
        '- command: Shell command to execute',
        '- user: Run as specific UID (default: root/0)',
        '- group: Run as specific GID (default: root/0)',
        '- cwd: Working directory (default: /)',
        '- env: Environment variables as JSON object',
        '- timeoutMs: Timeout in milliseconds (default: 30000, max: 120000)',
      ].join('\n'),
      inputSchema: z.object({
        container: z.string().describe('Container name'),
        command: z.string().describe('Command to execute (will be wrapped in /bin/sh -c)'),
        user: z.number().optional().describe('Run as specific UID (e.g., 0 for root, 1000 for unprivileged user)'),
        group: z.number().optional().describe('Run as specific GID (e.g., 0 for root, 1000 for unprivileged group)'),
        cwd: z.string().optional().describe('Working directory (default: /)'),
        env: z.record(z.string(), z.string()).optional().describe('Environment variables as JSON object'),
        timeoutMs: z.number().min(1000).max(120000).optional().describe('Timeout in milliseconds (default: 30000, min: 1000, max: 120000)').default(30000),
        project: z.string().optional().describe('LXD project name (optional)'),
      }),
    },
    async (args: {
      container: string;
      command: string;
      user?: number;
      group?: number;
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      project?: string;
    }) => {
      const { container, command, user, group, cwd, env, timeoutMs, project } = args;
      
      // Sanitize environment variables once at the start - reuse throughout the function
      const sanitizedEnv = env ? sanitizeObject(env) : undefined;
      
      // Detect sensitive environment variables
      const { hasSensitive, warning } = detectSensitiveEnvVars(env);
      
      log.debug({ 
        container, 
        // Note: We intentionally do NOT log the command to prevent sensitive data exposure
        user, 
        group, 
        cwd, 
        timeoutMs, 
        project 
      }, 'Executing command in container');
      
      // Log warning if sensitive environment variables are detected
      if (hasSensitive) {
        log.warn(warning);
      }
      
      try {
        // Validate container exists and is a container (not a VM)
        await validateContainerType(api, container, project);
        
        // Validate container is running
        await validateContainerRunning(api, container, project);
        
        // Execute the command
        const result = await api.exec(
          container,
          command,
          {
            user,
            group,
            cwd,
            env,
            timeoutMs,
          },
          project
        );
        
        // Format the response
        const response = {
          success: result.exit_code === 0,
          exitCode: result.exit_code,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.exit_code === 137,
        };
        
        // Include timeout message in stderr if timed out
        if (response.timedOut) {
          response.stderr += `\n[Command timed out after ${timeoutMs}ms - process was killed]`;
        }
        
        log.debug({ 
          container, 
          exitCode: result.exit_code,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
          timedOut: result.exit_code === 137,
          project,
          env: sanitizedEnv
        }, 'Command executed successfully');
        
        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        // Handle specific error types with user-friendly messages
        if (error instanceof LXDNotFoundError) {
          log.error({ 
            container, 
            error: error.message,
            project,
            env: sanitizedEnv
          }, 'Container not found during execution');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: `Container "${container}" not found`,
                details: error.message,
              }, null, 2),
            }],
          };
        }
        
        if (error instanceof LXDError) {
          log.error({ 
            container, 
            error: error.message,
            project,
            env: sanitizedEnv
          }, 'LXD API error during execution');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: 'LXD API error',
                details: error.message,
              }, null, 2),
            }],
          };
        }
        
        if (error instanceof Error) {
          log.error({ 
            container, 
            error: error.message,
            project,
            env: sanitizedEnv
          }, 'Command execution error');
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: error.message,
              }, null, 2),
            }],
          };
        }
        
        // Unknown error
        log.error({ 
          container, 
          error: 'Unknown error occurred',
          project,
          env: sanitizedEnv
        }, 'Unknown error during execution');
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              success: false,
              error: 'Unknown error occurred',
            }, null, 2),
          }],
        };
      }
    }
  );
}
