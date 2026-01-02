"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Sidebar;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_2 = require("next-auth/react");
const lucide_react_1 = require("lucide-react");
const ImportRepoModal_1 = __importDefault(require("../repo/ImportRepoModal"));
const AuthModal_1 = __importDefault(require("../auth/AuthModal"));
function Sidebar({ isOpen, isCollapsed, isMobile, onToggle, onClose, session, sessions, sessionsLoading, activeSessionId, onSelectSession, onNewChat, onOpenSettings, onStartTour, settings, onQuickAction, }) {
    var _a;
    const [searchQuery, setSearchQuery] = (0, react_1.useState)("");
    const [hoveredSession, setHoveredSession] = (0, react_1.useState)(null);
    const [showImportModal, setShowImportModal] = (0, react_1.useState)(false);
    const [showAuthModal, setShowAuthModal] = (0, react_1.useState)(false);
    const filteredSessions = sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const riskColor = (risk) => {
        if (risk === "alto")
            return "text-red-400";
        if (risk === "medio")
            return "text-amber-400";
        return "text-emerald-400";
    };
    const riskBg = (risk) => {
        if (risk === "alto")
            return "bg-red-500/10 border-red-500/30";
        if (risk === "medio")
            return "bg-amber-500/10 border-amber-500/30";
        return "bg-emerald-500/10 border-emerald-500/30";
    };
    // Calculate safety score based on settings
    const safetyScore = [
        settings.sandboxEnabled,
        settings.safeMode,
        settings.reviewGate,
        settings.maskingEnabled,
        settings.workerEnabled,
    ].filter(Boolean).length;
    const expanded = isMobile ? isOpen : !isCollapsed;
    if (isMobile && !isOpen)
        return null;
    return ((0, jsx_runtime_1.jsxs)("aside", { className: `
        ${isMobile ? "fixed inset-y-0 left-0 z-50 w-80" : "relative"}
        ${!isMobile && isCollapsed ? "w-17" : "w-72"}
        flex flex-col bg-sidebar border-r border-sidebar-border
        transition-all duration-300 ease-in-out
        ${isMobile ? "animate-slide-in-left" : ""}
      `, children: [(0, jsx_runtime_1.jsx)("div", { className: "flex items-center justify-between p-4 border-b border-sidebar-border", children: expanded ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)(Logo, { className: "h-8 w-8 shrink-0 animate-logo-glow" }), (0, jsx_runtime_1.jsxs)("div", { className: "min-w-0", children: [(0, jsx_runtime_1.jsx)("h1", { className: "font-bold text-base tracking-tight", children: "LegacyGuard" }), (0, jsx_runtime_1.jsx)("p", { className: "text-[10px] text-muted-foreground uppercase tracking-wider", children: "Security Platform" })] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: onToggle, className: "p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors", title: "Recolher sidebar", children: (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronLeft, { className: "w-4 h-4" }) })] })) : ((0, jsx_runtime_1.jsx)("button", { onClick: onToggle, className: "mx-auto p-2 rounded-lg hover:bg-sidebar-accent transition-colors", title: "Expandir sidebar", children: (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronRight, { className: "w-4 h-4" }) })) }), (0, jsx_runtime_1.jsx)("div", { className: "p-3", children: (0, jsx_runtime_1.jsxs)("button", { onClick: onNewChat, className: `
            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
            bg-primary/10 border border-primary/30 text-primary
            hover:bg-primary/20 hover:border-primary/50
            transition-all duration-200 group
            ${!expanded && "justify-center px-2"}
          `, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Plus, { className: "w-5 h-5 shrink-0 group-hover:rotate-90 transition-transform duration-200" }), expanded && (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-semibold", children: "Nova conversa" })] }) }), expanded && ((0, jsx_runtime_1.jsx)("div", { className: "px-3 pb-3", children: (0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Buscar conversas...", className: "w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-sidebar-accent/50 border border-sidebar-border\n                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40\n                       transition-all duration-200" })] }) })), expanded && ((0, jsx_runtime_1.jsxs)("div", { className: "px-3 pb-3 space-y-2", children: [(0, jsx_runtime_1.jsxs)("button", { onClick: () => setShowImportModal(true), className: "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl\n                     bg-secondary/50 border border-border text-muted-foreground\n                     hover:bg-secondary hover:text-foreground hover:border-primary/30\n                     transition-all duration-200 group", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.GitBranch, { className: "w-4 h-4 group-hover:text-primary transition-colors" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium", children: "Importar Reposit\u00F3rio" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-3 gap-1.5", children: [(0, jsx_runtime_1.jsx)(QuickActionButton, { icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-3.5 h-3.5" }), label: "Assist", onClick: () => onQuickAction === null || onQuickAction === void 0 ? void 0 : onQuickAction("legacyAssist") }), (0, jsx_runtime_1.jsx)(QuickActionButton, { icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Zap, { className: "w-3.5 h-3.5" }), label: "Orquest.", onClick: () => onQuickAction === null || onQuickAction === void 0 ? void 0 : onQuickAction("orchestrate") }), (0, jsx_runtime_1.jsx)(QuickActionButton, { icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-3.5 h-3.5" }), label: "Chat", onClick: () => onQuickAction === null || onQuickAction === void 0 ? void 0 : onQuickAction("chat") })] })] })), (0, jsx_runtime_1.jsxs)("nav", { className: "flex-1 overflow-y-auto px-3 py-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: `flex items-center gap-2 px-2 py-2 ${!expanded && "justify-center"}`, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.History, { className: "w-4 h-4 text-muted-foreground" }), expanded && ((0, jsx_runtime_1.jsx)("span", { className: "text-[11px] font-semibold text-muted-foreground uppercase tracking-wider", children: "Historico" }))] }), sessionsLoading ? ((0, jsx_runtime_1.jsx)("div", { className: "space-y-2 px-2", children: [1, 2, 3].map((i) => ((0, jsx_runtime_1.jsx)("div", { className: "h-14 rounded-lg skeleton" }, i))) })) : filteredSessions.length === 0 ? (expanded && ((0, jsx_runtime_1.jsx)("p", { className: "text-xs text-muted-foreground text-center py-4", children: searchQuery ? "Nenhum resultado encontrado" : "Nenhuma conversa ainda" }))) : ((0, jsx_runtime_1.jsx)("div", { className: "space-y-1", children: filteredSessions.map((s) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => onSelectSession(s), onMouseEnter: () => setHoveredSession(s.id), onMouseLeave: () => setHoveredSession(null), className: `
                  w-full text-left px-3 py-2.5 rounded-lg
                  transition-all duration-200 group relative
                  ${activeSessionId === s.id ? "bg-sidebar-accent border border-sidebar-border" : "hover:bg-sidebar-accent/50"}
                  ${!expanded && "justify-center px-2"}
                `, children: expanded ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-start justify-between gap-2", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-medium truncate flex-1", children: s.title }), hoveredSession === s.id ? ((0, jsx_runtime_1.jsx)("button", { onClick: (e) => {
                                                    e.stopPropagation();
                                                }, className: "p-1 rounded hover:bg-background/50 transition-colors", "aria-label": "Mais opcoes da sessao", children: (0, jsx_runtime_1.jsx)(lucide_react_1.MoreHorizontal, { className: "w-3.5 h-3.5 text-muted-foreground" }) })) : ((0, jsx_runtime_1.jsx)("span", { className: `w-2 h-2 rounded-full ${riskColor(s.risk)} mt-1.5` }))] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 mt-1", children: [(0, jsx_runtime_1.jsx)("span", { className: `text-[10px] px-1.5 py-0.5 rounded border ${riskBg(s.risk)} ${riskColor(s.risk)}`, children: s.tag }), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] text-muted-foreground", children: s.recency })] })] })) : ((0, jsx_runtime_1.jsx)("div", { className: `w-2 h-2 rounded-full mx-auto ${riskColor(s.risk)}`, title: s.title })) }, s.id))) }))] }), expanded && ((0, jsx_runtime_1.jsx)("div", { className: "px-3 pb-3", children: (0, jsx_runtime_1.jsxs)("div", { className: "p-3 rounded-xl bg-sidebar-accent/50 border border-sidebar-border", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between mb-2", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs font-semibold text-muted-foreground", children: "Nivel de seguranca" }), (0, jsx_runtime_1.jsxs)("span", { className: `text-xs font-bold ${safetyScore >= 4 ? "text-emerald-400" : safetyScore >= 2 ? "text-amber-400" : "text-red-400"}`, children: [safetyScore, "/5"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex gap-1", children: [...Array(5)].map((_, i) => ((0, jsx_runtime_1.jsx)("div", { className: `h-1.5 flex-1 rounded-full transition-colors ${i < safetyScore ? "bg-primary" : "bg-muted"}` }, i))) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-wrap gap-1.5 mt-2", children: [settings.sandboxEnabled && (0, jsx_runtime_1.jsx)(StatusBadge, { label: "Sandbox", active: true }), settings.safeMode && (0, jsx_runtime_1.jsx)(StatusBadge, { label: "Safe", active: true }), settings.reviewGate && (0, jsx_runtime_1.jsx)(StatusBadge, { label: "Review", active: true })] })] }) })), (0, jsx_runtime_1.jsxs)("div", { className: "border-t border-sidebar-border p-3 space-y-1", children: [(0, jsx_runtime_1.jsx)(NavItem, { icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Settings, { className: "w-4 h-4" }), label: "Configuracoes", expanded: expanded, onClick: onOpenSettings }), (0, jsx_runtime_1.jsx)(NavItem, { icon: (0, jsx_runtime_1.jsx)(lucide_react_1.HelpCircle, { className: "w-4 h-4" }), label: "Ajuda & Tour", expanded: expanded, onClick: onStartTour }), (0, jsx_runtime_1.jsx)("div", { className: "pt-2 mt-2 border-t border-sidebar-border", children: (session === null || session === void 0 ? void 0 : session.user) ? ((0, jsx_runtime_1.jsxs)("button", { onClick: () => (0, react_2.signOut)(), className: `
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                hover:bg-sidebar-accent transition-colors
                ${!expanded && "justify-center px-2"}
              `, children: [session.user.image ? ((0, jsx_runtime_1.jsx)("img", { src: session.user.image || "/placeholder.svg", alt: "", className: "w-8 h-8 rounded-full shrink-0 ring-2 ring-primary/20" })) : ((0, jsx_runtime_1.jsx)("div", { className: "w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0", children: (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-semibold text-primary", children: ((_a = session.user.name) === null || _a === void 0 ? void 0 : _a.charAt(0)) || "U" }) })), expanded && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex-1 min-w-0 text-left", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-medium truncate", children: session.user.name }), (0, jsx_runtime_1.jsx)("p", { className: "text-[11px] text-muted-foreground truncate", children: session.user.email })] }), (0, jsx_runtime_1.jsx)(lucide_react_1.LogOut, { className: "w-4 h-4 text-muted-foreground" })] }))] })) : ((0, jsx_runtime_1.jsxs)("button", { onClick: () => setShowAuthModal(true), className: `
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                bg-secondary hover:bg-secondary/80 transition-colors
                ${!expanded && "justify-center px-2"}
              `, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.LogIn, { className: "w-4 h-4 shrink-0" }), expanded && (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium", children: "Entrar / Cadastrar" })] })) })] }), (0, jsx_runtime_1.jsx)(ImportRepoModal_1.default, { isOpen: showImportModal, onClose: () => setShowImportModal(false), onImportComplete: (repoInfo) => {
                    console.log("Repo imported:", repoInfo);
                    // TODO: Update app state with imported repo
                } }), (0, jsx_runtime_1.jsx)(AuthModal_1.default, { isOpen: showAuthModal, onClose: () => setShowAuthModal(false) })] }));
}
function NavItem({ icon, label, expanded, onClick, active, badge, }) {
    return ((0, jsx_runtime_1.jsxs)("button", { onClick: onClick, className: `
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        transition-all duration-200
        ${active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"}
        ${!expanded && "justify-center px-2"}
      `, children: [(0, jsx_runtime_1.jsx)("span", { className: "shrink-0", children: icon }), expanded && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm flex-1 text-left", children: label }), badge && ((0, jsx_runtime_1.jsx)("span", { className: "text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium", children: badge }))] }))] }));
}
function QuickActionButton({ icon, label, onClick }) {
    return ((0, jsx_runtime_1.jsxs)("button", { onClick: onClick, className: "flex flex-col items-center gap-1 p-2 rounded-lg\n                 bg-sidebar-accent/30 hover:bg-sidebar-accent border border-transparent hover:border-sidebar-border\n                 transition-all duration-200 group", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-muted-foreground group-hover:text-primary transition-colors", children: icon }), (0, jsx_runtime_1.jsx)("span", { className: "text-[10px] text-muted-foreground group-hover:text-foreground transition-colors", children: label })] }));
}
function StatusBadge({ label, active }) {
    return ((0, jsx_runtime_1.jsx)("span", { className: `text-[10px] px-1.5 py-0.5 rounded border ${active ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`, children: label }));
}
function Logo({ className }) {
    return ((0, jsx_runtime_1.jsxs)("svg", { className: className, viewBox: "0 0 32 32", fill: "none", children: [(0, jsx_runtime_1.jsx)("defs", { children: (0, jsx_runtime_1.jsxs)("linearGradient", { id: "logo-gradient", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [(0, jsx_runtime_1.jsx)("stop", { offset: "0%", stopColor: "oklch(0.72 0.17 165)" }), (0, jsx_runtime_1.jsx)("stop", { offset: "100%", stopColor: "oklch(0.68 0.15 200)" })] }) }), (0, jsx_runtime_1.jsx)("rect", { x: "2", y: "2", width: "28", height: "28", rx: "8", fill: "url(#logo-gradient)", fillOpacity: "0.15", stroke: "url(#logo-gradient)", strokeWidth: "1.5" }), (0, jsx_runtime_1.jsx)("path", { d: "M10 16L14 20L22 12", stroke: "url(#logo-gradient)", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("circle", { cx: "16", cy: "16", r: "10", stroke: "url(#logo-gradient)", strokeOpacity: "0.4", strokeWidth: "1", strokeDasharray: "4 4", children: (0, jsx_runtime_1.jsx)("animateTransform", { attributeName: "transform", type: "rotate", from: "0 16 16", to: "360 16 16", dur: "20s", repeatCount: "indefinite" }) })] }));
}
