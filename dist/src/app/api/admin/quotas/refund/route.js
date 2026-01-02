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
        const { taskId } = body;
        if (!taskId)
            return server_1.NextResponse.json({ error: 'taskId required' }, { status: 400 });
        const ok = await (0, quotas_1.refundReservation)(taskId);
        if (!ok)
            return server_1.NextResponse.json({ error: 'refund failed or reservation not found' }, { status: 500 });
        return server_1.NextResponse.json({ refunded: true, taskId });
    }
    catch (err) {
        return server_1.NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
    }
}
