import WebSocket from 'ws';

export interface EventOptions {
  types?: Array<'logging' | 'operation' | 'lifecycle'>;
  project?: string;
  timeoutMs?: number;
}
export interface LXDMonitoredEvent {
  type: string;
  timestamp: string;
  location?: string;
  metadata: unknown;
}

/** Collect a bounded event window using a real RFC6455 client over the local socket. */
export function collectEvents(socketPath: string, options: EventOptions = {}): Promise<LXDMonitoredEvent[]> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) return Promise.reject(new Error('Invalid event timeout'));
  if (!socketPath.startsWith('/') || /[:?#]/.test(socketPath)) return Promise.reject(new Error('Unsupported Unix socket path'));
  const types = options.types ?? ['lifecycle', 'operation'];
  if (types.length === 0 || types.some(type => !['lifecycle', 'operation', 'logging'].includes(type))) return Promise.reject(new Error('Invalid event type'));
  const query = new URLSearchParams({ type: [...new Set(types)].join(',') });
  if (options.project !== undefined) query.set('project', options.project);
  return new Promise((resolve, reject) => {
    const events: LXDMonitoredEvent[] = [];
    let totalBytes = 0;
    let opened = false;
    let settled = false;
    // ws implements the upgrade, frame parsing, ping/pong and fragmentation.
    const socket = new WebSocket(`ws+unix://${socketPath}:/1.0/events?${query}`, { handshakeTimeout: timeoutMs, maxPayload: 1024 * 1024 });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.terminate();
      error ? reject(error) : resolve(events);
    };
    const timer = setTimeout(() => finish(opened ? undefined : new Error('Event WebSocket handshake timed out')), timeoutMs);
    socket.on('open', () => { opened = true; });
    socket.on('error', error => finish(error));
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      finish(new Error(`Event WebSocket upgrade rejected: HTTP ${response.statusCode}`));
    });
    socket.on('close', () => {
      if (!settled) finish(new Error('Event stream closed before the requested observation window completed'));
    });
    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) throw new Error('Unexpected binary LXD event');
        const text = data.toString();
        totalBytes += Buffer.byteLength(text);
        if (totalBytes > 8 * 1024 * 1024) throw new Error('Aggregate event byte limit exceeded');
        const event = JSON.parse(text);
        if (!event || typeof event.type !== 'string' || typeof event.timestamp !== 'string' || !('metadata' in event)) throw new Error('Invalid LXD event payload');
        if (!types.includes(event.type)) return;
        events.push(event);
        if (events.length > 1000) finish(new Error('Event limit exceeded; shorten the observation window'));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid LXD event'));
      }
    });
  });
}
