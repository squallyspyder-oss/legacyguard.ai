import { describe, it, expect, vi, beforeEach } from 'vitest';

const runSandboxMock = vi.fn();

vi.mock('../src/lib/sandbox', () => ({
  runSandbox: runSandboxMock,
}));

async function createExecutor(guardianFlowEnabled: boolean) {
  const { createToolExecutor } = await import('../src/lib/tool-executors');

  return createToolExecutor({
    repoPath: process.cwd(),
    sandboxEnabled: true,
    sandboxMode: 'fail',
    workerEnabled: false,
    guardianFlowEnabled,
  });
}

describe('guardianFlow security bypass prevention', () => {
  beforeEach(() => {
    runSandboxMock.mockReset();
    vi.resetModules();
  });

  it('BLOQUEIA execução quando guardianFlowEnabled=false', async () => {
    const executor = await createExecutor(false);

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'classify', intent: 'format code' })
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('GUARDIAN_FLOW_DISABLED');
    expect(result.error).toContain('desabilitado');
  });

  it('NÃO retorna approved:true quando guardianFlowEnabled=false', async () => {
    const executor = await createExecutor(false);

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'classify', intent: 'format code' })
    );

    // Deve falhar, não aprovar silenciosamente
    expect(result.success).toBe(false);
    expect(result.result?.approved).toBeUndefined();
  });

  it('PERMITE execução quando guardianFlowEnabled=true', async () => {
    const executor = await createExecutor(true);

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'classify', intent: 'format code' })
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe('classify');
    expect(result.result).toBeDefined();
  });

  it('checkSafetyGates BLOQUEIA quando guardianFlowEnabled=false', async () => {
    const executor = await createExecutor(false);

    const result = JSON.parse(
      await executor.guardianFlow({ action: 'validateIntent', intent: 'delete files' })
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('GUARDIAN_FLOW_DISABLED');
  });
});
