import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { adjustUserUsage, resetCircuit } from '@/lib/quotas';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('config:write');
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    // Either reconcile usage or reset circuit
    if (body.resetCircuit) {
      const ok = await resetCircuit();
      return NextResponse.json({ resetCircuit: ok });
    }

    const { userId, month, tokensDelta = 0, usdDelta = 0, day } = body;
    if (!userId || !month) return NextResponse.json({ error: 'userId and month required' }, { status: 400 });

    const ok = await adjustUserUsage({ userId, month, tokensDelta, usdDelta, day });
    if (!ok) return NextResponse.json({ error: 'adjust failed' }, { status: 500 });
    return NextResponse.json({ adjusted: true, userId, month, tokensDelta, usdDelta });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
  }
}
