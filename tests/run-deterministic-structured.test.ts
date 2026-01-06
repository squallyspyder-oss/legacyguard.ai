import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

vi.mock('../src/lib/sandbox', () => {
  return {
    runSandbox: vi.fn(),
  };
});

import { createToolExecutor } from '../src/lib/tool-executors';
import { runSandbox } from '../src/lib/sandbox';

const runSandboxMock = runSandbox as unknown as MockedFunction<typeof runSandbox>;

function buildExecutor() {
  return createToolExecutor({
    repoPath: process.cwd(),
    sandboxEnabled: true,
    sandboxMode: 'fail',
    workerEnabled: false,
    guardianFlowEnabled: true,
  });
}

describe('runDeterministic with structured output', () => {
  beforeEach(() => {
    runSandboxMock.mockReset();
  });

  it('treats structured fields as stable even when noisy data changes', async () => {
    runSandboxMock.mockImplementation(() => {
      const call = runSandboxMock.mock.calls.length;
      return Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: JSON.stringify({ stable: 'ok', ts: 1700000000000 + call }),
        stderr: '',
        durationMs: 5,
        method: 'native',
      });
    });

    const executor = buildExecutor();
    const response = await executor.guardianFlow({
      action: 'runDeterministic',
      command: 'echo',
      structuredFields: ['stable'],
    });
    const parsed = JSON.parse(response);

    expect(runSandboxMock).toHaveBeenCalledTimes(5);
    expect(parsed.success).toBe(true);
    expect(parsed.hashSource).toBe('structured');
    expect(parsed.consistency).toBe(100);
    expect(parsed.structuredFieldsUsed).toEqual(['stable']);
  });

  it('fails when structured fields diverge across runs', async () => {
    let call = 0;
    runSandboxMock.mockImplementation(() => {
      call += 1;
      return Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: JSON.stringify({ stable: call === 3 ? 'changed' : 'ok', ts: call }),
        stderr: '',
        durationMs: 5,
        method: 'native',
      });
    });

    const executor = buildExecutor();
    const response = await executor.guardianFlow({
      action: 'runDeterministic',
      command: 'echo',
      structuredFields: ['stable'],
    });
    const parsed = JSON.parse(response);

    expect(parsed.success).toBe(false);
    expect(parsed.hashSource).toBe('structured');
    expect(parsed.consistency).toBe(0);
    expect(parsed.message).toMatch(/Output mismatch/);
  });

  it('returns error when stdout is not valid JSON for structured comparison', async () => {
    runSandboxMock.mockResolvedValueOnce({
      success: true,
      exitCode: 0,
      stdout: 'not-json',
      stderr: '',
      durationMs: 1,
      method: 'native',
    });

    const executor = buildExecutor();
    const response = await executor.guardianFlow({
      action: 'runDeterministic',
      command: 'echo',
      structuredFields: ['stable'],
    });
    const parsed = JSON.parse(response);

    expect(parsed.success).toBe(false);
    expect(parsed.message).toMatch(/stdout não é JSON/i);
    expect(parsed.executions?.length || 0).toBe(0);
  });
});
