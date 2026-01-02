"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const rbac_1 = require("@/lib/rbac");
const quotas_1 = require("@/lib/quotas");
async function POST(req) {
    const auth = await (0, rbac_1.requirePermission)('config:write');
    if (!auth.authorized)
        return auth.response;
    try {
        const body = await req.json();
        // Either reconcile usage or reset circuit
        if (body.resetCircuit) {
            const ok = await (0, quotas_1.resetCircuit)();
            return server_1.NextResponse.json({ resetCircuit: ok });
        }
        const { userId, month, tokensDelta = 0, usdDelta = 0, day } = body;
        if (!userId || !month)
            return server_1.NextResponse.json({ error: 'userId and month required' }, { status: 400 });
        const ok = await (0, quotas_1.adjustUserUsage)({ userId, month, tokensDelta, usdDelta, day });
        if (!ok)
            return server_1.NextResponse.json({ error: 'adjust failed' }, { status: 500 });
        return server_1.NextResponse.json({ adjusted: true, userId, month, tokensDelta, usdDelta });
    }
    catch (err) {
        return server_1.NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
    }
}
