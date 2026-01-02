"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const ingest_1 = require("./ingest");
async function POST(req) {
    const body = await req.json().catch(() => ({}));
    if (!(body === null || body === void 0 ? void 0 : body.incident)) {
        return server_1.NextResponse.json({ error: 'Campo incident é obrigatório' }, { status: 400 });
    }
    const result = await (0, ingest_1.enqueueIncident)({
        incident: body.incident,
        repoPath: body.repoPath,
        sandbox: body.sandbox,
    });
    return server_1.NextResponse.json(result);
}
