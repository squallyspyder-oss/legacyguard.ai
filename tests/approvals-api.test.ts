/**
 * Testes para API de Approvals
 * 
 * Verifica:
 * - GET /api/approvals - listar pendentes
 * - GET /api/approvals/[id] - obter detalhes
 * - POST /api/approvals/[id] - aprovar/rejeitar
 * - SEGURANÇA: autenticação obrigatória (CVE-LG-001)
 * - SEGURANÇA: decidedBy da sessão (CVE-LG-003)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock audit para não precisar de DB
vi.mock('@/lib/audit', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock RBAC - simula usuário autenticado por padrão
const mockRequirePermission = vi.fn();
vi.mock('@/lib/rbac', () => ({
  requirePermission: () => mockRequirePermission(),
}));

describe('Approvals API', () => {
  let tempDir: string;
  let listRoute: typeof import('@/app/api/approvals/route');
  let detailRoute: typeof import('@/app/api/approvals/[id]/route');
  let approvalStore: typeof import('@/lib/approval-store');
  
  beforeEach(async () => {
    vi.resetModules();
    
    // Por padrão, simular usuário autenticado com permissão
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      role: 'admin',
      user: { email: 'admin@test.com', name: 'Admin User' },
    });
    
    // Criar diretório temporário para testes
    tempDir = path.join(process.cwd(), '.test-approvals-api-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    
    // Importar módulos frescos
    approvalStore = await import('@/lib/approval-store');
    await approvalStore.initApprovalStore(tempDir);
    
    // Importar rotas
    listRoute = await import('@/app/api/approvals/route');
    detailRoute = await import('@/app/api/approvals/[id]/route');
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
  
  type SafeRequestInit = Omit<RequestInit, 'signal'> & { signal?: AbortSignal };

  // Helper para criar Request mock
  function createRequest(url: string, options: SafeRequestInit = {}): NextRequest {
    const { signal, ...rest } = options;
    const safeOptions: SafeRequestInit = { ...rest, signal: signal || undefined };
    return new NextRequest(new URL(url, 'http://localhost:3000'), safeOptions);
  }

  // ==========================================================================
  // TESTES DE SEGURANÇA - CVE-LG-001: Autenticação obrigatória
  // ==========================================================================
  
  describe('SEGURANÇA: Autenticação obrigatória (CVE-LG-001)', () => {
    it('GET /api/approvals retorna 401/403 sem sessão', async () => {
      // Simular usuário não autenticado
      mockRequirePermission.mockResolvedValue({
        authorized: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });
      
      const request = createRequest('/api/approvals');
      const response = await listRoute.GET(request);
      
      expect(response.status).toBe(401);
    });
    
    it('GET /api/approvals/[id] retorna 401/403 sem sessão', async () => {
      mockRequirePermission.mockResolvedValue({
        authorized: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });
      
      const request = createRequest('/api/approvals/test-id');
      const response = await detailRoute.GET(request, { 
        params: Promise.resolve({ id: 'test-id' }) 
      });
      
      expect(response.status).toBe(401);
    });
    
    it('POST /api/approvals/[id] retorna 401/403 sem sessão', async () => {
      mockRequirePermission.mockResolvedValue({
        authorized: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });
      
      const request = createRequest('/api/approvals/test-id', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
      });
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: 'test-id' }) 
      });
      
      expect(response.status).toBe(401);
    });
    
    it('POST /api/approvals/[id] usa email da sessão como decidedBy (CVE-LG-003)', async () => {
      // Criar aprovação pendente
      const approval = await approvalStore.createApproval({
        intent: 'file_modify',
        loaLevel: 3,
        reason: 'Test',
        requestedBy: 'agent',
      });
      
      // Requisição com decidedBy falso no body (deve ser IGNORADO)
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'approve',
          decidedBy: 'attacker@evil.com', // Este deve ser IGNORADO
          reason: 'Approved',
        }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // decidedBy deve vir da sessão mockada (admin@test.com), não do body
      expect(data.approval.decidedBy).toBe('admin@test.com');
    });
  });
  
  // ==========================================================================
  // GET /api/approvals - Listar pendentes
  // ==========================================================================
  
  describe('GET /api/approvals', () => {
    it('retorna lista vazia quando não há aprovações', async () => {
      const request = createRequest('/api/approvals');
      const response = await listRoute.GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(0);
      expect(data.approvals).toEqual([]);
    });
    
    it('retorna aprovações pendentes', async () => {
      // Criar algumas aprovações
      await approvalStore.createApproval({
        intent: 'file_modify',
        loaLevel: 3,
        reason: 'Modificar arquivo crítico',
        requestedBy: 'agent-1',
      });
      
      await approvalStore.createApproval({
        intent: 'execute_command',
        loaLevel: 4,
        reason: 'Executar script',
        requestedBy: 'agent-2',
      });
      
      const request = createRequest('/api/approvals');
      const response = await listRoute.GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);
      expect(data.approvals).toHaveLength(2);
      expect(data.approvals[0]).toHaveProperty('timeRemaining');
    });
    
    it('cleanup=true remove expiradas antes de listar', async () => {
      // Criar aprovação com expiração curta
      await approvalStore.createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'Test',
        requestedBy: 'agent',
        expiresInMs: -1000, // Já expirada
      });
      
      const request = createRequest('/api/approvals?cleanup=true');
      const response = await listRoute.GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // Após cleanup, expiradas são removidas da lista de pendentes
      expect(data.count).toBe(0);
    });
  });
  
  // ==========================================================================
  // GET /api/approvals/[id] - Obter detalhes
  // ==========================================================================
  
  describe('GET /api/approvals/[id]', () => {
    it('retorna 404 para ID inexistente', async () => {
      const request = createRequest('/api/approvals/non-existent');
      const response = await detailRoute.GET(request, { 
        params: Promise.resolve({ id: 'non-existent' }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.code).toBe('NOT_FOUND');
    });
    
    it('retorna detalhes da aprovação existente', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'file_delete',
        loaLevel: 4,
        reason: 'Deletar arquivo legacy',
        requestedBy: 'agent-test',
      });
      
      const request = createRequest(`/api/approvals/${approval.id}`);
      const response = await detailRoute.GET(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.approval.id).toBe(approval.id);
      expect(data.approval.intent).toBe('file_delete');
      expect(data.approval.loaLevel).toBe(4);
      expect(data.approval.status).toBe('pending');
      expect(data.approval.requestedBy).toBe('agent-test');
    });
  });
  
  // ==========================================================================
  // POST /api/approvals/[id] - Aprovar/Rejeitar
  // ==========================================================================
  
  describe('POST /api/approvals/[id]', () => {
    it('requer action válido', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'Test',
        requestedBy: 'agent',
      });
      
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'invalid' }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_ACTION');
    });
    
    it('requer action válida (decidedBy vem da sessão)', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'Test',
        requestedBy: 'agent',
      });
      
      // Enviar sem action - deve falhar
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_ACTION');
    });
    
    it('rejeição requer reason', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'Test',
        requestedBy: 'agent',
      });
      
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject' }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('MISSING_REASON');
    });
    
    it('aprova com sucesso', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'file_modify',
        loaLevel: 3,
        reason: 'Modificar config',
        requestedBy: 'agent-1',
      });
      
      // decidedBy no body é IGNORADO - vem da sessão
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'approve', 
          reason: 'Aprovado após revisão',
        }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.approval.status).toBe('approved');
      // decidedBy vem da sessão mockada, não do body
      expect(data.approval.decidedBy).toBe('admin@test.com');
    });
    
    it('rejeita com sucesso', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'execute_command',
        loaLevel: 4,
        reason: 'Executar rm -rf',
        requestedBy: 'agent-1',
      });
      
      // decidedBy no body é IGNORADO - vem da sessão
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'reject', 
          reason: 'Comando muito perigoso',
        }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.approval.status).toBe('denied');
      // decidedBy vem da sessão mockada
      expect(data.approval.decidedBy).toBe('admin@test.com');
    });
    
    it('retorna 409 se já foi decidida', async () => {
      const approval = await approvalStore.createApproval({
        intent: 'test',
        loaLevel: 2,
        reason: 'Test',
        requestedBy: 'agent',
      });
      
      // Aprovar primeiro
      await approvalStore.approveRequest(approval.id, 'first-admin');
      
      // Tentar aprovar novamente (decidedBy no body é ignorado)
      const request = createRequest(`/api/approvals/${approval.id}`, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'approve', 
        }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: approval.id }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(409);
      expect(data.code).toBe('ALREADY_DECIDED');
      expect(data.approval.status).toBe('approved');
    });
    
    it('retorna 404 para ID inexistente', async () => {
      const request = createRequest(`/api/approvals/non-existent`, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'approve', 
        }),
      });
      
      const response = await detailRoute.POST(request, { 
        params: Promise.resolve({ id: 'non-existent' }) 
      });
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.code).toBe('NOT_FOUND');
    });
  });
});
