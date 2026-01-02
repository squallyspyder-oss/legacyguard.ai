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
const CONFIG_FILE = path_1.default.join(DATA_DIR, 'config.json');
const DEFAULT_CONFIG = {
    sandboxEnabled: true,
    sandboxFailMode: 'fail',
    safeMode: true,
    workerEnabled: true,
    maskingEnabled: true,
    deepSearch: false,
};
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR))
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
function readConfig() {
    try {
        if (!fs_1.default.existsSync(CONFIG_FILE))
            return { ...DEFAULT_CONFIG };
        const raw = fs_1.default.readFileSync(CONFIG_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
function writeConfig(cfg) {
    ensureDataDir();
    fs_1.default.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}
async function GET() {
    const cfg = readConfig();
    return server_1.NextResponse.json({ config: cfg });
}
async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const current = readConfig();
    const merged = { ...current, ...body };
    writeConfig(merged);
    return server_1.NextResponse.json({ saved: true, config: merged });
}
