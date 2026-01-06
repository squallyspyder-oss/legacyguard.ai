/**
 * Approval API Route - Aprovar ou Rejeitar solicitações
 * 
 * @route POST /api/approvals/[id]/approve
 * @route POST /api/approvals/[id]/reject
 * @route GET /api/approvals/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getApproval,
  approveRequest,
  denyRequest,
  isStoreInitialized,
  initApprovalStore,
} from '@/lib/approval-store';
import { logEvent } from '@/lib/audit';

async function ensureStore() {
  if (!isStoreInitialized()) {
    await initApprovalStore();
  }
}

// =============================================================================
// GET /api/approvals/[id] - Obter detalhes de uma aprovação
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureStore();
    const { id } = await params;
    
    const approval = await getApproval(id);
    
    if (!approval) {
      return NextResponse.json(
        { error: 'Aprovação não encontrada', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      approval: {
        id: approval.id,
        intent: approval.intent,
        loaLevel: approval.loaLevel,
        reason: approval.reason,
        status: approval.status,
        requestedBy: approval.requestedBy,
        requestedAt: approval.requestedAt.toISOString(),
        expiresAt: approval.expiresAt.toISOString(),
        decidedBy: approval.decidedBy,
        decidedAt: approval.decidedAt?.toISOString(),
        decisionReason: approval.decisionReason,
      },
    });
  } catch (error) {
    console.error('[Approvals API] GET Error:', error);
    return NextResponse.json(
      { error: 'Erro interno', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/approvals/[id] - Aprovar ou Rejeitar
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureStore();
    const { id } = await params;
    
    const body = await request.json();
    const { action, decidedBy, reason } = body;
    
    // Validar campos obrigatórios
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Campo "action" deve ser "approve" ou "reject"', code: 'INVALID_ACTION' },
        { status: 400 }
      );
    }
    
    if (!decidedBy || typeof decidedBy !== 'string') {
      return NextResponse.json(
        { error: 'Campo "decidedBy" é obrigatório', code: 'MISSING_DECIDED_BY' },
        { status: 400 }
      );
    }
    
    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'Campo "reason" é obrigatório para rejeição', code: 'MISSING_REASON' },
        { status: 400 }
      );
    }
    
    // Buscar aprovação
    const existing = await getApproval(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Aprovação não encontrada', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    
    // Verificar se já foi decidida
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { 
          error: `Aprovação já está ${existing.status}`, 
          code: 'ALREADY_DECIDED',
          approval: {
            id: existing.id,
            status: existing.status,
            decidedBy: existing.decidedBy,
            decidedAt: existing.decidedAt?.toISOString(),
          },
        },
        { status: 409 }
      );
    }
    
    // Executar ação
    let result;
    if (action === 'approve') {
      result = await approveRequest(id, decidedBy, reason);
    } else {
      result = await denyRequest(id, decidedBy, reason);
    }
    
    if (!result) {
      return NextResponse.json(
        { error: 'Falha ao processar decisão', code: 'PROCESS_ERROR' },
        { status: 500 }
      );
    }
    
    // Audit log
    await logEvent({
      action: `approval_${action}d`,
      message: `Approval ${id} ${action}d by ${decidedBy}`,
      severity: action === 'approve' ? 'info' : 'warn',
      metadata: {
        approvalId: id,
        intent: result.intent,
        loaLevel: result.loaLevel,
        decidedBy,
        reason,
      },
    }).catch(console.error);
    
    return NextResponse.json({
      success: true,
      message: action === 'approve' 
        ? 'Aprovação concedida com sucesso'
        : 'Aprovação rejeitada',
      approval: {
        id: result.id,
        intent: result.intent,
        loaLevel: result.loaLevel,
        status: result.status,
        decidedBy: result.decidedBy,
        decidedAt: result.decidedAt?.toISOString(),
        decisionReason: result.decisionReason,
      },
    });
    
  } catch (error) {
    console.error('[Approvals API] POST Error:', error);
    return NextResponse.json(
      { error: 'Erro interno', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
