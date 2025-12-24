import { NextResponse } from 'next/server';
import { enqueueTask } from '../../../lib/queue';
import { logEvent } from '../../../lib/audit';
import { emitSandboxLog } from '../../../lib/sandbox-logs';
import { checkRateLimit, rateLimitResponse, RATE_LIMIT_PRESETS } from '../../../lib/rate-limit';
import { agentsRequestSchema, validateRequest, validationErrorResponse } from '../../../lib/schemas';
import { requirePermission, Permission } from '../../../lib/rbac';

export async function POST(req: Request) {
  // Rate limiting (strict for expensive LLM operations)
  const rateLimitResult = await checkRateLimit(req, { ...RATE_LIMIT_PRESETS.strict, keyPrefix: 'agents' });
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.resetAt);
  }

  const body = await req.json();

  // Validate request body
  const validation = validateRequest(agentsRequestSchema, body);
  if (!validation.success) {
    return validationErrorResponse(validation.error, validation.details);
  }

  // Suporta: { role, payload } ou { role: 'orchestrate', request, context }
  if (!body?.role) {
    return NextResponse.json({ error: 'Campo "role" obrigatório' }, { status: 400 });
  }

  // RBAC: exige permissão conforme tipo de operação
  const requiredPermission: Permission =
    body.role === 'orchestrate' ? 'orchestrate' : body.role === 'approve' ? 'approve' : 'execute';
  const auth = await requirePermission(requiredPermission);
  if (!auth.authorized) {
    return auth.response;
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Montar payload baseado no tipo de tarefa
  let queuePayload: Record<string, any>;

  if (body.role === 'orchestrate') {
    // Orquestração completa: Planner → Agentes coordenados
    if (!body.request) {
      return NextResponse.json({ error: 'Campo "request" obrigatório para orquestração' }, { status: 400 });
    }

    const baseContext = body.context || {};

    // Sandbox opcional: permite rodar testes em container antes de executor.
    const envSandboxEnabled = process.env.LEGACYGUARD_SANDBOX_ENABLED === 'true';
    const sandboxConfig = {
      enabled: body.sandbox?.enabled ?? envSandboxEnabled,
      repoPath: body.sandbox?.repoPath || process.env.LEGACYGUARD_SANDBOX_REPO_PATH || process.cwd(),
      command: body.sandbox?.command || process.env.LEGACYGUARD_SANDBOX_COMMAND || undefined,
      runnerPath: body.sandbox?.runnerPath || process.env.LEGACYGUARD_SANDBOX_RUNNER || `${process.cwd()}/scripts/runner_sandbox.sh`,
      timeoutMs: body.sandbox?.timeoutMs ?? (process.env.LEGACYGUARD_SANDBOX_TIMEOUT_MS ? Number(process.env.LEGACYGUARD_SANDBOX_TIMEOUT_MS) : undefined),
      failMode: body.sandbox?.failMode || process.env.LEGACYGUARD_SANDBOX_FAIL_MODE || 'fail',
      languageHint: body.sandbox?.languageHint,
    };

    queuePayload = {
      role: 'orchestrate',
      taskId,
      request: body.request,
      context: {
        taskId,
        ...baseContext,
        ...(sandboxConfig?.enabled ? { sandbox: sandboxConfig } : {}),
        safeMode: body.safeMode ?? baseContext.safeMode,
        repoPath: baseContext.repoPath || process.env.LEGACYGUARD_REPO_PATH || process.cwd(),
        ...(body.executionPolicy ? { executionPolicy: body.executionPolicy } : {}),
        ...(body.guardrails ? { guardrails: body.guardrails } : {}),
      },
    };
  } else if (body.role === 'approve') {
    // Aprovar orquestração pendente
    if (!body.orchestrationId) {
      return NextResponse.json({ error: 'Campo "orchestrationId" obrigatório' }, { status: 400 });
    }
    queuePayload = {
      role: 'approve',
      taskId,
      orchestrationId: body.orchestrationId,
    };
  } else {
    // Execução direta de agente individual
    queuePayload = {
      role: body.role,
      taskId,
      ...body.payload,
    };
  }

  const id = await enqueueTask('agents', queuePayload);

  // Audit: registra enfileiramento (sem tokens)
  try {
    await logEvent({
      action: 'agent_enqueued',
      severity: 'info',
      message: `Tarefa ${taskId} enfileirada para role ${body.role}`,
      metadata: {
        role: body.role,
        taskId,
        orchestration: body.role === 'orchestrate',
      },
    });
    emitSandboxLog({ taskId, message: `[audit] Tarefa ${taskId} enfileirada (${body.role})`, scope: 'audit' });
  } catch (err) {
    console.warn('Falha ao gravar audit log', err);
  }

  return NextResponse.json({
    queued: true,
    id,
    taskId,
    streamUrl: `/api/agents/stream?taskId=${taskId}`,
  });
}
