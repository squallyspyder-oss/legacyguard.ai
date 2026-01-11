/**
 * Approvals List API Route - Listar aprovações pendentes
 * 
 * @route GET /api/approvals - Lista todas aprovações pendentes
 * 
 * SEGURANÇA: Endpoint protegido por RBAC (CVE-LG-001 fix)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listPendingApprovals,
  cleanupExpired,
  initApprovalStore,
  isStoreInitialized,
} from '@/lib/approval-store';
import { requirePermission } from '@/lib/rbac';

async function ensureStore() {
  if (!isStoreInitialized()) {
    await initApprovalStore();
  }
}

// =============================================================================
// GET /api/approvals - Listar aprovações pendentes
// =============================================================================

export async function GET(request: NextRequest) {
  // ✅ CVE-LG-001 FIX: RBAC check obrigatório
  const authResult = await requirePermission('approve');
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    await ensureStore();
    
    const searchParams = request.nextUrl.searchParams;
    const cleanup = searchParams.get('cleanup') === 'true';
    
    // Opcionalmente limpar expiradas primeiro
    if (cleanup) {
      const expiredCount = await cleanupExpired();
      console.log(`[Approvals API] Cleaned up ${expiredCount} expired approvals`);
    }
    
    const pending = await listPendingApprovals();
    
    return NextResponse.json({
      success: true,
      count: pending.length,
      approvals: pending.map(approval => ({
        id: approval.id,
        intent: approval.intent,
        loaLevel: approval.loaLevel,
        reason: approval.reason,
        status: approval.status,
        requestedBy: approval.requestedBy,
        requestedAt: approval.requestedAt.toISOString(),
        expiresAt: approval.expiresAt.toISOString(),
        timeRemaining: Math.max(0, approval.expiresAt.getTime() - Date.now()),
      })),
    });
  } catch (error) {
    console.error('[Approvals API] GET List Error:', error);
    return NextResponse.json(
      { error: 'Erro interno', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
