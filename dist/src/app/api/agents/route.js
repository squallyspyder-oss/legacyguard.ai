"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const queue_1 = require("../../../lib/queue");
const audit_1 = require("../../../lib/audit");
const sandbox_logs_1 = require("../../../lib/sandbox-logs");
const rate_limit_1 = require("../../../lib/rate-limit");
const schemas_1 = require("../../../lib/schemas");
const rbac_1 = require("../../../lib/rbac");
const quotas_1 = require("../../../lib/quotas");
async function POST(req) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    // Rate limiting (strict for expensive LLM operations)
    const rateLimitResult = await (0, rate_limit_1.checkRateLimit)(req, { ...rate_limit_1.RATE_LIMIT_PRESETS.strict, keyPrefix: 'agents' });
    if (!rateLimitResult.allowed) {
        return (0, rate_limit_1.rateLimitResponse)(rateLimitResult.resetAt);
    }
    const body = await req.json();
    // Validate request body
    const validation = (0, schemas_1.validateRequest)(schemas_1.agentsRequestSchema, body);
    if (!validation.success) {
        return (0, schemas_1.validationErrorResponse)(validation.error, validation.details);
    }
    // Suporta: { role, payload } ou { role: 'orchestrate', request, context }
    if (!(body === null || body === void 0 ? void 0 : body.role)) {
        return server_1.NextResponse.json({ error: 'Campo "role" obrigatório' }, { status: 400 });
    }
    // RBAC: exige permissão conforme tipo de operação
    const requiredPermission = body.role === 'orchestrate' ? 'orchestrate' : body.role === 'approve' ? 'approve' : 'execute';
    const auth = await (0, rbac_1.requirePermission)(requiredPermission);
    if (!auth.authorized) {
        return auth.response;
    }
    // Circuit breaker: global cost spike protection
    if ((0, quotas_1.isCircuitTripped)()) {
        const status = await (0, quotas_1.getCircuitStatus)();
        return server_1.NextResponse.json({ error: 'Service temporarily paused due to abnormal usage', circuit: status }, { status: 503 });
    }
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Montar payload baseado no tipo de tarefa
    let queuePayload;
    if (body.role === 'orchestrate') {
        // Orquestração completa: Planner → Agentes coordenados
        if (!body.request) {
            return server_1.NextResponse.json({ error: 'Campo "request" obrigatório para orquestração' }, { status: 400 });
        }
        const baseContext = body.context || {};
        // Sandbox opcional: permite rodar testes em container antes de executor.
        const envSandboxEnabled = process.env.LEGACYGUARD_SANDBOX_ENABLED === 'true';
        const sandboxConfig = {
            enabled: (_b = (_a = body.sandbox) === null || _a === void 0 ? void 0 : _a.enabled) !== null && _b !== void 0 ? _b : envSandboxEnabled,
            repoPath: ((_c = body.sandbox) === null || _c === void 0 ? void 0 : _c.repoPath) || process.env.LEGACYGUARD_SANDBOX_REPO_PATH || process.cwd(),
            command: ((_d = body.sandbox) === null || _d === void 0 ? void 0 : _d.command) || process.env.LEGACYGUARD_SANDBOX_COMMAND || undefined,
            runnerPath: ((_e = body.sandbox) === null || _e === void 0 ? void 0 : _e.runnerPath) || process.env.LEGACYGUARD_SANDBOX_RUNNER || `${process.cwd()}/scripts/runner_sandbox.sh`,
            timeoutMs: (_g = (_f = body.sandbox) === null || _f === void 0 ? void 0 : _f.timeoutMs) !== null && _g !== void 0 ? _g : (process.env.LEGACYGUARD_SANDBOX_TIMEOUT_MS ? Number(process.env.LEGACYGUARD_SANDBOX_TIMEOUT_MS) : undefined),
            failMode: ((_h = body.sandbox) === null || _h === void 0 ? void 0 : _h.failMode) || process.env.LEGACYGUARD_SANDBOX_FAIL_MODE || 'fail',
            languageHint: (_j = body.sandbox) === null || _j === void 0 ? void 0 : _j.languageHint,
        };
        // Pre-run quota enforcement: reserve conservative token estimate
        const userId = ((_k = auth.user) === null || _k === void 0 ? void 0 : _k.email) || ((_l = auth.user) === null || _l === void 0 ? void 0 : _l.id) || 'anonymous';
        const month = (0, quotas_1.getCurrentMonth)();
        const perRequestLimit = Number(process.env.MAX_TOKENS_PER_REQUEST || 50000);
        const estimateTokens = (_m = body.estimateTokens) !== null && _m !== void 0 ? _m : perRequestLimit;
        if (estimateTokens > perRequestLimit) {
            return server_1.NextResponse.json({ error: 'Estimate exceeds per-request token limit', limit: perRequestLimit }, { status: 400 });
        }
        const quotaCheck = await (0, quotas_1.enforceQuota)({ userId, role: auth.role, month, promptTokens: estimateTokens, completionTokens: 0, model: process.env.OPENAI_DEEP_MODEL || 'gpt-4o' });
        if (!quotaCheck.allowed) {
            return server_1.NextResponse.json({ error: 'Quota exceeded', reason: quotaCheck.reason, plan: quotaCheck.planId }, { status: 402 });
        }
        // Create reservation so worker can refund if orchestration fails
        const estCost = estimateTokens * 0.0001; // conservative USD estimate when exact cost unknown
        try {
            await (0, quotas_1.reserveQuota)({ taskId, userId, month, tokens: estimateTokens, usd: estCost });
        }
        catch { }
        queuePayload = {
            role: 'orchestrate',
            taskId,
            request: body.request,
            context: {
                taskId,
                ...baseContext,
                ...((sandboxConfig === null || sandboxConfig === void 0 ? void 0 : sandboxConfig.enabled) ? { sandbox: sandboxConfig } : {}),
                safeMode: (_o = body.safeMode) !== null && _o !== void 0 ? _o : baseContext.safeMode,
                repoPath: baseContext.repoPath || process.env.LEGACYGUARD_REPO_PATH || process.cwd(),
                ...(body.executionPolicy ? { executionPolicy: body.executionPolicy } : {}),
                ...(body.guardrails ? { guardrails: body.guardrails } : {}),
            },
        };
    }
    else if (body.role === 'approve') {
        // Aprovar orquestração pendente
        if (!body.orchestrationId) {
            return server_1.NextResponse.json({ error: 'Campo "orchestrationId" obrigatório' }, { status: 400 });
        }
        queuePayload = {
            role: 'approve',
            taskId,
            orchestrationId: body.orchestrationId,
        };
    }
    else {
        // Execução direta de agente individual
        queuePayload = {
            role: body.role,
            taskId,
            ...body.payload,
        };
    }
    const id = await (0, queue_1.enqueueTask)('agents', queuePayload);
    // Audit: registra enfileiramento (sem tokens)
    try {
        await (0, audit_1.logEvent)({
            action: 'agent_enqueued',
            severity: 'info',
            message: `Tarefa ${taskId} enfileirada para role ${body.role}`,
            metadata: {
                role: body.role,
                taskId,
                orchestration: body.role === 'orchestrate',
            },
        });
        (0, sandbox_logs_1.emitSandboxLog)({ taskId, message: `[audit] Tarefa ${taskId} enfileirada (${body.role})`, scope: 'audit' });
    }
    catch (err) {
        console.warn('Falha ao gravar audit log', err);
    }
    return server_1.NextResponse.json({
        queued: true,
        id,
        taskId,
        streamUrl: `/api/agents/stream?taskId=${taskId}`,
    });
}
