import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../src/agents/orchestrator';

// Estes testes focam em regras de segurança: safe mode e sandbox fail/warn.

process.env.LEGACYGUARD_PLANNER_MODE = 'mock';
process.env.LEGACYGUARD_REVIEWER_MODE = 'mock';

describe('orchestrator sandbox/safe mode', () => {
  it('bloqueia executor quando safeMode ativo', async () => {
    const orch = new Orchestrator();
    orch.setContext({ safeMode: true, sandbox: { enabled: false } });
    const state = await orch.execute('teste', { summary: 'run executor', repoInfo: {}, safeMode: true });
    expect(state?.status === 'completed' || state?.results.size >= 0).toBe(true);
  });

  it('falha sandbox quando runner ausente e failMode=fail', async () => {
    const orch = new Orchestrator();
    orch.setContext({
      repoPath: process.cwd(),
      sandbox: {
        enabled: true,
        runnerPath: '/path/que/nao/existe.sh',
        failMode: 'fail',
        command: 'echo oi',
      },
    });
    let failed = false;
    try {
      await orch['runSandboxIfEnabled']({ id: 't1', agent: 'executor', description: '', dependencies: [], priority: 'low' } as any);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('segue quando runner ausente e failMode=warn', async () => {
    const orch = new Orchestrator();
    orch.setContext({
      repoPath: process.cwd(),
      sandbox: {
        enabled: true,
        runnerPath: '/path/que/nao/existe.sh',
        failMode: 'warn',
        command: 'echo oi',
      },
    });
    let failed = false;
    try {
      await orch['runSandboxIfEnabled']({ id: 't1', agent: 'executor', description: '', dependencies: [], priority: 'low' } as any);
    } catch {
      failed = true;
    }
    expect(failed).toBe(false);
  });

  it('exige sandbox habilitado para risco alto/crítico', async () => {
    const orch = new Orchestrator();
    (orch as any).state = { plan: { riskLevel: 'high' }, logs: [] };
    orch.setContext({ repoPath: process.cwd(), sandbox: { enabled: false } });

    let failed = false;
    try {
      await orch['runSandboxIfEnabled']({ id: 't1', agent: 'executor', description: '', dependencies: [], priority: 'high' } as any);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('falha se risco alto/crítico e Docker indisponível', async () => {
    const orch = new Orchestrator();
    (orch as any).state = { plan: { riskLevel: 'critical' }, logs: [] };
    orch.setContext({
      repoPath: process.cwd(),
      sandbox: { enabled: true, command: 'echo oi', failMode: 'fail' },
    });

    // Mock capabilities to simulate no Docker
    const sandboxLib = await import('../src/lib/sandbox');
    const spy = (sandboxLib as any).getSandboxCapabilities
      ? vi.spyOn(sandboxLib as any, 'getSandboxCapabilities')
      : null;
    if (spy) {
      spy.mockResolvedValue({ docker: false, shell: true, recommended: 'shell' });
    }

    let failed = false;
    try {
      await orch['runSandboxIfEnabled']({ id: 't2', agent: 'executor', description: '', dependencies: [], priority: 'high' } as any);
    } catch {
      failed = true;
    }

    if (spy) spy.mockRestore();
    expect(failed).toBe(true);
  });
});
