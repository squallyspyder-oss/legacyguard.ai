import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { runSandbox, getSandboxCapabilities, __setChildProcessForTests } from '../src/lib/sandbox';

function createProc(exitCode = 0) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  setTimeout(() => proc.emit('close', exitCode), 0);
  return proc;
}

describe('sandbox fallback behavior', () => {
  let spawnMock: ReturnType<typeof vi.fn>;
  let execMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spawnMock = vi.fn();
    execMock = vi.fn();
    __setChildProcessForTests({ spawn: spawnMock, exec: execMock });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset to force ensureChildProcess to re-require on next test if needed
    __setChildProcessForTests({ spawn: undefined as any, exec: undefined as any });
  });

  it('uses docker when available', async () => {
    execMock.mockImplementation((cmd: string, opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      callback?.(null, 'ok', '');
    });
    spawnMock.mockImplementation(() => createProc(0));

    const result = await runSandbox({
      enabled: true,
      repoPath: process.cwd(),
      command: 'echo ok',
      timeoutMs: 5000,
    });

    expect(execMock).toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith('docker', expect.any(Array), expect.any(Object));
    expect(result.method).toBe('docker');
    expect(result.success).toBe(true);
  });

  it('falls back to native when docker is unavailable', async () => {
    execMock.mockImplementation((cmd: string, opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      callback?.(new Error('docker missing'));
    });
    spawnMock.mockImplementation(() => createProc(0));

    const result = await runSandbox({
      enabled: true,
      repoPath: process.cwd(),
      command: 'echo ok',
      timeoutMs: 5000,
      useDocker: true,
    });

    expect(execMock).toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalled();
    expect(result.method).toBe('native');
    expect(result.success).toBe(true);
  });

  it('passes runtime flag when configured', async () => {
    execMock.mockImplementation((cmd: string, opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      callback?.(null, 'ok', '');
    });

    spawnMock.mockImplementation(() => createProc(0));

    const result = await runSandbox({
      enabled: true,
      repoPath: process.cwd(),
      command: 'echo ok',
      timeoutMs: 5000,
      runtime: 'runsc',
    });

    const args = (spawnMock as any).mock.calls[0][1] as string[];
    expect(args).toContain('--runtime');
    expect(args).toContain('runsc');
    expect(result.method).toBe('docker');
  });

  it('reports native as recommended when docker is missing', async () => {
    execMock.mockImplementation((cmd: string, opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      callback?.(new Error('docker missing'));
    });
    spawnMock.mockImplementation(() => createProc(0));

    const caps = await getSandboxCapabilities();

    expect(execMock).toHaveBeenCalled();
    expect(caps.docker).toBe(false);
    expect(caps.native).toBe(true);
    expect(caps.recommended).toBe('native');
  });
});
