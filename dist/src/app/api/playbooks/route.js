"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const playbook_dsl_1 = require("@/lib/playbook-dsl");
async function POST(req) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.dsl !== 'string') {
        return server_1.NextResponse.json({ error: 'Campo dsl obrigatório' }, { status: 400 });
    }
    try {
        const parsed = (0, playbook_dsl_1.parsePlaybook)(body.dsl);
        return server_1.NextResponse.json({ playbook: parsed });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return server_1.NextResponse.json({ error: msg }, { status: 400 });
    }
}
