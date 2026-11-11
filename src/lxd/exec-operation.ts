import type { LXDClient } from './client.js';

export interface ExecResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  termination_scope?: 'exec-command-only';
  output_error?: string;
  timed_out?: boolean;
  operation_id?: string;
  process_may_still_run?: boolean;
}

/** INTERNAL REGRESSION HELPER ONLY: not wired to LXDApi or any MCP tool.
 * Unsafe for production because daemon output is not bounded.
 * Record-output exec uses operation.metadata.return and operation.metadata.output.
 * Never guess an exit code, borrow another operation's logs, or claim a timed-out
 * process was killed. A timeout only ends this caller's wait.
 */
export async function executeRecordedCommand(
  client: LXDClient,
  instance: string,
  command: string,
  options: { user?: number; group?: number; cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
  project?: string,
): Promise<ExecResult> {
  if (!instance || /[/?#\\\x00-\x1f]/.test(instance) || instance === '.' || instance === '..') throw new Error('Invalid instance name');
  const timeout = Math.min(Math.max(options.timeoutMs ?? 30000, 1000), 120000);
  if (!Number.isFinite(timeout)) throw new Error('Invalid exec timeout');
  const deadline = Date.now() + timeout;
  const suffix = project === undefined ? '' : `?project=${encodeURIComponent(project)}`;
  const base = `/1.0/instances/${encodeURIComponent(instance)}`;
  const request = {
    command: ['/bin/sh', '-c', command],
    environment: { HOME: '/root', USER: 'root', ...options.env },
    interactive: false,
    'record-output': true,
    ...(options.user === undefined ? {} : { user: options.user }),
    ...(options.group === undefined ? {} : { group: options.group }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  };
  const response = await client.post<any>(`${base}/exec${suffix}`, request, { timeout });
  const id = response.metadata?.id;
  if (response.type !== 'async' || typeof id !== 'string' || !/^[\w-]+$/.test(id)) {
    throw new Error('LXD exec did not return a valid asynchronous operation; execution outcome is unknown');
  }
  const timedOut = (): ExecResult => ({ exit_code: null, stdout: '', stderr: 'Wait deadline exceeded; the command may still be running. No kill was attempted.', timed_out: true, operation_id: id, process_may_still_run: true });
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let operation;
    try {
      operation = (await client.get<any>(`/1.0/operations/${id}${suffix}`, undefined, { timeout: Math.max(1, remaining) })).metadata;
    } catch (error) {
      if (Date.now() >= deadline) return timedOut();
      throw error;
    }
    const status = operation?.status_code;
    if (status === 200) {
      const metadata = operation.metadata;
      const exitCode = metadata?.return;
      if (!Number.isInteger(exitCode)) throw new Error(`Exec operation ${id} completed without a verified exit status`);
      const outputs = metadata.output;
      const readOutput = async (fd: '1' | '2'): Promise<string> => {
        const path = outputs?.[fd];
        if (path === undefined) throw new Error(`Exec operation ${id} has no recorded output for descriptor ${fd}`);
        if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('Invalid exec output URL');
        const url = new URL(path, 'http://lxd.invalid');
        const logBase = `${base}/logs/`;
        const prefix = url.pathname.startsWith(`${logBase}exec-output/`) ? `${logBase}exec-output/` : logBase;
        if (url.origin !== 'http://lxd.invalid' || !url.pathname.startsWith(prefix) || url.hash) throw new Error('Unexpected exec output URL');
        const filename = decodeURIComponent(url.pathname.slice(prefix.length));
        if (!filename || /[\/\\\x00-\x1f]/.test(filename) || filename === '.' || filename === '..') throw new Error('Invalid exec output filename');
        // Rebuild project context rather than trusting the daemon-provided query.
        const raw = await client.getRaw(`${prefix}${encodeURIComponent(filename)}${suffix}`, { timeout: Math.max(1, deadline - Date.now()) });
        return Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
      };
      let stdout = '';
      let stderr = '';
      try {
        stdout = await readOutput('1');
        stderr = await readOutput('2');
      } catch (error) {
        return { exit_code: exitCode, stdout, stderr, output_error: error instanceof Error ? error.message : 'Output retrieval failed', operation_id: id, process_may_still_run: false };
      }
      return { exit_code: exitCode, stdout, stderr, timed_out: false, operation_id: id, process_may_still_run: false };
    }
    if (typeof status === 'number' && status >= 400) throw new Error(`Exec operation ${id} failed: ${operation.err || operation.status || status}`);
    await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))));
  }
  return timedOut();
}
