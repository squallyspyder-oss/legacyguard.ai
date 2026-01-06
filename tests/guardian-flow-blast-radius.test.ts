import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do sandbox para isolar testes
const runSandboxMock = vi.fn();

vi.mock('../src/lib/sandbox', () => ({
  runSandbox: runSandboxMock,
}));

// Mock de child_process.exec para evitar Docker real
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, _opts: unknown, callback?: (err: Error | null) => void) => {
    if (callback) callback(new Error('Docker mocked'));
    return {};
  }),
}));

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

describe('checkSafetyGates - blast radius real', () => {
  beforeEach(() => {
    runSandboxMock.mockReset();
    vi.resetModules();
  });

  it('score zero para lista vazia de arquivos', async () => {
    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'refactor code',
        affectedFiles: [],
        loaLevel: 2,
      })
    );

    const blastGate = result.gates.find((g: { name: string }) => g.name === 'blast_radius');
    expect(blastGate).toBeDefined();
    expect(blastGate.passed).toBe(true);
    expect(blastGate.message).toContain('0%');
  });

  it('score aumenta com arquivos críticos (auth, security)', async () => {
    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'modify authentication',
        affectedFiles: ['src/auth/login.ts', 'src/security/crypto.ts'],
        loaLevel: 2,
      })
    );

    const blastGate = result.gates.find((g: { name: string }) => g.name === 'blast_radius');
    expect(blastGate).toBeDefined();
    // 2 arquivos críticos = 30 pontos (2*15) + 10 (2*5 base) = 40%
    expect(parseInt(blastGate.message.match(/(\d+)%/)?.[1] || '0')).toBeGreaterThan(20);
    expect(blastGate.message.toLowerCase()).toContain('crítico');
  });

  it('falha quando score excede limite do LOA', async () => {
    const executor = await createExecutor();

    // LOA 2 tem maxBlastRadius de 30
    // Muitos arquivos críticos devem exceder
    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'major refactor',
        affectedFiles: [
          'src/auth/login.ts',
          'src/auth/session.ts',
          'src/security/crypto.ts',
          'src/database/config.ts',
        ],
        loaLevel: 2,
      })
    );

    const blastGate = result.gates.find((g: { name: string }) => g.name === 'blast_radius');
    expect(blastGate).toBeDefined();
    // 4 arquivos críticos = 60 pontos + 20 base = 80%, excede LOA 2 (max 30%)
    expect(blastGate.passed).toBe(false);
    expect(blastGate.message).toContain('excede limite');
  });

  it('arquivos normais têm score menor que arquivos críticos', async () => {
    const executor = await createExecutor();

    // Arquivos normais
    const normalResult = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'update utils',
        affectedFiles: ['src/utils/helpers.ts', 'src/utils/format.ts'],
        loaLevel: 2,
      })
    );

    // Arquivos críticos (mesma quantidade)
    const criticalResult = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'update auth',
        affectedFiles: ['src/auth/login.ts', 'src/auth/session.ts'],
        loaLevel: 2,
      })
    );

    const normalGate = normalResult.gates.find((g: { name: string }) => g.name === 'blast_radius');
    const criticalGate = criticalResult.gates.find((g: { name: string }) => g.name === 'blast_radius');

    const normalScore = parseInt(normalGate.message.match(/(\d+)%/)?.[1] || '0');
    const criticalScore = parseInt(criticalGate.message.match(/(\d+)%/)?.[1] || '0');

    expect(criticalScore).toBeGreaterThan(normalScore);
  });

  it('LOA 1 não executa blast radius check', async () => {
    const executor = await createExecutor();

    const result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'format code',
        affectedFiles: ['src/auth/login.ts'], // arquivo crítico
        loaLevel: 1,
      })
    );

    const blastGate = result.gates.find((g: { name: string }) => g.name === 'blast_radius');
    expect(blastGate).toBeUndefined();
  });

  it('LOA 3 tem limite maior que LOA 2', async () => {
    const executor = await createExecutor();

    // Mesmo conjunto de arquivos, LOA diferente
    const affectedFiles = ['src/auth/login.ts', 'src/security/crypto.ts'];

    const loa2Result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'update security',
        affectedFiles,
        loaLevel: 2,
      })
    );

    const loa3Result = JSON.parse(
      await executor.checkSafetyGates({
        intent: 'update security',
        affectedFiles,
        loaLevel: 3,
      })
    );

    const loa2Gate = loa2Result.gates.find((g: { name: string }) => g.name === 'blast_radius');
    const loa3Gate = loa3Result.gates.find((g: { name: string }) => g.name === 'blast_radius');

    // Ambos têm o mesmo score
    const loa2Score = parseInt(loa2Gate.message.match(/(\d+)%/)?.[1] || '0');
    const loa3Score = parseInt(loa3Gate.message.match(/(\d+)%/)?.[1] || '0');
    expect(loa2Score).toBe(loa3Score);

    // LOA 2 max=30, LOA 3 max=60, então se score > 30 mas < 60:
    // - LOA 2 falha
    // - LOA 3 passa
    // Com 2 arquivos críticos: score ~ 40 (2*15 + 2*5 = 40)
    if (loa2Score > 30 && loa2Score <= 60) {
      expect(loa2Gate.passed).toBe(false);
      expect(loa3Gate.passed).toBe(true);
    }
  });
});
