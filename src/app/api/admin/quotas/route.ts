import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { getQuotaStatus, getCircuitStatus, getCurrentMonth } from '@/lib/quotas';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('config:read');
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (userId) {
      const month = getCurrentMonth();
      const quota = await getQuotaStatus({ userId, role: 'developer', month });
      const circuit = await getCircuitStatus();
      return NextResponse.json({ quota, circuit });
    }

    // No userId: return circuit status and basic note
    const circuit = await getCircuitStatus();
    return NextResponse.json({ message: 'Provide ?userId= to get per-user quota', circuit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
  }
}
