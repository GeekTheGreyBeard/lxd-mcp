import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocketServer } from 'ws';
import { collectEvents } from '../../src/lxd/event-stream.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { while(cleanups.length) await cleanups.pop()!(); });
async function fixture(upgrade: boolean) {
  const dir = await mkdtemp(join(tmpdir(), 'lxd-mcp-ws-'));
  const path = join(dir, 'lxd.sock');
  const server = createServer((_req, res) => { res.writeHead(403); res.end('denied'); });
  const wss = upgrade ? new WebSocketServer({ server }) : undefined;
  await new Promise<void>(resolve => server.listen(path, resolve));
  cleanups.push(async () => { wss?.clients.forEach(c => c.terminate()); await new Promise<void>(resolve => server.close(() => resolve())); wss?.close(); await rm(dir, { recursive: true }); });
  return { path, server, wss };
}
describe('event websocket regression', () => {
  it('handles real framed and fragmented events and sends comma-separated types', async () => {
    const { path, wss } = await fixture(true);
    let requestPath = '';
    const event = { type: 'lifecycle', timestamp: '2026-01-01T00:00:00Z', metadata: { action: 'instance-started' } };
    wss!.on('connection', (socket, req) => { requestPath = req.url!; const json = JSON.stringify(event); socket.send(json.slice(0, 10), { fin: false }); socket.send(json.slice(10), { fin: true }); socket.ping(); });
    expect(await collectEvents(path, { project: 'test & private', timeoutMs: 100 })).toEqual([event]);
    const url = new URL(requestPath, 'http://local');
    expect(url.searchParams.get('type')).toBe('lifecycle,operation');
    expect(url.searchParams.get('project')).toBe('test & private');
  });
  it('returns empty successful observation window', async () => {
    const { path } = await fixture(true);
    expect(await collectEvents(path, { timeoutMs: 50 })).toEqual([]);
  });
  it('rejects failed handshake instead of hanging', async () => {
    const { path } = await fixture(false);
    await expect(collectEvents(path, { timeoutMs: 100 })).rejects.toThrow('HTTP 403');
  });
  it('rejects early closure rather than claiming a complete window', async () => {
    const { path, wss } = await fixture(true); wss!.on('connection', socket => socket.close());
    await expect(collectEvents(path, { timeoutMs: 100 })).rejects.toThrow('closed before');
  });
  it('rejects malformed frame payload', async () => {
    const { path, wss } = await fixture(true); wss!.on('connection', socket => socket.send('no json'));
    await expect(collectEvents(path, { timeoutMs: 100 })).rejects.toThrow();
  });
  it('bounds aggregate event bytes', async () => {
    const {path, wss} = await fixture(true);
    wss!.on('connection', socket => {
      const event = JSON.stringify({type: 'operation', timestamp: 'now', metadata: 'x'.repeat(900000)});
      for (let i=0; i<10; i++) socket.send(event);
    });
    await expect(collectEvents(path, {timeoutMs: 2000})).rejects.toThrow('Aggregate event byte limit');
  });
  it('bounds handshake without server response', async () => {
    const { path, server } = await fixture(false); server.on('upgrade', (_req, socket) => { setTimeout(() => socket.destroy(), 100); });
    await expect(collectEvents(path, { timeoutMs: 20 })).rejects.toThrow();
  });
});
