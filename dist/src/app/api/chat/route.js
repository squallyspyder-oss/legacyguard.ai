"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const chat_1 = require("@/agents/chat");
const rate_limit_1 = require("@/lib/rate-limit");
const schemas_1 = require("@/lib/schemas");
const rbac_1 = require("@/lib/rbac");
const quotas_1 = require("@/lib/quotas");
const boot_1 = require("@/lib/boot");
async function POST(req) {
    var _a, _b;
    (0, boot_1.logBootDiagnostics)('chat-route');
    console.log('[chat] frontend request received');
    // Rate limiting (standard for chat)
    const rateLimitResult = await (0, rate_limit_1.checkRateLimit)(req, { ...rate_limit_1.RATE_LIMIT_PRESETS.standard, keyPrefix: 'chat' });
    if (!rateLimitResult.allowed) {
        return (0, rate_limit_1.rateLimitResponse)(rateLimitResult.resetAt);
    }
    // RBAC: requer permissão de chat
    const auth = await (0, rbac_1.requirePermission)('chat');
    if (!auth.authorized) {
        return auth.response;
    }
    const userId = ((_a = auth.user) === null || _a === void 0 ? void 0 : _a.email) || ((_b = auth.user) === null || _b === void 0 ? void 0 : _b.id) || 'anonymous';
    const month = (0, quotas_1.getCurrentMonth)();
    try {
        const body = await req.json();
        // Validate request
        const validation = (0, schemas_1.validateRequest)(schemas_1.chatRequestSchema, body);
        if (!validation.success) {
            return (0, schemas_1.validationErrorResponse)(validation.error, validation.details);
        }
        const { message, deepSearch: deep, context } = validation.data;
        const repoPath = context === null || context === void 0 ? void 0 : context.repoPath;
        console.log('[chat] chat request received', { userId, deep: !!deep });
        console.log('[chat] agent invoked');
        const result = await (0, chat_1.runChat)({ message, deep: deep || false, repoPath });
        // Quota enforcement after actual usage is known
        if (result.usage) {
            const quota = await (0, quotas_1.enforceQuota)({
                userId,
                role: auth.role,
                month,
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                model: result.modelUsed,
            });
            if (!quota.allowed) {
                return server_1.NextResponse.json({
                    error: 'Quota exceeded',
                    reason: quota.reason,
                    tokensUsed: quota.tokensUsed,
                    tokensLimit: quota.tokensLimit,
                    plan: quota.planId,
                }, { status: 402 });
            }
        }
        return server_1.NextResponse.json({
            reply: result.reply,
            suggestOrchestrate: result.suggestOrchestrate,
            costTier: result.costTier,
            usage: result.usage,
        });
    }
    catch (err) {
        console.error('[chat] backend error', err);
        return server_1.NextResponse.json({ error: err.message || 'Erro no modo chat' }, { status: 500 });
    }
}
