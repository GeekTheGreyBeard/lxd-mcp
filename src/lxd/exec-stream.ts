import WebSocket from 'ws';
import type {LXDClient} from './client.js';
import {safePathSegment} from './path.js';
import type {ExecResult} from './exec-operation.js';

/** Bounded streaming exec. Terminal status covers the command, not detached descendants. */
export async function executeStreamingCommand(client: LXDClient, instance: string, command: string,
  options: {user?: number; group?: number; cwd?: string; env?: Record<string,string>; timeoutMs?: number} = {}, project?: string): Promise<ExecResult> {
  const ms = options.timeoutMs ?? 30000;
  if (!Number.isInteger(ms) || ms < 1000 || ms > 120000) throw new Error('Invalid exec timeout');
  const socketPath = client.getSocketPath();
  if (!socketPath.startsWith('/') || /[:?#]/.test(socketPath)) throw new Error('Unsupported Unix socket path');
  const query = new URLSearchParams(); if (project !== undefined) query.set('project', project);
  const suffix = query.size ? `?${query}` : '';
  const response = await client.post<any>(`/1.0/instances/${safePathSegment(instance)}/exec${suffix}`, {
    command: ['/bin/sh','-c',command], interactive: false, 'wait-for-websocket': true, 'record-output': false,
    environment: options.env ?? {},
    ...(options.user === undefined ? {} : {user: options.user}),
    ...(options.group === undefined ? {} : {group: options.group}),
    ...(options.cwd === undefined ? {} : {cwd: options.cwd}),
  }, {timeout: ms});
  const id = response.metadata?.id, fds = response.metadata?.metadata?.fds;
  if (response.type !== 'async' || typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new Error('Exec operation unknown after submission; no stream attached');
  const operationPath = `/1.0/operations/${id}${suffix}`;
  if (!fds || ['control','0','1','2'].some(fd => typeof fds[fd] !== 'string' || !fds[fd])) {
    throw new Error(`Exec ${id} missing required channels; streams not connected and command not released`);
  }
  const sockets: WebSocket[] = [];
  const chunks: Record<string,Buffer[]> = {'1': [], '2': []};
  let bytes = 0, failure: string | undefined, launched = false, killed = false, deadlineExpired = false;
  let control: WebSocket | undefined;
  const closed = new Set<string>();
  const eof = new Set<string>();
  const stop = (reason: string) => {
    failure ??= reason;
    if (launched && !killed && control?.readyState === WebSocket.OPEN) {
      killed = true;
      control.send(JSON.stringify({command: 'signal', signal: 9}), error => { if (error) failure = `${reason}; signal delivery failed`; });
    }
  };
  const connect = (fd: string): Promise<WebSocket> => new Promise((resolve,reject) => {
    const q = new URLSearchParams(query); q.set('secret', fds[fd]);
    const ws = new WebSocket(`ws+unix://${socketPath}:/1.0/operations/${id}/websocket?${q}`, {handshakeTimeout: Math.min(ms,5000), maxPayload: 1024*1024});
    sockets.push(ws); let opened = false;
    ws.on('open', () => {opened=true; resolve(ws);});
    ws.on('error', () => {stop(`Exec channel ${fd} failed`); if(!opened) reject(new Error(`Exec channel ${fd} handshake failed`));});
    ws.on('unexpected-response', (_req,res) => {res.resume(); stop(`Exec channel ${fd} upgrade rejected`); reject(new Error(`Exec channel ${fd} upgrade rejected`));});
    ws.on('close', code => {
      closed.add(fd);
      if ((fd === '1' || fd === '2') && code !== 1000 && !eof.has(fd)) stop(`Exec output channel ${fd} closed abnormally (${code}); output may be truncated`);
      if(!opened) reject(new Error(`Exec channel ${fd} closed during handshake`));
    });
    if (fd==='1' || fd==='2') ws.on('message', (data, isBinary) => {
      if (!isBinary) { stop(`Exec output channel ${fd} sent unexpected text frame`); return; }
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (chunk.length === 0 && isBinary) { eof.add(fd); return; } // LXD explicit binary stream EOF.
      if (eof.has(fd)) { stop(`Exec output channel ${fd} sent data after EOF`); return; }
      const available = Math.max(0, 8*1024*1024-bytes);
      if (available) chunks[fd].push(chunk.subarray(0,available));
      bytes += chunk.length;
      if(bytes > 8*1024*1024) stop('Exec output limit exceeded (8 MiB)');
    });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Control and both output channels first; stdin is the final launch barrier.
    control = await connect('control');
    await connect('1'); await connect('2');
    if(failure || control.readyState !== WebSocket.OPEN || closed.has('1') || closed.has('2')) throw new Error(failure ?? 'Exec channels closed before launch');
    launched = true; // Final upgrade can launch even if its response is lost.
    timer = setTimeout(() => {deadlineExpired=true; stop('Exec deadline exceeded');}, ms);
    const stdin = await connect('0');
    if (failure) { killed = false; stop(failure); } // Re-send after final handshake if failure raced launch.
    stdin.close();
    const terminalDeadline = Date.now()+ms+5000;
    while(Date.now()<terminalDeadline) {
      let op: any;
      try { op = (await client.get<any>(operationPath, undefined, {timeout:1000})).metadata; }
      catch {stop('Exec operation status unavailable'); await new Promise(r=>setTimeout(r,50)); continue;}
      if(op?.status_code===200 || (typeof op?.status_code==='number' && op.status_code>=400)) {
        // Await output EOF, bounded separately from process status.
        const drainUntil = Date.now()+1000;
        while((!closed.has('1') || !closed.has('2')) && Date.now()<drainUntil) await new Promise(r=>setTimeout(r,10));
        const exit = Number.isInteger(op.metadata?.return) ? op.metadata.return : null;
        if(exit===null) failure ??= 'Exec terminal operation has no verified exit code';
        if(!closed.has('1') || !closed.has('2')) failure ??= 'Output streams did not finish';
        return {exit_code:exit, stdout:Buffer.concat(chunks['1']).toString('utf8'), stderr:Buffer.concat(chunks['2']).toString('utf8'),
          operation_id:id, termination_scope:'exec-command-only', timed_out:deadlineExpired, process_may_still_run:exit===null, ...(failure ? {output_error:failure} : {})};
      }
      if (closed.has('control')) stop('Exec control channel closed before terminal status');
      await new Promise(r=>setTimeout(r,50));
    }
    stop('Exec terminal status not confirmed');
    return {exit_code:null, stdout:Buffer.concat(chunks['1']).toString('utf8'), stderr:Buffer.concat(chunks['2']).toString('utf8'), operation_id:id, termination_scope:'exec-command-only', timed_out:deadlineExpired, process_may_still_run:true, output_error:failure};
  } catch(error) {
    stop(error instanceof Error ? error.message : 'Exec stream failure');
    return {exit_code:null, stdout:'', stderr:'', operation_id:id, termination_scope:'exec-command-only', process_may_still_run:launched, output_error:failure};
  } finally {if(timer) clearTimeout(timer); sockets.forEach(ws=>ws.terminate());}
}
