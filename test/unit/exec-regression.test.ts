import { describe, it, expect, vi } from 'vitest';
import { executeRecordedCommand } from '../../src/lxd/exec-operation.js';
import type { LXDClient } from '../../src/lxd/client.js';

function client(operation: any) {
  return {
    post: vi.fn().mockResolvedValue({ type: 'async', metadata: { id: 'operation-1' } }),
    get: vi.fn().mockResolvedValue({ metadata: operation }),
    getRaw: vi.fn().mockImplementation(async (path: string) => path.includes('stdout') ? 'MCP_TEST_OUTPUT' : 'stderr-output'),
  };
}
const success = (code: number) => ({ status_code: 200, metadata: { return: code, output: { '1': '/1.0/instances/test/logs/exec_operation-1.stdout?project=wrong', '2': '/1.0/instances/test/logs/exec_operation-1.stderr' } } });
describe('recorded exec regression', () => {
  it('preserves nonzero exit and reads exact operation output with authorized project', async () => {
    const c = client(success(7));
    expect(await executeRecordedCommand(c as unknown as LXDClient, 'test', 'printf MCP_TEST_OUTPUT; exit 7', {}, 'test-project')).toMatchObject({ exit_code: 7, stdout: 'MCP_TEST_OUTPUT', stderr: 'stderr-output', timed_out: false });
    expect(c.getRaw).toHaveBeenCalledWith('/1.0/instances/test/logs/exec_operation-1.stdout?project=test-project', expect.objectContaining({ timeout: expect.any(Number) }));
  });
  it('accepts encoded dots without allowing encoded separators', async () => {
    const op = success(0); op.metadata.output['1'] = '/1.0/instances/test/logs/exec_operation-1%2estdout';
    expect(await executeRecordedCommand(client(op) as unknown as LXDClient, 'test', 'true')).toMatchObject({stdout: 'MCP_TEST_OUTPUT'});
    op.metadata.output['1'] = '/1.0/instances/test/logs/exec%2fother';
    expect(await executeRecordedCommand(client(op) as unknown as LXDClient, 'test', 'true')).toMatchObject({output_error: 'Invalid exec output filename'});
  });
  it('accepts LXD nested exec-output directory', async () => {
    const op = success(7); op.metadata.output['1'] = '/1.0/instances/test/logs/exec-output/exec_uuid.stdout';
    const c = client(op);
    expect(await executeRecordedCommand(c as unknown as LXDClient, 'test', 'exit 7')).toMatchObject({exit_code: 7, stdout: 'MCP_TEST_OUTPUT'});
    expect(c.getRaw).toHaveBeenCalledWith('/1.0/instances/test/logs/exec-output/exec_uuid.stdout', expect.anything());
  });
  it('does not treat exit137 as timeout', async () => {
    const result = await executeRecordedCommand(client(success(137)) as unknown as LXDClient, 'test', 'exit 137');
    expect(result.exit_code).toBe(137); expect(result.timed_out).toBe(false);
  });
  it('refuses missing exit status rather than inventing zero', async () => {
    await expect(executeRecordedCommand(client({ status_code: 200, metadata: {} }) as unknown as LXDClient, 'test', 'true')).rejects.toThrow('verified exit');
  });
  it('reports operation failure', async () => {
    await expect(executeRecordedCommand(client({ status_code: 400, err: 'agent unavailable' }) as unknown as LXDClient, 'test', 'true')).rejects.toThrow('agent unavailable');
  });
  it('reports deadline honestly without claiming termination', async () => {
    vi.useFakeTimers();
    try {
      const c = client({ status_code: 103 });
      const result = executeRecordedCommand(c as unknown as LXDClient, 'test', 'sleep 60', { timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1001);
      expect(await result).toMatchObject({ exit_code: null, timed_out: true, operation_id: 'operation-1', process_may_still_run: true });
    } finally { vi.useRealTimers(); }
  });
  it('does not accept external or unrelated output URL', async () => {
    const op = success(0); op.metadata.output['1'] = 'http://evil.invalid/1.0/instances/test/logs/foo';
    await expect(executeRecordedCommand(client(op) as unknown as LXDClient, 'test', 'true')).resolves.toMatchObject({exit_code: 0, output_error: 'Invalid exec output URL', operation_id: 'operation-1'});
  });
  it('does not swallow output retrieval errors', async () => {
    const c = client(success(0)); c.getRaw.mockRejectedValue(new Error('unavailable'));
    await expect(executeRecordedCommand(c as unknown as LXDClient, 'test', 'true')).resolves.toMatchObject({exit_code: 0, output_error: 'unavailable', operation_id: 'operation-1'});
  });
  it('rejects crafted names before submission', async () => {
    const c = client(success(0));
    await expect(executeRecordedCommand(c as unknown as LXDClient, 'test?project=default#', 'true')).rejects.toThrow('Invalid instance');
    expect(c.post).not.toHaveBeenCalled();
  });
});
