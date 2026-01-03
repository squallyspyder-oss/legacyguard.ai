import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { indexRepo as indexRepoPgVector, isVectorIndexingEnabled } from '@/lib/indexer-pgvector';
import { logEvent } from '@/lib/audit';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// Eventos que disparam re-indexação
const INDEXABLE_EVENTS = ['push', 'release', 'workflow_run'];

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[webhook] GITHUB_WEBHOOK_SECRET não configurado - assinatura não verificada');
    return true; // Em dev, permitir sem assinatura
  }
  
  if (!signature) {
    return false;
  }
  
  const expected = `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export async function POST(req: NextRequest) {
  const eventType = req.headers.get('x-github-event');
  const signature = req.headers.get('x-hub-signature-256');
  const deliveryId = req.headers.get('x-github-delivery');
  
  // Ler body como texto para verificação de assinatura
  const rawBody = await req.text();
  
  // Verificar assinatura
  if (!verifySignature(rawBody, signature)) {
    await logEvent({
      action: 'webhook.signature.invalid',
      severity: 'error',
      message: 'Webhook recebido com assinatura inválida',
      metadata: { eventType, deliveryId },
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  // Log do evento recebido
  const repoFullName = payload.repository?.full_name;
  await logEvent({
    action: `webhook.${eventType}`,
    severity: 'info',
    message: `Webhook ${eventType} recebido para ${repoFullName}`,
    metadata: { 
      eventType, 
      deliveryId,
      repoFullName,
      sender: payload.sender?.login,
    },
  });
  
  // Verificar se é um evento que dispara indexação
  if (!eventType || !INDEXABLE_EVENTS.includes(eventType)) {
    return NextResponse.json({ 
      received: true, 
      indexed: false,
      reason: `Event type '${eventType}' does not trigger indexing` 
    });
  }
  
  // Para push, verificar se é na branch default
  if (eventType === 'push') {
    const defaultBranch = payload.repository?.default_branch;
    const pushedRef = payload.ref; // refs/heads/main
    const pushedBranch = pushedRef?.replace('refs/heads/', '');
    
    if (pushedBranch !== defaultBranch) {
      return NextResponse.json({ 
        received: true, 
        indexed: false,
        reason: `Push to non-default branch (${pushedBranch} != ${defaultBranch})` 
      });
    }
  }
  
  // Verificar se pgvector está habilitado
  if (!isVectorIndexingEnabled()) {
    await logEvent({
      action: 'webhook.indexing.skipped',
      severity: 'warn',
      message: 'Indexação ignorada - pgvector não configurado',
      metadata: { repoFullName },
    });
    return NextResponse.json({ 
      received: true, 
      indexed: false,
      reason: 'Vector indexing not enabled (PGVECTOR_URL not configured)' 
    });
  }
  
  // Extrair informações do repositório
  const [owner, repo] = (repoFullName || '').split('/');
  if (!owner || !repo) {
    return NextResponse.json({ error: 'Invalid repository in payload' }, { status: 400 });
  }
  
  // Disparar indexação assíncrona
  // Não aguardamos a conclusão para responder rápido ao GitHub
  (async () => {
    try {
      await logEvent({
        action: 'webhook.indexing.started',
        severity: 'info',
        message: `Iniciando re-indexação de ${repoFullName}`,
        metadata: { 
          eventType, 
          owner, 
          repo,
          commit: payload.after || payload.head_commit?.id,
        },
        repo: { owner, repo },
      });
      
      // Re-indexar o repositório
      // Token será obtido do ambiente ou sessão se disponível
      const token = process.env.GITHUB_TOKEN;
      
      const result = await indexRepoPgVector(owner, repo, token);
      
      await logEvent({
        action: 'webhook.indexing.completed',
        severity: 'info',
        message: `Re-indexação de ${repoFullName} concluída: ${result.filesIndexed} arquivos`,
        metadata: { 
          eventType,
          owner, 
          repo,
          filesIndexed: result.filesIndexed,
          chunksCreated: result.chunksCreated,
        },
        repo: { owner, repo },
      });
    } catch (err: any) {
      await logEvent({
        action: 'webhook.indexing.failed',
        severity: 'error',
        message: `Falha na re-indexação de ${repoFullName}: ${err.message}`,
        metadata: { 
          eventType,
          owner, 
          repo,
          error: err.message,
        },
        repo: { owner, repo },
      });
    }
  })();
  
  return NextResponse.json({ 
    received: true, 
    indexed: true,
    message: `Indexing triggered for ${repoFullName}` 
  });
}

// HEAD para health check do GitHub
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
