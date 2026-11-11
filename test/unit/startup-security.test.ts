import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../../src/config.js';
import { sanitizeObject } from '../../src/logging/sanitize.js';
import { ScopedLXDApi } from '../../src/lxd/scoped-api.js';

describe('fail-closed startup', () => {
  it('binds loopback and honors environment projects', () => {
    expect(parseConfig([], { ACCESS_TOKEN: 'test-only', LXD_PROJECTS: 'alpha, beta,alpha' })).toMatchObject({host: '127.0.0.1', allowedProjects: ['alpha', 'beta']});
  });
  it('CLI projects take precedence', () => {
    expect(parseConfig(['--projects=gamma'], { ACCESS_TOKEN: 'test', LXD_PROJECTS: 'alpha' }).allowedProjects).toEqual(['gamma']);
  });
  it.each(['', 'alpha,', ',alpha', 'a?project=b', '.', '..', 'a/b'])('rejects malformed or empty restriction %j', value => {
    expect(() => parseConfig([], { ACCESS_TOKEN: 'test', LXD_PROJECTS: value })).toThrow();
  });
  it.each(['', ' ', undefined])('requires authentication even locally %j', value => {
    expect(() => parseConfig([], { ACCESS_TOKEN: value })).toThrow();
  });
  it.each(['0', '-1', '65536', '3000junk', '1.2'])('rejects invalid port %j', value => {
    expect(() => parseConfig([], { ACCESS_TOKEN: 'test', PORT: value })).toThrow();
  });
  it('allows deliberate management-network bind only with configured token', () => {
    expect(parseConfig([], { ACCESS_TOKEN: 'test', HOST: '10.1.2.3' }).host).toBe('10.1.2.3');
  });
});

describe('image/alias/event project enforcement', () => {
  const cases = [
    ['getImage', ['hash']], ['deleteImage', ['hash']], ['listAliases', [undefined]],
    ['getAlias', ['alias']], ['createAlias', ['alias', 'description', 'hash']], ['deleteAlias', ['alias']],
  ] as const;
  it.each(cases)('%s requires and forwards scope', async (method, args) => {
    const underlying = { [method]: vi.fn().mockResolvedValue({}) };
    const api = new ScopedLXDApi({ api: underlying as any, allowedProjects: ['safe'] });
    await expect((api[method] as any)(...args)).rejects.toThrow();
    await expect((api[method] as any)(...args, 'outside')).rejects.toThrow();
    expect(underlying[method]).not.toHaveBeenCalled();
    await (api[method] as any)(...args, 'safe');
    expect(underlying[method]).toHaveBeenCalledWith(...args, 'safe');
  });
  it('does not allow unscoped events', async () => {
    const underlying = { getEvents: vi.fn().mockResolvedValue([]) };
    const api = new ScopedLXDApi({ api: underlying as any, allowedProjects: ['safe'] });
    await expect(api.getEvents()).rejects.toThrow();
    await expect(api.getEvents({project: 'outside'})).rejects.toThrow();
    await api.getEvents({project: 'safe'});
    expect(underlying.getEvents).toHaveBeenCalledExactlyOnceWith({project: 'safe'});
  });
  it('copies the configured allowlist', async () => {
    const allowed = ['safe'];
    const api = new ScopedLXDApi({api: {} as any, allowedProjects: allowed});
    allowed.push('outside');
    expect(api.getAllowedProjects()).toEqual(['safe']);
  });
});

describe('log payload secrecy', () => {
  it('redacts commands, environment, file bodies and output recursively', () => {
    const fields = { command: 'secret', env: {FOO: 'secret'}, stdout: 'secret', body: { arbitrary: 'secret'}, nested: {content: 'secret'} };
    expect(JSON.stringify(sanitizeObject(fields))).not.toContain('secret');
  });
});
