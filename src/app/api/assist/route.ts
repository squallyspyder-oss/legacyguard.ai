/**
 * API Route: /api/assist
 * 
 * Endpoint principal do LegacyAssist - Agente Autônomo de Alta Performance
 * 
 * Substitui o chat livre por um agente com:
 * - Loop de raciocínio estruturado
 * - Uso ativo de ferramentas
 * - Contexto dinâmico de sessão
 * - Personalidade proativa
 */

import { NextRequest, NextResponse } from 'next/server';
import { AgentRuntime, type SessionState } from '@/lib/agent-runtime';
import { createToolExecutor } from '@/lib/tool-executors';
import { checkRateLimit, rateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { validateRequest, validationErrorResponse } from '@/lib/schemas';
import { requirePermission } from '@/lib/rbac';
import { enforceQuota, getCurrentMonth } from '@/lib/quotas';
import { logEvent } from '@/lib/audit';
import { logBootDiagnostics } from '@/lib/boot';
import { z } from 'zod';

// Schema de validação da request
const assistRequestSchema = z.object({
  message: z.string().min(1, 'Mensagem é obrigatória'),
  sessionState: z.object({
    repoPath: z.string().optional(),
    analyzedFiles: z.array(z.string()).optional(),
    lastError: z.object({
      message: z.string(),
      timestamp: z.string(),
      context: z.string().optional(),
    }).optional(),
    sandboxStatus: z.enum(['idle', 'running', 'completed', 'failed']).optional(),
    activeTasks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      status: z.string(),
    })).optional(),
  }).optional(),
  settings: z.object({
    sandboxEnabled: z.boolean().optional(),
    sandboxMode: z.enum(['fail', 'permissive']).optional(),
    workerEnabled: z.boolean().optional(),
    safeMode: z.boolean().optional(),
    reviewGate: z.boolean().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  logBootDiagnostics('assist-route');
  console.log('[assist] request received');
  
  // Rate limiting
  const rateLimitResult = await checkRateLimit(req, {
    ...RATE_LIMIT_PRESETS.standard,
    keyPrefix: 'assist',
  });
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.resetAt);
  }

  // RBAC
  const auth = await requirePermission('chat');
  if (!auth.authorized) {
    return auth.response;
  }

  const userId = auth.user?.email || auth.user?.id || 'anonymous';
  const month = getCurrentMonth();

  try {
    const body = await req.json();

    // Validação
    const validation = validateRequest(assistRequestSchema, body);
    if (!validation.success) {
      return validationErrorResponse(validation.error, validation.details);
    }

    const { message, sessionState: clientState, settings } = validation.data;
    
    console.log('[assist] processing', { 
      userId, 
      messageLength: message.length,
      hasSessionState: !!clientState,
    });

    // Criar executor de ferramentas com configurações
    const executor = createToolExecutor({
      repoPath: clientState?.repoPath,
      sandboxEnabled: settings?.sandboxEnabled ?? true,
      sandboxMode: settings?.sandboxMode ?? 'fail',
      workerEnabled: settings?.workerEnabled ?? false,
    });

    // Inicializar runtime do agente
    const initialState: Partial<SessionState> = {
      repoPath: clientState?.repoPath,
      analyzedFiles: clientState?.analyzedFiles || [],
      sandboxStatus: clientState?.sandboxStatus || 'idle',
      activeTasks: clientState?.activeTasks || [],
      lastToolResults: [],
    };

    if (clientState?.lastError) {
      initialState.lastError = {
        message: clientState.lastError.message,
        timestamp: new Date(clientState.lastError.timestamp),
        context: clientState.lastError.context,
      };
    }

    const runtime = new AgentRuntime(executor, initialState);

    // Executar agente
    console.log('[assist] running agent');
    const result = await runtime.run(message);
    
    console.log('[assist] agent completed', {
      toolsUsed: result.toolsUsed.length,
      responseLength: result.response.length,
      usage: result.usage,
    });

    // Auditoria
    await logEvent({
      action: 'assist_query',
      actor: userId,
      metadata: {
        messageLength: message.length,
        toolsUsed: result.toolsUsed.map(t => t.toolCallId.split('-')[0]),
        thinking: result.thinking.understanding,
        plan: result.thinking.plan,
        model: result.modelUsed,
      },
    });

    // Quota enforcement
    if (result.usage) {
      const quota = await enforceQuota({
        userId,
        role: auth.role,
        month,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        model: result.modelUsed,
      });

      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: 'Quota exceeded',
            reason: quota.reason,
            tokensUsed: quota.tokensUsed,
            tokensLimit: quota.tokensLimit,
            plan: quota.planId,
          },
          { status: 402 }
        );
      }
    }

    // Detectar ações que precisam ser executadas pelo frontend
    const pendingActions = result.toolsUsed
      .filter(t => {
        try {
          const parsed = JSON.parse(t.result);
          return parsed.action && ['orchestrate', 'twin-builder'].includes(parsed.action);
        } catch { return false; }
      })
      .map(t => {
        try {
          return JSON.parse(t.result);
        } catch { return null; }
      })
      .filter(Boolean);

    return NextResponse.json({
      response: result.response,
      thinking: result.thinking,
      toolsUsed: result.toolsUsed.map(t => ({
        tool: t.toolCallId,
        success: t.success,
        timestamp: t.timestamp,
      })),
      sessionState: {
        ...result.sessionState,
        lastToolResults: result.sessionState.lastToolResults.map(r => ({
          tool: r.tool,
          timestamp: r.timestamp,
        })),
      },
      suggestedNextAction: result.suggestedNextAction,
      pendingActions,
      usage: result.usage,
      model: result.modelUsed,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const errorStack = err instanceof Error ? err.stack?.substring(0, 500) : undefined;
    
    console.error('[assist] error', err);
    
    await logEvent({
      action: 'assist_error',
      actor: userId,
      severity: 'error',
      metadata: {
        error: errorMessage,
        stack: errorStack,
      },
    });

    return NextResponse.json(
      { error: errorMessage || 'Erro no LegacyAssist' },
      { status: 500 }
    );
  }
}

// GET para healthcheck
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'LegacyAssist',
    version: '2.0',
    capabilities: [
      'reasoning-loop',
      'tool-use',
      'dynamic-context',
      'proactive-personality',
    ],
  });
}
