import { describe, it, expect, vi, beforeEach } from 'vitest';

const runSandboxMock = vi.fn();

vi.mock('../src/lib/sandbox', () => ({
  runSandbox: runSandboxMock,
}));

async function createExecutor() {
  const { createToolExecutor } = await import('../src/lib/tool-executors');
  const { runSandbox } = await import('../src/lib/sandbox');
  expect(runSandbox).toBe(runSandboxMock);

  return createToolExecutor({
    repoPath: process.cwd(),
    sandboxEnabled: true,
    sandboxMode: 'fail',
    workerEnabled: false,
    guardianFlowEnabled: true,
  });
}

describe('guardianFlow runDeterministic', () => {
  beforeEach(() => {
    runSandboxMock.mockReset();
  });

  it('aprova quando execuções são consistentes', async () => {
    runSandboxMock.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      durationMs: 5,
      method: 'docker',
    });

    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'runDeterministic', code: 'console.log("ok")' })
    );

    expect(result.success).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.consistency).toBe(100);
    expect(runSandboxMock).toHaveBeenCalledTimes(5);
  });

  it('reprova quando os hashes divergem entre execuções', async () => {
    const outputs = ['a', 'b', 'a', 'a', 'a'];
    runSandboxMock.mockImplementation(() => {
      const out = outputs.shift() || 'a';
      return Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: out,
        stderr: '',
        durationMs: 5,
        method: 'docker',
      });
    });

    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'runDeterministic', code: 'console.log(Math.random())' })
    );

    expect(result.success).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.consistency).toBe(0);
    expect(result.runsCompleted).toBeGreaterThanOrEqual(2);
  });

  it('falha cedo quando a sandbox retorna erro', async () => {
    runSandboxMock.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'boom',
      durationMs: 5,
      method: 'docker',
    });

    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'runDeterministic', code: 'throw new Error("boom")' })
    );

    expect(result.success).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.runsCompleted).toBe(1);
    expect(String(result.message || '')).toContain('failed');
  });
});
