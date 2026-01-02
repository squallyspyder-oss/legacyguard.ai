"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MainLayout;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_2 = require("next-auth/react");
const Sidebar_1 = __importDefault(require("./Sidebar"));
const ChatContainer_1 = __importDefault(require("../chat/ChatContainer"));
const SettingsPanel_1 = __importDefault(require("../settings/SettingsPanel"));
const LegacyAssistOverlay_1 = __importDefault(require("../assist/LegacyAssistOverlay"));
const OnboardingTour_1 = require("../OnboardingTour");
const OnboardingTour_2 = __importDefault(require("../OnboardingTour"));
const defaultSettings = {
    sandboxEnabled: true,
    sandboxMode: "fail",
    safeMode: true,
    reviewGate: true,
    maskingEnabled: true,
    workerEnabled: true,
    apiEnabled: false,
    ragReady: false,
    deepSearch: false,
    billingCap: 20,
    tokenCap: 12000,
    temperatureCap: 0.5,
};
function MainLayout() {
    var _a;
    const { data: session } = (0, react_2.useSession)();
    const [sidebarOpen, setSidebarOpen] = (0, react_1.useState)(true);
    const [sidebarCollapsed, setSidebarCollapsed] = (0, react_1.useState)(false);
    const [isMobile, setIsMobile] = (0, react_1.useState)(false);
    const [settingsOpen, setSettingsOpen] = (0, react_1.useState)(false);
    const [settings, setSettings] = (0, react_1.useState)(defaultSettings);
    const [sessions, setSessions] = (0, react_1.useState)([]);
    const [sessionsLoading, setSessionsLoading] = (0, react_1.useState)(false);
    const [activeSessionId, setActiveSessionId] = (0, react_1.useState)(null);
    // LegacyAssist state
    const [assistActive, setAssistActive] = (0, react_1.useState)(false);
    const [assistStep, setAssistStep] = (0, react_1.useState)(null);
    // Quick action from sidebar -> ChatContainer
    const [quickAgentRole, setQuickAgentRole] = (0, react_1.useState)(null);
    const [quickPrompt, setQuickPrompt] = (0, react_1.useState)(null);
    // Handler for sidebar quick actions
    const handleQuickAction = (0, react_1.useCallback)((action) => {
        // action pode ser: agentRole (orchestrate, chat, etc) ou prompt completo
        const agentKeys = ['legacyAssist', 'chat', 'orchestrate', 'advisor', 'operator', 'reviewer', 'executor'];
        if (agentKeys.includes(action)) {
            setQuickAgentRole(action);
            setQuickPrompt(null);
        }
        else {
            // É um prompt - usar orchestrate para ações complexas
            setQuickPrompt(action);
            setQuickAgentRole('orchestrate');
        }
        // Fechar sidebar em mobile
        if (isMobile)
            setSidebarOpen(false);
    }, [isMobile]);
    // Onboarding
    const onboarding = (0, OnboardingTour_1.useOnboarding)(((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email) ? `lg:${session.user.email}` : "lg:anon");
    // Mobile detection
    (0, react_1.useEffect)(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) {
                setSidebarOpen(false);
                setSidebarCollapsed(false);
            }
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);
    // Load sessions
    (0, react_1.useEffect)(() => {
        const loadSessions = async () => {
            setSessionsLoading(true);
            try {
                const res = await fetch("/api/sessions");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.sessions)) {
                        setSessions(data.sessions);
                        setSessionsLoading(false);
                        return;
                    }
                }
            }
            catch {
                // Network error - continue with empty sessions
            }
            // No sessions found or API error - start fresh
            setSessions([]);
            setSessionsLoading(false);
        };
        loadSessions();
    }, []);
    // Load config from server
    (0, react_1.useEffect)(() => {
        const loadConfig = async () => {
            try {
                const res = await fetch("/api/config");
                if (res.ok) {
                    const data = await res.json();
                    const cfg = data.config || {};
                    setSettings((prev) => {
                        var _a, _b, _c, _d, _e, _f;
                        return ({
                            ...prev,
                            sandboxEnabled: (_a = cfg.sandboxEnabled) !== null && _a !== void 0 ? _a : prev.sandboxEnabled,
                            sandboxMode: (_b = cfg.sandboxFailMode) !== null && _b !== void 0 ? _b : prev.sandboxMode,
                            safeMode: (_c = cfg.safeMode) !== null && _c !== void 0 ? _c : prev.safeMode,
                            workerEnabled: (_d = cfg.workerEnabled) !== null && _d !== void 0 ? _d : prev.workerEnabled,
                            maskingEnabled: (_e = cfg.maskingEnabled) !== null && _e !== void 0 ? _e : prev.maskingEnabled,
                            deepSearch: (_f = cfg.deepSearch) !== null && _f !== void 0 ? _f : prev.deepSearch,
                        });
                    });
                }
            }
            catch {
                // Keep defaults
            }
        };
        loadConfig();
    }, []);
    const handleUpdateSettings = (0, react_1.useCallback)((updates) => {
        setSettings((prev) => ({ ...prev, ...updates }));
    }, []);
    const handleNewChat = (0, react_1.useCallback)(() => {
        setActiveSessionId(null);
    }, []);
    const handleSelectSession = (0, react_1.useCallback)((sessionItem) => {
        setActiveSessionId(sessionItem.id);
        if (isMobile)
            setSidebarOpen(false);
    }, [isMobile]);
    const handleAssistAction = (0, react_1.useCallback)((step) => {
        setAssistStep(step);
    }, []);
    const toggleSidebar = (0, react_1.useCallback)(() => {
        if (isMobile) {
            setSidebarOpen(!sidebarOpen);
        }
        else {
            setSidebarCollapsed(!sidebarCollapsed);
        }
    }, [isMobile, sidebarOpen, sidebarCollapsed]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex h-screen overflow-hidden bg-background", children: [(0, jsx_runtime_1.jsx)(Sidebar_1.default, { isOpen: sidebarOpen, isCollapsed: sidebarCollapsed, isMobile: isMobile, onToggle: toggleSidebar, onClose: () => setSidebarOpen(false), session: session, sessions: sessions, sessionsLoading: sessionsLoading, activeSessionId: activeSessionId, onSelectSession: handleSelectSession, onNewChat: handleNewChat, onOpenSettings: () => setSettingsOpen(true), onStartTour: onboarding.startTour, settings: settings, onQuickAction: handleQuickAction }), isMobile && sidebarOpen && ((0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in", onClick: () => setSidebarOpen(false) })), (0, jsx_runtime_1.jsx)("main", { className: "flex-1 flex flex-col min-w-0 relative", children: (0, jsx_runtime_1.jsx)(ChatContainer_1.default, { session: session, settings: settings, isMobile: isMobile, sidebarCollapsed: sidebarCollapsed, onToggleSidebar: toggleSidebar, onOpenSettings: () => setSettingsOpen(true), assistActive: assistActive, onAssistToggle: setAssistActive, onAssistAction: handleAssistAction, quickAgentRole: quickAgentRole, quickPrompt: quickPrompt, onQuickActionConsumed: () => { setQuickAgentRole(null); setQuickPrompt(null); } }) }), (0, jsx_runtime_1.jsx)(SettingsPanel_1.default, { isOpen: settingsOpen, onClose: () => setSettingsOpen(false), settings: settings, onUpdateSettings: handleUpdateSettings }), assistActive && assistStep && ((0, jsx_runtime_1.jsx)(LegacyAssistOverlay_1.default, { step: assistStep, onClose: () => setAssistStep(null), onAction: handleAssistAction })), (0, jsx_runtime_1.jsx)(OnboardingTour_2.default, { isOpen: onboarding.showTour, onClose: onboarding.closeTour, onComplete: onboarding.completeTour })] }));
}
