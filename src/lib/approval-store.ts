/**
 * Approval Store - Sistema de Aprovações Persistente
 * 
 * Gerencia aprovações humanas para ações de LOA >= 2.
 * 
 * CVE-LG-004: Implementação com fallback seguro
 * - Produção: OBRIGATÓRIO Redis ou PostgreSQL
 * - Desenvolvimento: Permite file-based (com warning)
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getRedis } from './queue';
import { RedisApprovalStore } from './approval-store-redis';

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
// INTERFACE ABSTRATA (CVE-LG-004)
// ============================================================================

/**
 * Interface para implementações de Approval Store
 * Permite troca de backend (Redis, PostgreSQL, File) de forma transparente
 */
export interface IApprovalStore {
  init(): Promise<void>;
  isInitialized(): boolean;
  create(request: ApprovalRequest): Promise<Approval>;
  get(id: string): Promise<Approval | null>;
  approve(id: string, decidedBy: string, reason?: string): Promise<Approval | null>;
  deny(id: string, decidedBy: string, reason: string): Promise<Approval | null>;
  listPending(): Promise<Approval[]>;
  validate(id: string): Promise<{ valid: boolean; reason: string; approval?: Approval }>;
  expireOld(maxAgeMs?: number): Promise<number>;
  reset(): Promise<void>;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const DEFAULT_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutos
const STORE_FILE = '.legacyguard/approvals.json';

// ============================================================================
// FACTORY & SINGLETON (CVE-LG-004)
// ============================================================================

let activeStore: IApprovalStore | null = null;
let storeType: 'redis' | 'file' | null = null;

/**
 * Obtém o store ativo (Redis em produção, File em dev)
 * CVE-LG-004: Em produção, FALHA se Redis não estiver disponível
 */
export async function getApprovalStore(): Promise<IApprovalStore> {
  if (activeStore && activeStore.isInitialized()) {
    return activeStore;
  }

  const redis = getRedis();
  const isProduction = process.env.NODE_ENV === 'production';

  if (redis) {
    // Redis disponível - usar RedisApprovalStore
    activeStore = new RedisApprovalStore(redis);
    await activeStore.init();
    storeType = 'redis';
    console.log('[ApprovalStore] Usando Redis para aprovações (distribuído)');
    return activeStore;
  }

  if (isProduction) {
    // CVE-LG-004: Em produção, NÃO permitir fallback para file-based
    throw new Error(
      '[ApprovalStore] ERRO CRÍTICO: Redis não disponível em produção. ' +
      'O approval store file-based não é seguro para ambientes multi-node. ' +
      'Configure REDIS_URL ou REDIS_TLS_URL.'
    );
  }

  // Desenvolvimento: permitir file-based com warning
  console.warn(
    '[ApprovalStore] ⚠️ ATENÇÃO: Usando file-based store (apenas para desenvolvimento). ' +
    'Configure REDIS_URL para comportamento de produção.'
  );
  
  activeStore = new FileApprovalStore();
  await activeStore.init();
  storeType = 'file';
  return activeStore;
}

/**
 * Retorna o tipo de store ativo
 */
export function getStoreType(): 'redis' | 'file' | null {
  return storeType;
}

// ============================================================================
// FILE APPROVAL STORE (Implementação Legacy - apenas para dev)
// ============================================================================

/**
 * Implementação file-based do IApprovalStore
 * ATENÇÃO: NÃO usar em produção - não é seguro para multi-node
 */
class FileApprovalStore implements IApprovalStore {
  private store: Map<string, Approval> = new Map();
  private storeDir: string = process.cwd();
  private initialized = false;

