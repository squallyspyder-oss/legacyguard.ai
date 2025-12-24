import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { refundReservation } from '@/lib/quotas';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('config:write');
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const ok = await refundReservation(taskId);
    if (!ok) return NextResponse.json({ error: 'refund failed or reservation not found' }, { status: 500 });
    return NextResponse.json({ refunded: true, taskId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
  }
}
