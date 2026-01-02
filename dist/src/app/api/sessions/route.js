"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
const server_1 = require("next/server");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), '.legacyguard');
const SESSIONS_FILE = path_1.default.join(DATA_DIR, 'sessions.json');
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR))
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
function readSessions() {
    try {
        if (!fs_1.default.existsSync(SESSIONS_FILE))
            return [];
        const raw = fs_1.default.readFileSync(SESSIONS_FILE, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
function writeSessions(sessions) {
    ensureDataDir();
    fs_1.default.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}
async function GET() {
    const sessions = readSessions();
    return server_1.NextResponse.json({ sessions });
}
async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const title = body === null || body === void 0 ? void 0 : body.title;
    const tag = body === null || body === void 0 ? void 0 : body.tag;
    const risk = body === null || body === void 0 ? void 0 : body.risk;
    if (!title || !tag || !risk) {
        return server_1.NextResponse.json({ error: 'title, tag, risk são obrigatórios' }, { status: 400 });
    }
    const sessions = readSessions();
    const item = {
        id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        tag,
        risk,
        recency: 'agora',
        createdAt: new Date().toISOString(),
    };
    sessions.unshift(item);
    writeSessions(sessions.slice(0, 50));
    return server_1.NextResponse.json({ saved: true, session: item });
}
