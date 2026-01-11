/**
 * Rollback Manager - Sistema de Rollback Executável
 * 
 * P2: Implementação de rollback real integrado com:
 * - Snapshots de execution-pipeline.ts
 * - Approval store para tracking
 * - Audit logging
 */

import { createSnapshot, restoreSnapshot, SnapshotHandle } from './execution-pipeline';
import { getApprovalStore, getApproval, Approval } from './approval-store';
import { logEvent, recordAuditEvidence } from './audit';
import crypto from 'crypto';

// ============================================================================
// TIPOS
// ============================================================================

export type RollbackStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';

export interface RollbackRecord {
  id: string;
  approvalId?: string;
  taskId?: string;
  snapshotPath: string;
  repoPath: string;
  createdAt: Date;
  status: RollbackStatus;
  executedAt?: Date;
  executedBy?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  rollbackId: string;
  restored: boolean;
  error?: string;
  durationMs: number;
}

// ============================================================================
// ROLLBACK STORE (em memória + logging para audit)
// ============================================================================

const rollbackStore = new Map<string, RollbackRecord>();
const approvalSnapshots = new Map<string, string>(); // approvalId -> rollbackId

// ============================================================================
// ROLLBACK MANAGER
// ============================================================================

/**
 * Cria um snapshot para uma operação que pode precisar de rollback
 * Associa o snapshot a uma approval (se existir)
 */
export async function createRollbackPoint(params: {
  repoPath: string;
  approvalId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ rollbackId: string; snapshot: SnapshotHandle }> {
  const { repoPath, approvalId, taskId, metadata } = params;
  
  // Criar snapshot
  const snapshot = await createSnapshot({ repoPath });
  
  // Gerar ID único
  const rollbackId = `rollback_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  
  // Registrar no store
  const record: RollbackRecord = {
    id: rollbackId,
    approvalId,
    taskId,
    snapshotPath: snapshot.snapshotPath,
    repoPath,
    createdAt: new Date(),
    status: 'pending',
    metadata,
  };
  
  rollbackStore.set(rollbackId, record);
  
  // Associar à approval se existir
  if (approvalId) {
    approvalSnapshots.set(approvalId, rollbackId);
  }
  
  // Audit
  await logEvent({
    action: 'rollback.point_created',
    severity: 'info',
    message: `Rollback point created: ${rollbackId}`,
    metadata: {
      rollbackId,
      approvalId,
      taskId,
      repoPath,
      snapshotPath: snapshot.snapshotPath,
    },
  }).catch(() => undefined);
  
  return { rollbackId, snapshot };
}

/**
 * Executa rollback para um ponto específico
 */
export async function executeRollback(params: {
  rollbackId: string;
  executedBy: string;
  reason?: string;
}): Promise<RollbackResult> {
  const { rollbackId, executedBy, reason } = params;
  const startTime = Date.now();
  
  const record = rollbackStore.get(rollbackId);
  if (!record) {
    return {
      success: false,
      rollbackId,
      restored: false,
      error: 'Rollback point not found',
      durationMs: Date.now() - startTime,
    };
  }
  
  if (record.status === 'completed' || record.status === 'failed') {
    return {
      success: false,
      rollbackId,
      restored: false,
      error: `Rollback already ${record.status}`,
      durationMs: Date.now() - startTime,
    };
  }
  
  // Atualizar status
  record.status = 'in_progress';
  record.executedBy = executedBy;
  
  try {
    // Executar restore
    await restoreSnapshot(record.repoPath, record.snapshotPath);
    
    record.status = 'completed';
    record.executedAt = new Date();
    
    // Audit sucesso
    await logEvent({
      action: 'rollback.executed',
      severity: 'warn',
      message: `Rollback executed successfully: ${rollbackId}`,
      metadata: {
        rollbackId,
        approvalId: record.approvalId,
        taskId: record.taskId,
        executedBy,
        reason,
        durationMs: Date.now() - startTime,
      },
    }).catch(() => undefined);
    
    // Registrar evidência de rollback
    await recordAuditEvidence({
      actor: executedBy,
      message: `Rollback executed: ${rollbackId}`,
      rollbackPlan: `Restored from snapshot: ${record.snapshotPath}`,
    }).catch(() => undefined);
    
    return {
      success: true,
      rollbackId,
      restored: true,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    record.status = 'failed';
    record.error = (err as Error).message;
    
    // Audit falha
    await logEvent({
      action: 'rollback.failed',
      severity: 'error',
      message: `Rollback FAILED: ${rollbackId} - ${(err as Error).message}`,
      metadata: {
        rollbackId,
        approvalId: record.approvalId,
        taskId: record.taskId,
        executedBy,
        error: (err as Error).message,
      },
    }).catch(() => undefined);
    
    return {
      success: false,
      rollbackId,
      restored: false,
      error: (err as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Executa rollback usando ID de approval
 */
export async function rollbackByApproval(params: {
  approvalId: string;
  executedBy: string;
  reason?: string;
}): Promise<RollbackResult> {
  const { approvalId, executedBy, reason } = params;
  
  const rollbackId = approvalSnapshots.get(approvalId);
  if (!rollbackId) {
    return {
      success: false,
      rollbackId: 'unknown',
      restored: false,
      error: `No rollback point found for approval ${approvalId}`,
      durationMs: 0,
    };
  }
  
  return executeRollback({
    rollbackId,
    executedBy,
    reason: reason || `Rollback triggered for approval ${approvalId}`,
  });
}

/**
 * Obtém informações de um rollback point
 */
export function getRollbackRecord(rollbackId: string): RollbackRecord | null {
  return rollbackStore.get(rollbackId) || null;
}

/**
 * Obtém rollback point associado a uma approval
 */
export function getRollbackForApproval(approvalId: string): RollbackRecord | null {
  const rollbackId = approvalSnapshots.get(approvalId);
  if (!rollbackId) return null;
  return rollbackStore.get(rollbackId) || null;
}

/**
 * Lista rollback points pendentes
 */
export function listPendingRollbacks(): RollbackRecord[] {
  const pending: RollbackRecord[] = [];
  for (const record of rollbackStore.values()) {
    if (record.status === 'pending') {
      pending.push(record);
    }
  }
  return pending;
}

/**
 * Limpa snapshot após operação bem-sucedida
 * Deve ser chamado quando a operação completou com sucesso e rollback não é mais necessário
 */
export async function clearRollbackPoint(rollbackId: string): Promise<void> {
  const record = rollbackStore.get(rollbackId);
  if (!record) return;
  
  // Marcar como expirado
  record.status = 'expired';
  
  // Limpar associação com approval
  if (record.approvalId) {
    approvalSnapshots.delete(record.approvalId);
  }
  
  // Audit
  await logEvent({
    action: 'rollback.cleared',
    severity: 'info',
    message: `Rollback point cleared (operation successful): ${rollbackId}`,
    metadata: { rollbackId },
  }).catch(() => undefined);
  
  // Nota: O cleanup do snapshot em si é feito pelo SnapshotHandle.cleanup()
  // retornado em createRollbackPoint
}

/**
 * Reseta o store (para testes)
 */
export function resetRollbackStore(): void {
  rollbackStore.clear();
  approvalSnapshots.clear();
}
