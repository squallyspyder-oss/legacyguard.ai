import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isVectorIndexingEnabled } from '@/lib/indexer-pgvector';
import { logEvent } from '@/lib/audit';
import { enqueueTask } from '@/lib/queue';

// Eventos que disparam re-indexação
const INDEXABLE_EVENTS = ['push', 'release', 'workflow_run'];

function getWebhookSecret(): string | undefined {
  return process.env.GITHUB_WEBHOOK_SECRET;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Anti-replay cache (deliveryId -> timestamp)
const seenDeliveries = new Map<string, number>();
const REPLAY_TTL_MS = 5 * 60 * 1000; // 5 minutos
const REPLAY_MAX_ENTRIES = 1000; // limite simples para processos longos

function cleanReplayCache(now: number) {
  // Remove entradas expiradas
  for (const [key, ts] of seenDeliveries) {
    if (now - ts > REPLAY_TTL_MS) {
      seenDeliveries.delete(key);
    }
  }

  // Evita crescimento ilimitado em processos longos
  if (seenDeliveries.size > REPLAY_MAX_ENTRIES) {
    const overflow = seenDeliveries.size - REPLAY_MAX_ENTRIES;
    let removed = 0;
    for (const key of seenDeliveries.keys()) {
      seenDeliveries.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}

export function isReplay(deliveryId: string | null): boolean {
  if (!deliveryId) return false;
  const now = Date.now();
  cleanReplayCache(now);
  const last = seenDeliveries.get(deliveryId);
  if (last) return true;
  seenDeliveries.set(deliveryId, now);
  return false;
}

export function verifySignature(payload: string, signature: string | null, secretFromCall?: string | null): boolean {
  const secret = secretFromCall ?? getWebhookSecret();

  if (!secret) {
    console.warn('[webhook] GITHUB_WEBHOOK_SECRET não configurado - assinatura não verificada');
    return true; // Em dev, permitir sem assinatura
  }
  
  if (!signature) {
    return false;
  }
  
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;
  
  // Evitar RangeError de timingSafeEqual se tamanhos diferirem
  if (signature.length !== expected.length) {
    return false;
  }
  
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
  
  // Fail-closed em produção se segredo ausente
  if (isProduction() && !getWebhookSecret()) {
    await logEvent({
      action: 'webhook.misconfigured',
      severity: 'error',
      message: 'GITHUB_WEBHOOK_SECRET ausente em produção',
      metadata: { eventType, deliveryId },
    });
    return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
  }

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
  
  // Tipo parcial do payload do webhook GitHub
  type WebhookPayload = {
    repository?: { full_name?: string; default_branch?: string };
    sender?: { login?: string };
    ref?: string;
    after?: string;
    head_commit?: { id?: string };
  };
  
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Anti-replay simples por deliveryId
  if (isReplay(deliveryId)) {
    await logEvent({
      action: 'webhook.replay',
      severity: 'warn',
      message: 'Requisição de webhook repetida (deliveryId já visto)',
      metadata: { eventType, deliveryId },
    });
    return NextResponse.json({ error: 'Replay detected' }, { status: 409 });
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
  
  // Enfileirar indexação (não executar inline)
  try {
    const commit = payload.after || payload.head_commit?.id;
    const queueId = await enqueueTask('indexing', {
      role: 'index-repo',
      owner,
      repo,
      commit,
      eventType,
      deliveryId,
    });
    await logEvent({
      action: 'webhook.indexing.enqueued',
      severity: 'info',
      message: `Indexação enfileirada para ${repoFullName}`,
      metadata: { eventType, owner, repo, queueId, commit, deliveryId },
      repo: { owner, repo },
    });
    return NextResponse.json({ 
      received: true, 
      indexed: false,
      queued: true,
      queueId,
      message: `Indexing job enqueued for ${repoFullName}` 
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await logEvent({
      action: 'webhook.indexing.enqueue_failed',
      severity: 'error',
      message: `Falha ao enfileirar indexação para ${repoFullName}: ${errorMessage}`,
      metadata: { eventType, owner, repo, deliveryId, error: errorMessage },
      repo: { owner, repo },
    });
    return NextResponse.json({ error: 'Failed to enqueue indexing job' }, { status: 503 });
  }
}

// HEAD para health check do GitHub
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
