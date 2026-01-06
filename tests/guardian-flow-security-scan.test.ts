import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock do sandbox para isolar testes
const runSandboxMock = vi.fn();

vi.mock('../src/lib/sandbox', () => ({
  runSandbox: runSandboxMock,
}));

// Mock de child_process.exec para controlar Docker check e Semgrep
vi.mock('child_process', () => {
  const mockExec = vi.fn((cmd: string, _opts: unknown, callback?: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
    // Se é o check de Docker version
    if (cmd.includes('docker version')) {
      if (callback) {
        // Simular Docker indisponível
        callback(new Error('Cannot connect to Docker daemon'));
      }
      return {};
    }
    // Para outros comandos (semgrep), também falhar
    if (callback) {
      callback(new Error('Docker command failed'));
    }
    return {};
  });

  return {
    exec: mockExec,
  };
});

async function createExecutor() {
  const { createToolExecutor } = await import('../src/lib/tool-executors');

  return createToolExecutor({
    repoPath: process.cwd(),
    sandboxEnabled: true,
    sandboxMode: 'fail',
    workerEnabled: false,
    guardianFlowEnabled: true,
  });
}

describe('checkSafetyGates - security scan real', () => {
  beforeEach(() => {
    runSandboxMock.mockReset();
    vi.resetModules();
  });

  it('security_scan mostra mensagem de falha quando Docker indisponível', async () => {
    const executor = await createExecutor();

    // Intent de LOA 2+ que requer security scan
    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'refactor authentication module',
        affectedFiles: ['src/auth.ts'],
        loaLevel: 2,
      })
    );

    expect(result.success).toBe(true);
    const securityGate = result.gates.find((g: { name: string }) => g.name === 'security_scan');
    expect(securityGate).toBeDefined();
    // Sem Docker, scan falha
    expect(securityGate.passed).toBe(false);
    expect(securityGate.message).toContain('falhou');
  });

  it('LOA 1 não executa security scan (não requerido)', async () => {
    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'format code',
        affectedFiles: ['src/utils.ts'],
        loaLevel: 1,
      })
    );

    expect(result.success).toBe(true);
    // LOA 1 não requer security scan, então não deve ter esse gate
    const securityGate = result.gates.find((g: { name: string }) => g.name === 'security_scan');
    expect(securityGate).toBeUndefined();
  });

  it('allPassed é false quando security_scan falha', async () => {
    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'modify database schema',
        affectedFiles: ['migrations/001.sql'],
        loaLevel: 2,
      })
    );

    // Security scan falha = gate falha
    const securityGate = result.gates.find((g: { name: string }) => g.name === 'security_scan');
    expect(securityGate?.passed).toBe(false);
    // allPassed considera todos os gates
    expect(result.allPassed).toBe(false);
  });

  it('mensagem NÃO é hardcoded quando security scan falha', async () => {
    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'deploy to production',
        affectedFiles: ['src/main.ts'],
        loaLevel: 3,
      })
    );

    const securityGate = result.gates.find((g: { name: string }) => g.name === 'security_scan');
    expect(securityGate).toBeDefined();
    // Mensagem NÃO deve ser o hardcoded antigo
    expect(securityGate.message).not.toBe('Security scan aprovado - nenhuma vulnerabilidade crítica');
    // Deve indicar falha real
    expect(securityGate.message.toLowerCase()).toMatch(/falhou|indisponível|docker/);
  });
});
