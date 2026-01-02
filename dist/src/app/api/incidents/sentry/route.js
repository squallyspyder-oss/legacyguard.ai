"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const ingest_1 = require("../ingest");
function normalizeSentry(payload) {
    var _a, _b, _c, _d, _e;
    return {
        id: (payload === null || payload === void 0 ? void 0 : payload.event_id) || (payload === null || payload === void 0 ? void 0 : payload.id) || `sentry-${Date.now()}`,
        source: 'sentry',
        title: (payload === null || payload === void 0 ? void 0 : payload.message) || (payload === null || payload === void 0 ? void 0 : payload.title) || 'Sentry alert',
        stack: ((_c = (_b = (_a = payload === null || payload === void 0 ? void 0 : payload.exception) === null || _a === void 0 ? void 0 : _a.values) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.stacktrace) ? JSON.stringify(payload.exception.values[0].stacktrace) : undefined,
        payload,
        repo: {
            url: (payload === null || payload === void 0 ? void 0 : payload.release) || undefined,
            owner: (payload === null || payload === void 0 ? void 0 : payload.project) ? (_d = payload.project.split('/')) === null || _d === void 0 ? void 0 : _d[0] : undefined,
            name: (payload === null || payload === void 0 ? void 0 : payload.project) ? (_e = payload.project.split('/')) === null || _e === void 0 ? void 0 : _e[1] : undefined,
        },
    };
}
async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const incident = normalizeSentry(body);
    const result = await (0, ingest_1.enqueueIncident)({ incident, repoPath: body.repoPath, sandbox: body.sandbox });
    return server_1.NextResponse.json(result);
}
