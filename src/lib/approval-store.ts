/**
 * Approval Store - Sistema de Aprovações Persistente
 * 
 * Gerencia aprovações humanas para ações de LOA >= 2.
 * Persistência em arquivo JSON (em produção, usar banco de dados).
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// TIPOS
// ============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Approval {
  id: string;
  taskId?: string;
  intent: string;
  loaLevel: number;
  reason: string;
  requestedBy?: string;
  requestedAt: Date;
  expiresAt: Date;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: Date;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  intent: string;
  loaLevel: number;
  reason: string;
  requestedBy?: string;
  taskId?: string;
  expiresInMs?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const DEFAULT_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutos
const STORE_FILE = '.legacyguard/approvals.json';

// ============================================================================
// STORE EM MEMÓRIA + PERSISTÊNCIA
// ============================================================================

let store: Map<string, Approval> = new Map();
let storeDir: string = process.cwd();
let initialized = false;

/**
 * Retorna se o store já foi inicializado (útil para rotas evitar reinit desnecessário)
 */
export function isStoreInitialized(): boolean {
  return initialized;
}

/**
 * Inicializa o store de aprovações
 */
export async function initApprovalStore(baseDir?: string): Promise<void> {
  storeDir = baseDir || process.cwd();
  const storePath = path.join(storeDir, STORE_FILE);
  
  try {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const data = await fs.readFile(storePath, 'utf-8');
    const parsed = JSON.parse(data);
    
    store = new Map(
      Object.entries(parsed).map(([id, approval]) => {
        const a = approval as Approval;
        return [id, {
          ...a,
          requestedAt: new Date(a.requestedAt),
          expiresAt: new Date(a.expiresAt),
          decidedAt: a.decidedAt ? new Date(a.decidedAt) : undefined,
        }];
      })
    );
  } catch {
    // Arquivo não existe ou inválido - iniciar vazio
    store = new Map();
  }
  
  initialized = true;
}

/**
 * Persiste o store em disco
 */
async function persist(): Promise<void> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const storePath = path.join(storeDir, STORE_FILE);
  const obj: Record<string, Approval> = {};
  
  for (const [id, approval] of store) {
    obj[id] = approval;
  }
  
  await fs.writeFile(storePath, JSON.stringify(obj, null, 2), 'utf-8');
}

// ============================================================================
// OPERAÇÕES CRUD
// ============================================================================

/**
 * Gera um ID único para aprovação
 */
function generateApprovalId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `approval_${timestamp}_${random}`;
}

/**
 * Cria uma nova solicitação de aprovação
 */
export async function createApproval(request: ApprovalRequest): Promise<Approval> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (request.expiresInMs || DEFAULT_EXPIRATION_MS));
  
  const approval: Approval = {
    id: generateApprovalId(),
    taskId: request.taskId,
    intent: request.intent,
    loaLevel: request.loaLevel,
    reason: request.reason,
    requestedBy: request.requestedBy,
    requestedAt: now,
    expiresAt,
    status: 'pending',
    metadata: request.metadata,
  };
  
  store.set(approval.id, approval);
  await persist();
  
  return approval;
}

/**
 * Obtém uma aprovação por ID
 */
export async function getApproval(id: string): Promise<Approval | null> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const approval = store.get(id);
  if (!approval) return null;
  
  // Verificar expiração
  if (approval.status === 'pending' && new Date() > approval.expiresAt) {
    approval.status = 'expired';
    await persist();
  }
  
  return approval;
}

/**
 * Aprova uma solicitação
 */
export async function approveRequest(
  id: string,
  decidedBy: string,
  reason?: string
): Promise<Approval | null> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const approval = store.get(id);
  if (!approval) return null;
  
  // Não pode aprovar se já decidido ou expirado
  if (approval.status !== 'pending') {
    return approval; // Retorna estado atual
  }
  
  // Verificar expiração
  if (new Date() > approval.expiresAt) {
    approval.status = 'expired';
    await persist();
    return approval;
  }
  
  approval.status = 'approved';
  approval.decidedBy = decidedBy;
  approval.decidedAt = new Date();
  approval.decisionReason = reason;
  
  await persist();
  return approval;
}

/**
 * Rejeita uma solicitação
 */
export async function denyRequest(
  id: string,
  decidedBy: string,
  reason: string
): Promise<Approval | null> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const approval = store.get(id);
  if (!approval) return null;
  
  // Não pode negar se já decidido ou expirado
  if (approval.status !== 'pending') {
    return approval;
  }
  
  // Verificar expiração
  if (new Date() > approval.expiresAt) {
    approval.status = 'expired';
    await persist();
    return approval;
  }
  
  approval.status = 'denied';
  approval.decidedBy = decidedBy;
  approval.decidedAt = new Date();
  approval.decisionReason = reason;
  
  await persist();
  return approval;
}

/**
 * Lista todas as aprovações pendentes
 */
export async function listPendingApprovals(): Promise<Approval[]> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const now = new Date();
  const pending: Approval[] = [];
  
  for (const approval of store.values()) {
    if (approval.status === 'pending') {
      if (now > approval.expiresAt) {
        approval.status = 'expired';
      } else {
        pending.push(approval);
      }
    }
  }
  
  await persist();
  return pending;
}

/**
 * Valida se uma aprovação é válida para uso
 * Retorna true apenas se: existe, está approved, e não expirou
 */
export async function validateApproval(id: string): Promise<{
  valid: boolean;
  reason: string;
  approval?: Approval;
}> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const approval = await getApproval(id);
  
  if (!approval) {
    return { valid: false, reason: 'Aprovação não encontrada' };
  }
  
  if (approval.status === 'expired') {
    return { valid: false, reason: 'Aprovação expirada', approval };
  }
  
  if (approval.status === 'denied') {
    return { valid: false, reason: `Aprovação negada: ${approval.decisionReason}`, approval };
  }
  
  if (approval.status === 'pending') {
    return { valid: false, reason: 'Aprovação ainda pendente', approval };
  }
  
  if (approval.status === 'approved') {
    return { valid: true, reason: 'Aprovação válida', approval };
  }
  
  return { valid: false, reason: 'Estado de aprovação desconhecido', approval };
}

/**
 * Limpa aprovações expiradas antigas (mais de 24h)
 */
export async function cleanupExpired(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  if (!initialized) await initApprovalStore(storeDir);
  
  const cutoff = new Date(Date.now() - maxAgeMs);
  let cleaned = 0;
  
  for (const [id, approval] of store) {
    if (
      (approval.status === 'expired' || approval.status === 'denied') &&
      approval.requestedAt < cutoff
    ) {
      store.delete(id);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    await persist();
  }
  
  return cleaned;
}

/**
 * Reseta o store (para testes)
 */
export async function resetStore(): Promise<void> {
  store = new Map();
  initialized = false;
}
