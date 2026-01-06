import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock do sandbox para isolar testes
const runSandboxMock = vi.fn();

vi.mock('../src/lib/sandbox', () => ({
  runSandbox: runSandboxMock,
}));

// Mock de child_process.exec
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, _opts: unknown, callback?: (err: Error | null) => void) => {
    if (callback) callback(new Error('Docker mocked'));
    return {};
  }),
}));

describe('guardianFlow approval integration', () => {
  let tempDir: string;
  let executor: Awaited<ReturnType<typeof createExecutor>>;
  let approvalStore: typeof import('../src/lib/approval-store');

  async function createExecutor() {
    const { createToolExecutor } = await import('../src/lib/tool-executors');

    return createToolExecutor({
      repoPath: tempDir,
      sandboxEnabled: true,
      sandboxMode: 'fail',
      workerEnabled: false,
      guardianFlowEnabled: true,
      userId: 'test-user',
    });
  }

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'approval-integration-'));
    vi.resetModules();
    
    // Importar approval-store DEPOIS de resetModules para ter instância limpa
    approvalStore = await import('../src/lib/approval-store');
    await approvalStore.resetStore();
    await approvalStore.initApprovalStore(tempDir);
    
    executor = await createExecutor();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('requestApproval', () => {
    it('cria aprovação real no store', async () => {
      const result = JSON.parse(
        await executor.guardianFlow({
          action: 'requestApproval',
          intent: 'deploy to production',
          reason: 'Release v1.0',
        })
      );

      expect(result.success).toBe(true);
      expect(result.approvalId).toMatch(/^approval_/);
      expect(result.status).toBe('pending');
      expect(result.expiresAt).toBeDefined();
    });

    it('approvalId pode ser validado', async () => {
      // Criar aprovação
      const createResult = JSON.parse(
        await executor.guardianFlow({
          action: 'requestApproval',
          intent: 'modify database',
          reason: 'Schema migration',
        })
      );

      // Validar antes de aprovar
      const validateResult = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: createResult.approvalId,
        })
      );

      expect(validateResult.valid).toBe(false);
      expect(validateResult.reason).toContain('pendente');
    });
  });

  describe('validateApproval', () => {
    it('retorna valid=true após aprovação', async () => {
      // Criar aprovação
      const createResult = JSON.parse(
        await executor.guardianFlow({
          action: 'requestApproval',
          intent: 'update auth',
          reason: 'Security patch',
        })
      );

      // Aprovar externamente
      await approvalStore.approveRequest(createResult.approvalId, 'admin@test.com', 'Approved');

      // Validar após aprovar
      const validateResult = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: createResult.approvalId,
        })
      );

      expect(validateResult.valid).toBe(true);
      expect(validateResult.approval.status).toBe('approved');
      expect(validateResult.approval.decidedBy).toBe('admin@test.com');
    });

    it('retorna valid=false após rejeição', async () => {
      // Criar aprovação
      const createResult = JSON.parse(
        await executor.guardianFlow({
          action: 'requestApproval',
          intent: 'delete users',
          reason: 'Cleanup',
        })
      );

      // Rejeitar externamente
      await approvalStore.denyRequest(createResult.approvalId, 'security@test.com', 'Too dangerous');

      // Validar após rejeitar
      const validateResult = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: createResult.approvalId,
        })
      );

      expect(validateResult.valid).toBe(false);
      expect(validateResult.reason).toContain('Too dangerous');
      expect(validateResult.approval.status).toBe('denied');
    });

    it('retorna valid=false para ID inexistente', async () => {
      const result = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: 'fake_approval_id',
        })
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('não encontrada');
    });

    it('requer approvalId', async () => {
      const result = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: '',
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('obrigatório');
    });
  });

  describe('fluxo completo', () => {
    it('bloqueia execução sem aprovação válida', async () => {
      // 1. Solicitar aprovação
      const requestResult = JSON.parse(
        await executor.guardianFlow({
          action: 'requestApproval',
          intent: 'critical operation',
          reason: 'Needs human oversight',
        })
      );

      // 2. Tentar validar (ainda pendente)
      const validation1 = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: requestResult.approvalId,
        })
      );

      expect(validation1.valid).toBe(false);

      // 3. Aprovar
      await approvalStore.approveRequest(requestResult.approvalId, 'manager');

      // 4. Validar novamente (agora aprovado)
      const validation2 = JSON.parse(
        await executor.guardianFlow({
          action: 'validateApproval',
          intent: requestResult.approvalId,
        })
      );

      expect(validation2.valid).toBe(true);
    });
  });
});
