import { NextRequest, NextResponse } from 'next/server';
import { getIndexJob, getIndexJobSync } from '@/lib/index-job-store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID obrigatório' }, { status: 400 });
  }
  
  // Tenta Redis primeiro, fallback para memória
  let job = await getIndexJob(jobId);
  if (!job) {
    job = getIndexJobSync(jobId);
  }
  
  if (!job) {
    return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 });
  }
  
  return NextResponse.json(job);
}
