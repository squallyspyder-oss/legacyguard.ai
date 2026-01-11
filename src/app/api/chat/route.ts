import { NextRequest, NextResponse } from 'next/server';
import { runChat } from '@/agents/chat';
import { checkRateLimit, rateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { chatRequestSchema, validateRequest, validationErrorResponse } from '@/lib/schemas';
import { requirePermission } from '@/lib/rbac';
import { enforceQuota, getCurrentMonth } from '@/lib/quotas';
import { logBootDiagnostics } from '@/lib/boot';

export async function POST(req: NextRequest) {
  logBootDiagnostics('chat-route');
  console.log('[chat] frontend request received');
  // Rate limiting (standard for chat)
  const rateLimitResult = await checkRateLimit(req, { ...RATE_LIMIT_PRESETS.standard, keyPrefix: 'chat' });
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult.resetAt);
  }

  // RBAC: requer permissão de chat
  const auth = await requirePermission('chat');
  if (!auth.authorized) {
    return auth.response;
  }

  const userId = auth.user?.email || auth.user?.id || 'anonymous';
  const month = getCurrentMonth();

  try {
    const body = await req.json();

    // Validate request
    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success) {
      return validationErrorResponse(validation.error, validation.details);
    }

    const { message, deepSearch: deep, context } = validation.data;
    const repoPath = (context as any)?.repoPath as string | undefined;
    const repoContext = (context as any)?.repoContext as {
      summary?: string;
      structure?: string;
      mainFiles?: string[];
      stats?: { totalFiles: number; languages: Record<string, number> };
    } | undefined;
    console.log('[chat] chat request received', { userId, deep: !!deep, hasRepoContext: !!repoContext });

    console.log('[chat] agent invoked');
    const result = await runChat({ message, deep: deep || false, repoPath, repoContext });

    // Quota enforcement after actual usage is known
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

    return NextResponse.json({
      reply: result.reply,
      suggestOrchestrate: result.suggestOrchestrate,
      costTier: result.costTier,
      usage: result.usage,
    });
  } catch (err: any) {
    console.error('[chat] backend error', err);
    return NextResponse.json({ error: err.message || 'Erro no modo chat' }, { status: 500 });
  }
}
