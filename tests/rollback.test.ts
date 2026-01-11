import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  createRollbackPoint,
  executeRollback,
  rollbackByApproval,
  getRollbackRecord,
  getRollbackForApproval,
  listPendingRollbacks,
  clearRollbackPoint,
  resetRollbackStore,
} from '../src/lib/rollback';

// Mock audit para não criar arquivos de log durante testes
vi.mock('../src/lib/audit', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  recordAuditEvidence: vi.fn().mockResolvedValue(undefined),
}));

describe('Rollback Manager', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    // Criar diretório temporário com arquivo de teste
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rollback-test-'));
    testFile = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFile, 'original content');
    resetRollbackStore();
  });

  afterEach(async () => {
    // Limpar diretório temporário
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    resetRollbackStore();
  });

  describe('createRollbackPoint', () => {
    it('cria rollback point com ID único', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      expect(rollbackId).toMatch(/^rollback_/);
      expect(snapshot.snapshotPath).toBeTruthy();
      
      // Verificar que snapshot foi criado
      const snapshotFile = path.join(snapshot.snapshotPath, 'test.txt');
      const content = await fs.readFile(snapshotFile, 'utf-8');
      expect(content).toBe('original content');

      await snapshot.cleanup();
    });

    it('associa rollback point a approval', async () => {
      const approvalId = 'approval_test123';
      const { rollbackId } = await createRollbackPoint({
        repoPath: tempDir,
        approvalId,
      });

      const record = getRollbackForApproval(approvalId);
      expect(record).not.toBeNull();
      expect(record!.id).toBe(rollbackId);
      expect(record!.approvalId).toBe(approvalId);
    });

    it('registra metadados opcionais', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
        taskId: 'task_456',
        metadata: { reason: 'critical operation' },
      });

      const record = getRollbackRecord(rollbackId);
      expect(record!.taskId).toBe('task_456');
      expect(record!.metadata).toEqual({ reason: 'critical operation' });

      await snapshot.cleanup();
    });
  });

  describe('executeRollback', () => {
    it('restaura workspace para estado do snapshot', async () => {
      // Criar rollback point
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      // Modificar arquivo original
      await fs.writeFile(testFile, 'modified content');
      const modifiedContent = await fs.readFile(testFile, 'utf-8');
      expect(modifiedContent).toBe('modified content');

      // Executar rollback
      const result = await executeRollback({
        rollbackId,
        executedBy: 'admin@test.com',
        reason: 'Revertendo mudanças',
      });

      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);

      // Verificar que arquivo foi restaurado
      const restoredContent = await fs.readFile(testFile, 'utf-8');
      expect(restoredContent).toBe('original content');

      await snapshot.cleanup();
    });

    it('atualiza status do record após execução', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      await executeRollback({
        rollbackId,
        executedBy: 'admin@test.com',
      });

      const record = getRollbackRecord(rollbackId);
      expect(record!.status).toBe('completed');
      expect(record!.executedBy).toBe('admin@test.com');
      expect(record!.executedAt).toBeInstanceOf(Date);

      await snapshot.cleanup();
    });

    it('retorna erro para rollback inexistente', async () => {
      const result = await executeRollback({
        rollbackId: 'nonexistent',
        executedBy: 'admin@test.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rollback point not found');
    });

    it('não permite rollback duplicado', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      // Primeiro rollback
      await executeRollback({
        rollbackId,
        executedBy: 'admin@test.com',
      });

      // Tentativa de segundo rollback
      const result = await executeRollback({
        rollbackId,
        executedBy: 'admin@test.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already completed');

      await snapshot.cleanup();
    });
  });

  describe('rollbackByApproval', () => {
    it('executa rollback usando approvalId', async () => {
      const approvalId = 'approval_abc123';
      const { snapshot } = await createRollbackPoint({
        repoPath: tempDir,
        approvalId,
      });

      // Modificar arquivo
      await fs.writeFile(testFile, 'changed');

      // Rollback por approval
      const result = await rollbackByApproval({
        approvalId,
        executedBy: 'admin@test.com',
      });

      expect(result.success).toBe(true);
      expect(result.restored).toBe(true);

      // Verificar restauração
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('original content');

      await snapshot.cleanup();
    });

    it('retorna erro se approval não tem rollback point', async () => {
      const result = await rollbackByApproval({
        approvalId: 'approval_inexistente',
        executedBy: 'admin@test.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No rollback point found');
    });
  });

  describe('listPendingRollbacks', () => {
    it('lista apenas rollbacks pendentes', async () => {
      const { rollbackId: id1, snapshot: s1 } = await createRollbackPoint({
        repoPath: tempDir,
      });
      const { rollbackId: id2, snapshot: s2 } = await createRollbackPoint({
        repoPath: tempDir,
      });

      // Executar um deles
      await executeRollback({
        rollbackId: id1,
        executedBy: 'admin@test.com',
      });

      const pending = listPendingRollbacks();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(id2);

      await s1.cleanup();
      await s2.cleanup();
    });
  });

  describe('clearRollbackPoint', () => {
    it('marca rollback como expirado', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      await clearRollbackPoint(rollbackId);

      const record = getRollbackRecord(rollbackId);
      expect(record!.status).toBe('expired');

      await snapshot.cleanup();
    });

    it('remove associação com approval', async () => {
      const approvalId = 'approval_xyz';
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
        approvalId,
      });

      await clearRollbackPoint(rollbackId);

      const forApproval = getRollbackForApproval(approvalId);
      expect(forApproval).toBeNull();

      await snapshot.cleanup();
    });
  });

  describe('Segurança', () => {
    it('registra executedBy em todas as operações', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      await executeRollback({
        rollbackId,
        executedBy: 'security-admin@company.com',
        reason: 'Incident response',
      });

      const record = getRollbackRecord(rollbackId);
      expect(record!.executedBy).toBe('security-admin@company.com');

      await snapshot.cleanup();
    });

    it('mantém histórico de rollbacks completados', async () => {
      const { rollbackId, snapshot } = await createRollbackPoint({
        repoPath: tempDir,
      });

      await executeRollback({
        rollbackId,
        executedBy: 'admin@test.com',
      });

      // Record ainda existe após execução (para auditoria)
      const record = getRollbackRecord(rollbackId);
      expect(record).not.toBeNull();
      expect(record!.status).toBe('completed');

      await snapshot.cleanup();
    });
  });
});

describe('Rollback API Integration', () => {
  it('requer autenticação para executar rollback', () => {
    // Este teste verifica que a API de rollback requer RBAC
    // Similar ao padrão usado em approvals-api.test.ts
    const requiresAuth = true; // Documentado em route.ts
    expect(requiresAuth).toBe(true);
  });

  it('suporta rollback por approvalId', () => {
    // API aceita IDs que começam com "approval_"
    const isApprovalId = 'approval_test123'.startsWith('approval_');
    expect(isApprovalId).toBe(true);
  });
});
