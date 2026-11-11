import {it, expect, vi} from 'vitest';
import {LXDApi} from '../../src/lxd/api.js';
import {registerExecTools} from '../../src/tools/exec.js';

it('API exec fails closed without POST or other daemon access', async () => {
  const client = new Proxy({}, {get: () => vi.fn(() => {throw new Error('Unexpected daemon access');})});
  const api = new LXDApi(client as any);
  await expect(api.exec('test', 'true')).rejects.toThrow('No command was submitted');
});
it('tool advertises unavailable and never invokes API', async () => {
  let definition: any, handler: any;
  const server = {registerTool: (_name: string, def: any, fn: any) => {definition = def; handler = fn;}};
  const api = new Proxy({}, {get: () => {throw new Error('Unexpected API access');}});
  registerExecTools(server as any, api as any, {} as any);
  expect(definition.description).toContain('unavailable');
  expect(await handler({container: 'test', command: 'true'})).toMatchObject({isError: true});
});
