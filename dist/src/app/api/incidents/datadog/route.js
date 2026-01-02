"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const ingest_1 = require("../ingest");
function normalizeDatadog(payload) {
    const alert = (payload === null || payload === void 0 ? void 0 : payload.event) || payload;
    return {
        id: (alert === null || alert === void 0 ? void 0 : alert.id) || `dd-${Date.now()}`,
        source: 'datadog',
        title: (alert === null || alert === void 0 ? void 0 : alert.title) || (alert === null || alert === void 0 ? void 0 : alert.text) || 'Datadog alert',
        stack: (alert === null || alert === void 0 ? void 0 : alert.alert_type) || undefined,
        payload,
        repo: {
            url: (alert === null || alert === void 0 ? void 0 : alert.url) || undefined,
        },
    };
}
async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const incident = normalizeDatadog(body);
    const result = await (0, ingest_1.enqueueIncident)({ incident, repoPath: body.repoPath, sandbox: body.sandbox });
    return server_1.NextResponse.json(result);
}
