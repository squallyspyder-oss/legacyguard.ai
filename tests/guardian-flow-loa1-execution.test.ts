import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/audit', () => ({ __esModule: true, logEvent: vi.fn().mockResolvedValue(undefined) }));

const runSandboxMock = vi.fn();
vi.mock('@/lib/sandbox', () => ({ __esModule: true, runSandbox: runSandboxMock }));

// P0-4: Mock RBAC para permitir testes da API
vi.mock('@/lib/rbac', () => ({
  __esModule: true,
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, user: { email: 'test@test.com', role: 'admin' } }),
}));

describe('Guardian Flow API - LOA 1 execução real', () => {
  beforeEach(() => {
    vi.resetModules();
    runSandboxMock.mockReset();
  });

  async function post(body: any) {
    const { POST } = await import('@/app/api/guardian-flow/route');
    const req = new NextRequest('http://localhost/api/guardian-flow', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    const json = await res.json();
    return { res, json };
  }

  it('executa comando em sandbox quando allowAutoRun=true e LOA 1', async () => {
    runSandboxMock.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      durationMs: 10,
      method: 'docker',
    });

    const { res, json } = await post({
      intent: 'format documentation',
      options: {
        allowAutoRun: true,
        command: 'echo ok',
      },
    });

    expect(res.status).toBe(200);
    expect(json.status).toBe('completed');
    expect(json.result.output).toContain('ok');
    expect(runSandboxMock).toHaveBeenCalledTimes(1);
  });

  it('mantém dry-run quando allowAutoRun não está habilitado', async () => {
    runSandboxMock.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'should not run',
      stderr: '',
      durationMs: 10,
      method: 'docker',
    });

    const { res, json } = await post({
      intent: 'format documentation',
      options: {
        command: 'echo ok',
      },
    });

    expect(res.status).toBe(200);
    expect(json.result.output).toContain('Dry run');
    expect(runSandboxMock).not.toHaveBeenCalled();
  });

  it('propaga falha do sandbox para o resultado', async () => {
    runSandboxMock.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'boom',
      durationMs: 5,
      method: 'docker',
    });

    const { res, json } = await post({
      intent: 'format documentation',
      options: {
        allowAutoRun: true,
        command: 'exit 1',
      },
    });

    expect(res.status).toBe(200);
    expect(json.status).toBe('completed');
    expect(json.result.success).toBe(false);
    expect(json.result.output).toContain('boom');
    expect(runSandboxMock).toHaveBeenCalledTimes(1);
  });
});