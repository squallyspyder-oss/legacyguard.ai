/**
 * Redis Approval Store - Implementação distribuída de aprovações
 * 
 * CVE-LG-004: Migração do file-based store para Redis
 * Garante consistência em ambientes multi-node.
 */

import type Redis from 'ioredis';
import crypto from 'crypto';
import type { Approval, ApprovalRequest, ApprovalStatus, IApprovalStore } from './approval-store';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const REDIS_KEY_PREFIX = 'approval:';
const REDIS_PENDING_SET = 'approvals:pending';
const DEFAULT_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutos
const APPROVAL_TTL_SECONDS = 24 * 60 * 60; // 24 horas para limpeza automática

// ============================================================================
// REDIS APPROVAL STORE
// ============================================================================

export class RedisApprovalStore implements IApprovalStore {
  private redis: Redis;
  private initialized = false;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async init(): Promise<void> {
    // Verificar conexão Redis
    try {
      await this.redis.ping();
      this.initialized = true;
    } catch (err) {
      throw new Error(`[RedisApprovalStore] Falha ao conectar ao Redis: ${err}`);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gera um ID único para aprovação
   */
  private generateApprovalId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `approval_${timestamp}_${random}`;
  }

  /**
   * Serializa uma aprovação para armazenamento no Redis
   */
  private serialize(approval: Approval): string {
    return JSON.stringify({
      ...approval,
      requestedAt: approval.requestedAt.toISOString(),
      expiresAt: approval.expiresAt.toISOString(),
      decidedAt: approval.decidedAt?.toISOString(),
    });
  }

  /**
   * Deserializa uma aprovação do Redis
   */
  private deserialize(data: string): Approval {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      requestedAt: new Date(parsed.requestedAt),
      expiresAt: new Date(parsed.expiresAt),
      decidedAt: parsed.decidedAt ? new Date(parsed.decidedAt) : undefined,
    };
  }

  /**
   * Retorna a chave Redis para uma aprovação
   */
  private key(id: string): string {
    return `${REDIS_KEY_PREFIX}${id}`;
  }

  async create(request: ApprovalRequest): Promise<Approval> {
    if (!this.initialized) await this.init();

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

    const key = this.key(approval.id);
    
    // Usar transação para garantir atomicidade
    const pipeline = this.redis.pipeline();
    pipeline.set(key, this.serialize(approval), 'EX', APPROVAL_TTL_SECONDS);
    pipeline.sadd(REDIS_PENDING_SET, approval.id);
    await pipeline.exec();

    return approval;
  }

  async get(id: string): Promise<Approval | null> {
    if (!this.initialized) await this.init();

    const data = await this.redis.get(this.key(id));
    if (!data) return null;

    const approval = this.deserialize(data);

    // Verificar expiração
    if (approval.status === 'pending' && new Date() > approval.expiresAt) {
      approval.status = 'expired';
      await this.updateStatus(approval);
    }

    return approval;
  }

  async approve(id: string, decidedBy: string, reason?: string): Promise<Approval | null> {
    if (!this.initialized) await this.init();

    const approval = await this.get(id);
    if (!approval) return null;

    // Não pode aprovar se já decidido ou expirado
    if (approval.status !== 'pending') {
      return approval;
    }

    // Verificar expiração
    if (new Date() > approval.expiresAt) {
      approval.status = 'expired';
      await this.updateStatus(approval);
      return approval;
    }

    approval.status = 'approved';
    approval.decidedBy = decidedBy;
    approval.decidedAt = new Date();
    approval.decisionReason = reason;

    await this.updateStatus(approval);
    return approval;
  }

  async deny(id: string, decidedBy: string, reason: string): Promise<Approval | null> {
    if (!this.initialized) await this.init();

    const approval = await this.get(id);
    if (!approval) return null;

    // Não pode negar se já decidido ou expirado
    if (approval.status !== 'pending') {
      return approval;
    }

    // Verificar expiração
    if (new Date() > approval.expiresAt) {
      approval.status = 'expired';
      await this.updateStatus(approval);
      return approval;
    }

    approval.status = 'denied';
    approval.decidedBy = decidedBy;
    approval.decidedAt = new Date();
    approval.decisionReason = reason;

    await this.updateStatus(approval);
    return approval;
  }

  async listPending(): Promise<Approval[]> {
    if (!this.initialized) await this.init();

    const pendingIds = await this.redis.smembers(REDIS_PENDING_SET);
    const now = new Date();
    const pending: Approval[] = [];
    const expiredIds: string[] = [];

    for (const id of pendingIds) {
      const approval = await this.get(id);
      if (!approval) {
        // Aprovação não existe mais, remover do set
        expiredIds.push(id);
        continue;
      }

      if (approval.status === 'pending') {
        if (now > approval.expiresAt) {
          approval.status = 'expired';
          await this.updateStatus(approval);
          expiredIds.push(id);
        } else {
          pending.push(approval);
        }
      } else {
        // Não está mais pendente, remover do set
        expiredIds.push(id);
      }
    }

    // Limpar IDs expirados do set de pendentes
    if (expiredIds.length > 0) {
      await this.redis.srem(REDIS_PENDING_SET, ...expiredIds);
    }

    return pending;
  }

  async validate(id: string): Promise<{ valid: boolean; reason: string; approval?: Approval }> {
    if (!this.initialized) await this.init();

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
    // Redis TTL já gerencia isso automaticamente
    // Este método é mantido para compatibilidade com a interface
    // Mas podemos fazer uma limpeza manual do set de pendentes
    if (!this.initialized) await this.init();

    const pendingIds = await this.redis.smembers(REDIS_PENDING_SET);
    let cleaned = 0;

    for (const id of pendingIds) {
      const exists = await this.redis.exists(this.key(id));
      if (!exists) {
        await this.redis.srem(REDIS_PENDING_SET, id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Atualiza o status de uma aprovação e gerencia o set de pendentes
   */
  private async updateStatus(approval: Approval): Promise<void> {
    const key = this.key(approval.id);
    
    const pipeline = this.redis.pipeline();
    pipeline.set(key, this.serialize(approval), 'EX', APPROVAL_TTL_SECONDS);
    
    // Remover do set de pendentes se não está mais pendente
    if (approval.status !== 'pending') {
      pipeline.srem(REDIS_PENDING_SET, approval.id);
    }
    
    await pipeline.exec();
  }

  /**
   * Reseta o store (para testes)
   */
  async reset(): Promise<void> {
    if (!this.initialized) return;

    // Obter todas as chaves de aprovação
    const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    await this.redis.del(REDIS_PENDING_SET);
    this.initialized = false;
  }
}
