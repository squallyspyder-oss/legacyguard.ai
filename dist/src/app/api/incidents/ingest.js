"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueIncident = enqueueIncident;
/* eslint-disable @typescript-eslint/no-explicit-any */
const queue_1 = require("../../../lib/queue");
const audit_1 = require("../../../lib/audit");
async function enqueueIncident(options) {
    var _a;
    const taskId = `incident-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
        role: 'twin-builder',
        taskId,
        incident: options.incident,
        repoPath: options.repoPath || process.env.LEGACYGUARD_REPO_PATH || process.cwd(),
        sandbox: options.sandbox || { enabled: true, failMode: 'fail' },
    };
    await (0, queue_1.enqueueTask)('agents', payload);
    try {
        await (0, audit_1.logEvent)({
            action: 'incident_enqueued',
            severity: 'info',
            message: `Twin builder enfileirado (${taskId})`,
            metadata: { taskId, source: (_a = options.incident) === null || _a === void 0 ? void 0 : _a.source },
        });
    }
    catch (e) {
        console.warn('Falha ao auditar incidente', e);
    }
    return {
        queued: true,
        taskId,
        streamUrl: `/api/agents/stream?taskId=${taskId}`,
        logsUrl: `/api/agents/logs?taskId=${taskId}`,
    };
}
