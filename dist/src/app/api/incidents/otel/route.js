"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const ingest_1 = require("../ingest");
function normalizeOtel(payload) {
    var _a, _b;
    const attrs = ((_a = payload === null || payload === void 0 ? void 0 : payload.resource) === null || _a === void 0 ? void 0 : _a.attributes) || (payload === null || payload === void 0 ? void 0 : payload.resourceAttributes) || {};
    const scope = (payload === null || payload === void 0 ? void 0 : payload.scope) || (payload === null || payload === void 0 ? void 0 : payload.instrumentationScope) || {};
    return {
        id: (payload === null || payload === void 0 ? void 0 : payload.traceId) || (payload === null || payload === void 0 ? void 0 : payload.spanId) || `otel-${Date.now()}`,
        source: 'otel',
        title: (payload === null || payload === void 0 ? void 0 : payload.name) || (payload === null || payload === void 0 ? void 0 : payload.eventName) || 'OpenTelemetry event',
        stack: (payload === null || payload === void 0 ? void 0 : payload.stack) || ((_b = payload === null || payload === void 0 ? void 0 : payload.exception) === null || _b === void 0 ? void 0 : _b.stacktrace) || undefined,
        payload,
        repo: {
            url: attrs['service.name'] || undefined,
            owner: attrs['service.namespace'] || undefined,
        },
        scope,
    };
}
async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const incident = normalizeOtel(body);
    const result = await (0, ingest_1.enqueueIncident)({ incident, repoPath: body.repoPath, sandbox: body.sandbox });
    return server_1.NextResponse.json(result);
}
