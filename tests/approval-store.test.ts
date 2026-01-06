import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  initApprovalStore,
  createApproval,
  getApproval,
  approveRequest,
  denyRequest,
  listPendingApprovals,
  validateApproval,
  cleanupExpired,
  resetStore,
} from '../src/lib/approval-store';

describe('Approval Store', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Criar diretório temporário para cada teste
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'approval-test-'));
    await resetStore();
    await initApprovalStore(tempDir);
  });

  afterEach(async () => {
    // Limpar diretório temporário
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('createApproval', () => {
    it('cria aprovação com ID único', async () => {
      const approval = await createApproval({
        intent: 'refactor auth module',
        loaLevel: 2,
        reason: 'Melhorar segurança',
        requestedBy: 'user@test.com',
      });

      expect(approval.id).toMatch(/^approval_/);
      expect(approval.intent).toBe('refactor auth module');
      expect(approval.loaLevel).toBe(2);
      expect(approval.status).toBe('pending');
      expect(approval.requestedAt).toBeInstanceOf(Date);
      expect(approval.expiresAt).toBeInstanceOf(Date);
    });

    it('define expiração padrão de 5 minutos', async () => {
      const before = Date.now();
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });
      const after = Date.now();

      const expirationMs = approval.expiresAt.getTime() - approval.requestedAt.getTime();
      expect(expirationMs).toBe(5 * 60 * 1000);
    });

    it('permite expiração customizada', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 3,
        reason: 'test',
        expiresInMs: 10 * 60 * 1000, // 10 minutos
      });

      const expirationMs = approval.expiresAt.getTime() - approval.requestedAt.getTime();
      expect(expirationMs).toBe(10 * 60 * 1000);
    });
  });

  describe('getApproval', () => {
    it('retorna aprovação existente', async () => {
      const created = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });

      const retrieved = await getApproval(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.intent).toBe('test');
    });

    it('retorna null para ID inexistente', async () => {
      const retrieved = await getApproval('nonexistent_id');
      expect(retrieved).toBeNull();
    });

    it('marca como expirada automaticamente', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
        expiresInMs: 1, // 1ms - expira imediatamente
      });

      // Aguardar expiração
      await new Promise(resolve => setTimeout(resolve, 10));

      const retrieved = await getApproval(approval.id);
      expect(retrieved!.status).toBe('expired');
    });
  });

  describe('approveRequest', () => {
    it('aprova solicitação pendente', async () => {
      const approval = await createApproval({
        intent: 'deploy',
        loaLevel: 3,
        reason: 'Deploy para produção',
      });

      const approved = await approveRequest(approval.id, 'admin@test.com', 'Looks good');

      expect(approved!.status).toBe('approved');
      expect(approved!.decidedBy).toBe('admin@test.com');
      expect(approved!.decisionReason).toBe('Looks good');
      expect(approved!.decidedAt).toBeInstanceOf(Date);
    });

    it('não aprova se já decidida', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });

      await approveRequest(approval.id, 'user1', 'first');
      const second = await approveRequest(approval.id, 'user2', 'second');

      // Deve manter a primeira decisão
      expect(second!.decidedBy).toBe('user1');
    });

    it('não aprova se expirada', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
        expiresInMs: 1,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await approveRequest(approval.id, 'admin');
      expect(result!.status).toBe('expired');
    });
  });

  describe('denyRequest', () => {
    it('rejeita solicitação pendente', async () => {
      const approval = await createApproval({
        intent: 'delete database',
        loaLevel: 4,
        reason: 'Cleanup',
      });

      const denied = await denyRequest(approval.id, 'security@test.com', 'Too risky');

      expect(denied!.status).toBe('denied');
      expect(denied!.decidedBy).toBe('security@test.com');
      expect(denied!.decisionReason).toBe('Too risky');
    });

    it('requer motivo para rejeição', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });

      const denied = await denyRequest(approval.id, 'admin', 'Motivo obrigatório');
      expect(denied!.decisionReason).toBe('Motivo obrigatório');
    });
  });

  describe('listPendingApprovals', () => {
    it('lista apenas aprovações pendentes', async () => {
      await createApproval({ intent: 'pending1', loaLevel: 2, reason: 'test' });
      await createApproval({ intent: 'pending2', loaLevel: 2, reason: 'test' });
      
      const approved = await createApproval({ intent: 'approved', loaLevel: 2, reason: 'test' });
      await approveRequest(approved.id, 'admin');

      const pending = await listPendingApprovals();
      expect(pending.length).toBe(2);
      expect(pending.map(p => p.intent)).toContain('pending1');
      expect(pending.map(p => p.intent)).toContain('pending2');
      expect(pending.map(p => p.intent)).not.toContain('approved');
    });
  });

  describe('validateApproval', () => {
    it('retorna valid=true para aprovação aprovada', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });
      await approveRequest(approval.id, 'admin');

      const validation = await validateApproval(approval.id);
      expect(validation.valid).toBe(true);
      expect(validation.reason).toBe('Aprovação válida');
    });

    it('retorna valid=false para aprovação pendente', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });

      const validation = await validateApproval(approval.id);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('pendente');
    });

    it('retorna valid=false para aprovação negada', async () => {
      const approval = await createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'test',
      });
      await denyRequest(approval.id, 'admin', 'Negado por segurança');

      const validation = await validateApproval(approval.id);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Negado por segurança');
    });

    it('retorna valid=false para ID inexistente', async () => {
      const validation = await validateApproval('fake_id');
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('não encontrada');
    });
  });

  describe('persistência', () => {
    it('persiste aprovações em disco', async () => {
      const approval = await createApproval({
        intent: 'persist test',
        loaLevel: 2,
        reason: 'test',
      });

      // Reinicializar store
      await resetStore();
      await initApprovalStore(tempDir);

      const retrieved = await getApproval(approval.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.intent).toBe('persist test');
    });

    it('persiste decisões', async () => {
      const approval = await createApproval({
        intent: 'decision test',
        loaLevel: 2,
        reason: 'test',
      });
      await approveRequest(approval.id, 'admin', 'Approved');

      await resetStore();
      await initApprovalStore(tempDir);

      const retrieved = await getApproval(approval.id);
      expect(retrieved!.status).toBe('approved');
      expect(retrieved!.decidedBy).toBe('admin');
    });
  });

  describe('cleanupExpired', () => {
    it('remove aprovações expiradas antigas', async () => {
      // Criar aprovação que expira imediatamente
      const approval = await createApproval({
        intent: 'old',
        loaLevel: 2,
        reason: 'test',
        expiresInMs: 1,
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Marcar como expirada
      await getApproval(approval.id);

      // Limpar com maxAge de 1ms (tudo é "antigo")
      const cleaned = await cleanupExpired(1);
      expect(cleaned).toBe(1);

      // Verificar que foi removida
      const retrieved = await getApproval(approval.id);
      expect(retrieved).toBeNull();
    });
  });
});
