/**
 * API de Status de Orquestração - Polling Fallback
 * 
 * GET /api/agents/status/[taskId]
 * 
 * Retorna estado atual de uma orquestração do Redis.
 * Usado como fallback quando SSE/Pub/Sub não está disponível.
 * 
 * MANIFESTO: Não mentir sobre estado - retorna dados reais do Redis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getRedis } from '@/lib/queue';

const ORCH_STATE_PREFIX = 'legacyguard:orch:state:';

type OrchestrationStatusResponse = {
  found: boolean;
  taskId: string;
  status?: string;
  currentWave?: number;
  totalWaves?: number;
  resultsCount?: number;
  riskLevel?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
): Promise<NextResponse<OrchestrationStatusResponse>> {
  // Verificar autenticação
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { found: false, taskId: '', error: 'Não autenticado' },
      { status: 401 }
    );
  }
  
  const { taskId } = await params;
  
  if (!taskId) {
    return NextResponse.json(
      { found: false, taskId: '', error: 'taskId não fornecido' },
      { status: 400 }
    );
  }
  
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { found: false, taskId, error: 'Redis não disponível' },
      { status: 503 }
    );
  }
  
  try {
    const data = await redis.get(`${ORCH_STATE_PREFIX}${taskId}`);
    
    if (!data) {
      return NextResponse.json({
        found: false,
        taskId,
        error: 'Orquestração não encontrada ou já finalizada',
      });
    }
    
    const state = JSON.parse(data);
    
    // Retornar apenas informações seguras (sem dados sensíveis)
    return NextResponse.json({
      found: true,
      taskId,
      status: state.status,
      currentWave: state.currentWave,
      totalWaves: state.plan?.tasks ? 
        Math.max(...state.plan.tasks.map((t: { wave?: number }) => t.wave || 0)) + 1 : 
        undefined,
      resultsCount: Array.isArray(state.results) ? state.results.length : 0,
      riskLevel: state.plan?.riskLevel,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    });
  } catch (err) {
    console.error('[API] Erro ao buscar status:', err);
    return NextResponse.json(
      { found: false, taskId, error: 'Erro interno ao buscar status' },
      { status: 500 }
    );
  }
}
