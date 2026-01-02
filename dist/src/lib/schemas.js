"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configUpdateSchema = exports.playbookSchema = exports.incidentIngestSchema = exports.indexRequestSchema = exports.chatRequestSchema = exports.agentsRequestSchema = exports.agentsDirectSchema = exports.agentsApproveSchema = exports.agentsOrchestrateSchema = exports.executionPolicySchema = exports.sandboxConfigSchema = exports.repoInfoSchema = void 0;
exports.validateRequest = validateRequest;
exports.validationErrorResponse = validationErrorResponse;
// Zod schemas for API request validation
const zod_1 = require("zod");
// ============ Common schemas ============
// Helper for record with unknown values (Zod v4 syntax)
const unknownRecord = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
exports.repoInfoSchema = zod_1.z.object({
    provider: zod_1.z.enum(['github', 'gitlab', 'bitbucket']).default('github'),
    owner: zod_1.z.string().min(1),
    repo: zod_1.z.string().min(1),
    branch: zod_1.z.string().optional(),
});
exports.sandboxConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().optional(),
    repoPath: zod_1.z.string().optional(),
    command: zod_1.z.string().optional(),
    runnerPath: zod_1.z.string().optional(),
    timeoutMs: zod_1.z.number().positive().max(1800000).optional(), // max 30min
    failMode: zod_1.z.enum(['fail', 'warn']).optional(),
    languageHint: zod_1.z.string().optional(),
});
exports.executionPolicySchema = zod_1.z.object({
    allowedAgents: zod_1.z.array(zod_1.z.enum(['advisor', 'operator', 'executor', 'reviewer', 'advisor-impact'])).optional(),
    requireApprovalFor: zod_1.z.array(zod_1.z.enum(['executor', 'operator'])).optional(),
    forbiddenKeywords: zod_1.z.array(zod_1.z.string()).optional(),
});
// ============ /api/agents schemas ============
exports.agentsOrchestrateSchema = zod_1.z.object({
    role: zod_1.z.literal('orchestrate'),
    request: zod_1.z.string().min(1, 'Campo "request" obrigatório').max(10000),
    context: unknownRecord.optional(),
    sandbox: exports.sandboxConfigSchema.optional(),
    safeMode: zod_1.z.boolean().optional(),
    executionPolicy: exports.executionPolicySchema.optional(),
    guardrails: unknownRecord.optional(),
});
exports.agentsApproveSchema = zod_1.z.object({
    role: zod_1.z.literal('approve'),
    orchestrationId: zod_1.z.string().min(1, 'Campo "orchestrationId" obrigatório'),
});
exports.agentsDirectSchema = zod_1.z.object({
    role: zod_1.z.enum(['advisor', 'operator', 'executor', 'reviewer', 'advisor-impact', 'planner']),
    payload: unknownRecord.optional(),
});
exports.agentsRequestSchema = zod_1.z.discriminatedUnion('role', [
    exports.agentsOrchestrateSchema,
    exports.agentsApproveSchema,
    // For direct agent calls, we use a more flexible schema
]).or(exports.agentsDirectSchema);
// ============ /api/chat schemas ============
exports.chatRequestSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(10000),
    history: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(['user', 'assistant']),
        content: zod_1.z.string(),
    })).optional(),
    deepSearch: zod_1.z.boolean().optional(),
    context: unknownRecord.optional(),
});
// ============ /api/index schemas ============
exports.indexRequestSchema = zod_1.z.object({
    repoPath: zod_1.z.string().optional(),
    githubUrl: zod_1.z.string().url().optional(),
    includePatterns: zod_1.z.array(zod_1.z.string()).optional(),
    excludePatterns: zod_1.z.array(zod_1.z.string()).optional(),
});
// ============ /api/incidents schemas ============
exports.incidentIngestSchema = zod_1.z.object({
    source: zod_1.z.enum(['sentry', 'datadog', 'otel', 'manual']),
    incidentId: zod_1.z.string().min(1),
    title: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    severity: zod_1.z.enum(['critical', 'high', 'medium', 'low']).optional(),
    metadata: unknownRecord.optional(),
    repoPath: zod_1.z.string().optional(),
});
// ============ /api/playbooks schemas ============
exports.playbookSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    description: zod_1.z.string().optional(),
    steps: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        action: zod_1.z.string(),
        params: unknownRecord.optional(),
        condition: zod_1.z.string().optional(),
        onFailure: zod_1.z.enum(['abort', 'continue', 'retry']).optional(),
    })).min(1),
    triggers: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['incident', 'schedule', 'webhook', 'manual']),
        config: unknownRecord.optional(),
    })).optional(),
});
// ============ /api/config schemas ============
exports.configUpdateSchema = zod_1.z.object({
    sandboxEnabled: zod_1.z.boolean().optional(),
    sandboxMode: zod_1.z.enum(['fail', 'warn']).optional(),
    safeMode: zod_1.z.boolean().optional(),
    reviewGate: zod_1.z.boolean().optional(),
    workerEnabled: zod_1.z.boolean().optional(),
    maskingEnabled: zod_1.z.boolean().optional(),
    tokenCap: zod_1.z.number().positive().optional(),
    temperatureCap: zod_1.z.number().min(0).max(2).optional(),
});
function validateRequest(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const issues = result.error.issues;
    return {
        success: false,
        error: issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        details: issues,
    };
}
// NextResponse helper for validation errors
const server_1 = require("next/server");
function validationErrorResponse(error, details) {
    return server_1.NextResponse.json({
        error: 'Validation Error',
        message: error,
        details,
    }, { status: 400 });
}
