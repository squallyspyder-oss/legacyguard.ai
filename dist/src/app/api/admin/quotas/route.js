"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const rbac_1 = require("@/lib/rbac");
const quotas_1 = require("@/lib/quotas");
async function GET(req) {
    const auth = await (0, rbac_1.requirePermission)('config:read');
    if (!auth.authorized)
        return auth.response;
    try {
        const url = new URL(req.url);
        const userId = url.searchParams.get('userId');
        if (userId) {
            const month = (0, quotas_1.getCurrentMonth)();
            const quota = await (0, quotas_1.getQuotaStatus)({ userId, role: 'developer', month });
            const circuit = await (0, quotas_1.getCircuitStatus)();
            return server_1.NextResponse.json({ quota, circuit });
        }
        // No userId: return circuit status and basic note
        const circuit = await (0, quotas_1.getCircuitStatus)();
        return server_1.NextResponse.json({ message: 'Provide ?userId= to get per-user quota', circuit });
    }
    catch (err) {
        return server_1.NextResponse.json({ error: err.message || 'failed' }, { status: 500 });
    }
}
