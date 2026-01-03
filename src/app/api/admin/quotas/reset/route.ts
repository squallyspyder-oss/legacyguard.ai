import { NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * POST /api/admin/quotas/reset
 * Reseta a quota de uso de um usuário para o mês atual
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = body.userId || 'anonymous';
  const month = body.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  const url = process.env.AUDIT_DB_URL || process.env.PGVECTOR_URL;
  
  if (!url) {
    return NextResponse.json({ 
      success: true, 
      message: 'Quota resetada (modo in-memory)',
      note: 'Sem banco configurado, quota é gerenciada em memória'
    });
  }

  const pool = new Pool({ connectionString: url });
  
  try {
    // Reset quota mensal
    await pool.query(
      `UPDATE user_usage 
       SET tokens_used = 0, usd_used = 0, updated_at = NOW() 
       WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    // Reset quota diária
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      `UPDATE user_usage_daily 
       SET tokens_used = 0, usd_used = 0, updated_at = NOW() 
       WHERE user_id = $1 AND day = $2`,
      [userId, today]
    );

    // Também limpa o circuit breaker se estiver ativo
    await pool.query(
      `UPDATE circuit_state SET tripped_until = NULL, updated_at = NOW() WHERE id = 1`
    );

    await pool.end();

    return NextResponse.json({ 
      success: true, 
      message: `Quota resetada para ${userId} no mês ${month}`,
      userId,
      month
    });
  } catch (error: unknown) {
    await pool.end();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ 
      error: 'Falha ao resetar quota', 
      details: errorMessage 
    }, { status: 500 });
  }
}