  async init(baseDir?: string): Promise<void> {
    this.storeDir = baseDir || process.cwd();
    const storePath = path.join(this.storeDir, STORE_FILE);
    
    try {
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      const data = await fs.readFile(storePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      this.store = new Map(
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
      this.store = new Map();
    }
    
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async persist(): Promise<void> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const storePath = path.join(this.storeDir, STORE_FILE);
    const obj: Record<string, Approval> = {};
    
    for (const [id, approval] of this.store) {
      obj[id] = approval;
    }
    
    await fs.writeFile(storePath, JSON.stringify(obj, null, 2), 'utf-8');
  }

  private generateApprovalId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `approval_${timestamp}_${random}`;
  }

  async create(request: ApprovalRequest): Promise<Approval> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (request.expiresInMs || DEFAULT_EXPIRATION_MS));
    
    const approval: Approval = {
      id: this.generateApprovalId(),
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
    
    this.store.set(approval.id, approval);
    await this.persist();
    
    return approval;
  }

  async get(id: string): Promise<Approval | null> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const approval = this.store.get(id);
    if (!approval) return null;
    
    if (approval.status === 'pending' && new Date() > approval.expiresAt) {
      approval.status = 'expired';
      await this.persist();
    }
    
    return approval;
  }

  async approve(id: string, decidedBy: string, reason?: string): Promise<Approval | null> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const approval = this.store.get(id);
    if (!approval) return null;
    
    if (approval.status !== 'pending') {
      return approval;
    }
    
    if (new Date() > approval.expiresAt) {
      approval.status = 'expired';
      await this.persist();
      return approval;
    }
    
    approval.status = 'approved';
    approval.decidedBy = decidedBy;
    approval.decidedAt = new Date();
    approval.decisionReason = reason;
    
    await this.persist();
    return approval;
  }

  async deny(id: string, decidedBy: string, reason: string): Promise<Approval | null> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const approval = this.store.get(id);
    if (!approval) return null;
    
    if (approval.status !== 'pending') {
      return approval;
    }
    
    if (new Date() > approval.expiresAt) {
      approval.status = 'expired';
      await this.persist();
      return approval;
    }
    
    approval.status = 'denied';
    approval.decidedBy = decidedBy;
    approval.decidedAt = new Date();
    approval.decisionReason = reason;
    
    await this.persist();
    return approval;
  }

  async listPending(): Promise<Approval[]> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const now = new Date();
    const pending: Approval[] = [];
    
    for (const approval of this.store.values()) {
      if (approval.status === 'pending') {
        if (now > approval.expiresAt) {
          approval.status = 'expired';
        } else {
          pending.push(approval);
        }
      }
    }
    
    await this.persist();
    return pending;
  }

  async validate(id: string): Promise<{ valid: boolean; reason: string; approval?: Approval }> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const approval = await this.get(id);
    
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

  async expireOld(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.initialized) await this.init(this.storeDir);
    
    const cutoff = new Date(Date.now() - maxAgeMs);
    let cleaned = 0;
    
    for (const [id, approval] of this.store) {
      if (
        (approval.status === 'expired' || approval.status === 'denied') &&
        approval.requestedAt < cutoff
      ) {
        this.store.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      await this.persist();
    }
    
    return cleaned;
  }

  async reset(): Promise<void> {
    this.store = new Map();
    this.initialized = false;
  }
}

// ============================================================================
// FUNÇÕES LEGADO (Compatibilidade com código existente)
// ============================================================================

// Store singleton para funções legado
let legacyStore: FileApprovalStore | null = null;

async function getLegacyStore(): Promise<FileApprovalStore> {
  if (!legacyStore) {
    legacyStore = new FileApprovalStore();
  }
  if (!legacyStore.isInitialized()) {
    await legacyStore.init();
  }
  return legacyStore;
}

// Variáveis legado para compatibilidade
let store: Map<string, Approval> = new Map();
let storeDir: string = process.cwd();
let initialized = false;

/**
 * @deprecated Use getApprovalStore().isInitialized() instead
 */
export function isStoreInitialized(): boolean {
  return initialized;
}

/**
 * @deprecated Use getApprovalStore().init() instead
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
