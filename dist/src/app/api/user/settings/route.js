"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
exports.DELETE = DELETE;
const server_1 = require("next/server");
const next_auth_1 = require("next-auth");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), '.legacyguard');
const USERS_DIR = path_1.default.join(DATA_DIR, 'users');
const defaultUserSettings = {
    displayName: '',
    email: '',
    avatarUrl: undefined,
    timezone: 'America/Sao_Paulo',
    language: 'pt-BR',
    theme: 'dark',
    compactMode: false,
    showTimestamps: true,
    soundEnabled: false,
    emailNotifications: true,
    desktopNotifications: true,
    notifyOnComplete: true,
    notifyOnError: true,
    dailyDigest: false,
    defaultAgent: 'orchestrate',
    autoSuggestAgents: true,
    showAgentThinking: true,
    streamResponses: true,
    shareAnalytics: false,
    saveHistory: true,
    historyRetentionDays: 30,
    shortcuts: {
        newChat: 'Ctrl+N',
        toggleSidebar: 'Ctrl+B',
        openSettings: 'Ctrl+,',
        focusInput: '/',
    },
    developerMode: false,
    verboseLogs: false,
    experimentalFeatures: false,
};
function ensureUserDir(userId) {
    const userDir = path_1.default.join(USERS_DIR, userId);
    if (!fs_1.default.existsSync(userDir)) {
        fs_1.default.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
}
function getUserSettingsPath(userId) {
    return path_1.default.join(USERS_DIR, userId, 'settings.json');
}
function sanitizeUserId(email) {
    return email.replace(/[^a-zA-Z0-9]/g, '_');
}
function readUserSettings(userId) {
    try {
        const settingsPath = getUserSettingsPath(userId);
        if (!fs_1.default.existsSync(settingsPath)) {
            return { ...defaultUserSettings };
        }
        const raw = fs_1.default.readFileSync(settingsPath, 'utf-8');
        const saved = JSON.parse(raw);
        return { ...defaultUserSettings, ...saved };
    }
    catch {
        return { ...defaultUserSettings };
    }
}
function writeUserSettings(userId, settings) {
    ensureUserDir(userId);
    const settingsPath = getUserSettingsPath(userId);
    fs_1.default.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}
async function GET(req) {
    var _a, _b, _c;
    try {
        const session = await (0, next_auth_1.getServerSession)();
        const email = (_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email;
        if (!email) {
            // Return defaults for anonymous users
            return server_1.NextResponse.json({
                settings: defaultUserSettings,
                authenticated: false
            });
        }
        const userId = sanitizeUserId(email);
        const settings = readUserSettings(userId);
        // Update with session info
        settings.email = email;
        settings.displayName = settings.displayName || ((_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.name) || email.split('@')[0];
        settings.avatarUrl = settings.avatarUrl || ((_c = session === null || session === void 0 ? void 0 : session.user) === null || _c === void 0 ? void 0 : _c.image) || undefined;
        return server_1.NextResponse.json({
            settings,
            authenticated: true
        });
    }
    catch (error) {
        console.error('[user-settings] Error loading settings:', error);
        return server_1.NextResponse.json({
            settings: defaultUserSettings,
            authenticated: false,
            error: 'Failed to load settings'
        });
    }
}
async function POST(req) {
    var _a;
    try {
        const session = await (0, next_auth_1.getServerSession)();
        const email = (_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email;
        if (!email) {
            return server_1.NextResponse.json({
                error: 'Authentication required to save settings'
            }, { status: 401 });
        }
        const body = await req.json().catch(() => ({}));
        const updates = body === null || body === void 0 ? void 0 : body.settings;
        if (!updates || typeof updates !== 'object') {
            return server_1.NextResponse.json({
                error: 'Invalid settings object'
            }, { status: 400 });
        }
        const userId = sanitizeUserId(email);
        const currentSettings = readUserSettings(userId);
        // Merge updates (prevent overwriting email)
        const newSettings = {
            ...currentSettings,
            ...updates,
            email, // Always use session email
        };
        writeUserSettings(userId, newSettings);
        return server_1.NextResponse.json({
            saved: true,
            settings: newSettings
        });
    }
    catch (error) {
        console.error('[user-settings] Error saving settings:', error);
        return server_1.NextResponse.json({
            error: 'Failed to save settings'
        }, { status: 500 });
    }
}
async function DELETE(req) {
    var _a;
    try {
        const session = await (0, next_auth_1.getServerSession)();
        const email = (_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email;
        if (!email) {
            return server_1.NextResponse.json({
                error: 'Authentication required'
            }, { status: 401 });
        }
        const userId = sanitizeUserId(email);
        const settingsPath = getUserSettingsPath(userId);
        if (fs_1.default.existsSync(settingsPath)) {
            fs_1.default.unlinkSync(settingsPath);
        }
        return server_1.NextResponse.json({
            deleted: true,
            settings: defaultUserSettings
        });
    }
    catch (error) {
        console.error('[user-settings] Error deleting settings:', error);
        return server_1.NextResponse.json({
            error: 'Failed to delete settings'
        }, { status: 500 });
    }
}
