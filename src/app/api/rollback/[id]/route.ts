/**
 * API Rollback - Execução de Rollback por ID
 * 
 * POST /api/rollback/[id] - Executa rollback para um ponto específico
 * GET /api/rollback/[id] - Obtém status de um rollback point
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { 
  executeRollback, 
  getRollbackRecord, 
  rollbackByApproval,
  clearRollbackPoint 
} from '@/lib/rollback';
import { logEvent } from '@/lib/audit';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/rollback/[id] - Obtém informações do rollback point
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // RBAC: Apenas usuários autenticados com permissão de approve podem ver rollbacks
  const authResult = await requirePermission('approve');
  if (!authResult.authorized) {
    return authResult.response;
  }
  
  const { id } = await context.params;
  
  const record = getRollbackRecord(id);
  if (!record) {
    return NextResponse.json(
      { error: 'Rollback point not found', id },
      { status: 404 }
    );
  }
  
  return NextResponse.json({
    id: record.id,
    status: record.status,
    approvalId: record.approvalId,
    taskId: record.taskId,
    repoPath: record.repoPath,
    createdAt: record.createdAt,
    executedAt: record.executedAt,
    executedBy: record.executedBy,
    error: record.error,
  });
}

/**
 * POST /api/rollback/[id] - Executa rollback
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // RBAC: Permissão especial para executar rollback
  const authResult = await requirePermission('approve');
  if (!authResult.authorized) {
    return authResult.response;
  }
  
  const { id } = await context.params;
  const executedBy = authResult.user?.email || authResult.user?.name || 'authenticated-user';
  
  let body: { reason?: string; type?: 'execute' | 'clear' } = {};
  try {
    body = await request.json();
  } catch {
    // Body opcional
  }
  
  const { reason, type = 'execute' } = body;
  
  // Audit início
  await logEvent({
    action: 'rollback.api_request',
    severity: 'warn',
    message: `Rollback ${type} requested via API`,
    metadata: {
      id,
      type,
      reason,
      executedBy,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    },
  }).catch(() => undefined);
  
  // Tipo: clear (limpar rollback point após sucesso)
  if (type === 'clear') {
    await clearRollbackPoint(id);
    return NextResponse.json({
      success: true,
      message: `Rollback point ${id} cleared`,
    });
  }
  
  // Tipo: execute (executar rollback)
  // Verificar se o ID é de um rollback ou approval
  const isApprovalId = id.startsWith('approval_');
  
  let result;
  if (isApprovalId) {
    result = await rollbackByApproval({
      approvalId: id,
      executedBy,
      reason,
    });
  } else {
    result = await executeRollback({
      rollbackId: id,
      executedBy,
      reason,
    });
  }
  
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        rollbackId: result.rollbackId,
        durationMs: result.durationMs,
      },
      { status: 400 }
    );
  }
  
  return NextResponse.json({
    success: true,
    rollbackId: result.rollbackId,
    restored: result.restored,
    durationMs: result.durationMs,
    message: 'Rollback executed successfully',
  });
}

/**
 * DELETE /api/rollback/[id] - Remove rollback point (clear)
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // RBAC
  const authResult = await requirePermission('approve');
  if (!authResult.authorized) {
    return authResult.response;
  }
  
  const { id } = await context.params;
  
  await clearRollbackPoint(id);
  
  return NextResponse.json({
    success: true,
    message: `Rollback point ${id} cleared`,
  });
}
