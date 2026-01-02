"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = WelcomeScreen;
const jsx_runtime_1 = require("react/jsx-runtime");
const ChatInput_1 = __importDefault(require("./ChatInput"));
const FloatingSuggestions_1 = __importDefault(require("./FloatingSuggestions"));
const lucide_react_1 = require("lucide-react");
const quickActions = [
    {
        icon: (0, jsx_runtime_1.jsx)(lucide_react_1.FileCode, { className: "w-5 h-5" }),
        label: "Analisar repositorio",
        description: "Scan de vulnerabilidades e problemas",
        prompt: "Analise o repositorio em busca de vulnerabilidades e problemas de seguranca",
        color: "text-blue-400",
        bg: "bg-blue-500/10 border-blue-500/30",
    },
    {
        icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-5 h-5" }),
        label: "Revisar compliance",
        description: "GDPR, SOC2, seguranca",
        prompt: "Revise o codigo para compliance GDPR e SOC2",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10 border-emerald-500/30",
    },
    {
        icon: (0, jsx_runtime_1.jsx)(lucide_react_1.AlertTriangle, { className: "w-5 h-5" }),
        label: "Investigar incidente",
        description: "Analise de causa raiz",
        prompt: "Ajude-me a investigar um incidente de seguranca",
        color: "text-amber-400",
        bg: "bg-amber-500/10 border-amber-500/30",
    },
    {
        icon: (0, jsx_runtime_1.jsx)(lucide_react_1.GitBranch, { className: "w-5 h-5" }),
        label: "Refatorar legacy",
        description: "Modernizacao de codigo",
        prompt: "Sugira refatoracoes para modernizar codigo legado",
        color: "text-purple-400",
        bg: "bg-purple-500/10 border-purple-500/30",
    },
];
function WelcomeScreen({ session, input, onInputChange, onSubmit, isLoading, uploadedFiles, onFileUpload, onRemoveFile, agentRole, onAgentRoleChange, deepSearch, onDeepSearchChange, onQuickAction, suggestions, showSuggestions, onSuggestionClick, onDismissSuggestions, }) {
    var _a;
    return ((0, jsx_runtime_1.jsx)("div", { className: "flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto", children: (0, jsx_runtime_1.jsxs)("div", { className: "w-full max-w-2xl space-y-8", children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-center space-y-6 animate-fade-in-up", children: [(0, jsx_runtime_1.jsx)("div", { className: "inline-flex items-center justify-center", children: (0, jsx_runtime_1.jsx)(InteractiveLogo, {}) }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [(0, jsx_runtime_1.jsx)("h1", { className: "text-3xl md:text-4xl font-bold tracking-tight", children: ((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.name) ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Ola, ", (0, jsx_runtime_1.jsx)("span", { className: "gradient-text", children: session.user.name.split(" ")[0] })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Bem-vindo ao ", (0, jsx_runtime_1.jsx)("span", { className: "gradient-text", children: "LegacyGuard" })] })) }), (0, jsx_runtime_1.jsx)("p", { className: "text-muted-foreground text-lg max-w-md mx-auto", children: "Plataforma de seguranca com IA para sistemas legados. Como posso ajudar?" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "relative animate-fade-in-up", children: [(0, jsx_runtime_1.jsx)(FloatingSuggestions_1.default, { suggestions: suggestions, visible: showSuggestions, onSelect: onSuggestionClick, onDismiss: onDismissSuggestions }), (0, jsx_runtime_1.jsx)(ChatInput_1.default, { input: input, onInputChange: onInputChange, onSubmit: onSubmit, isLoading: isLoading, uploadedFiles: uploadedFiles, onFileUpload: onFileUpload, onRemoveFile: onRemoveFile, agentRole: agentRole, onAgentRoleChange: onAgentRoleChange, deepSearch: deepSearch, onDeepSearchChange: onDeepSearchChange })] }), (0, jsx_runtime_1.jsxs)("div", { className: "animate-fade-in-up", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-xs text-muted-foreground text-center mb-4 uppercase tracking-wider font-medium", children: "Acoes rapidas" }), (0, jsx_runtime_1.jsx)("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: quickActions.map((action, idx) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => onQuickAction(action.prompt), className: `
                  flex items-start gap-4 p-4 rounded-xl
                  bg-card border border-border
                  hover:border-primary/30 hover:shadow-lg
                  transition-all duration-200 text-left group
                  card-interactive
                `, children: [(0, jsx_runtime_1.jsx)("div", { className: `p-2.5 rounded-xl ${action.bg} ${action.color} transition-colors`, children: action.icon }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 min-w-0", children: [(0, jsx_runtime_1.jsx)("p", { className: "font-semibold text-sm group-hover:text-primary transition-colors", children: action.label }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-muted-foreground mt-0.5", children: action.description })] })] }, idx))) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-center gap-6 text-xs text-muted-foreground animate-fade-in-up", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-3.5 h-3.5 text-primary" }), (0, jsx_runtime_1.jsx)("span", { children: "Sandbox isolado" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Zap, { className: "w-3.5 h-3.5 text-primary" }), (0, jsx_runtime_1.jsx)("span", { children: "Multi-agente" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "w-3.5 h-3.5 text-primary" }), (0, jsx_runtime_1.jsx)("span", { children: "RAG contextual" })] })] })] }) }));
}
function InteractiveLogo() {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "relative group", children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute inset-0 blur-3xl opacity-40 bg-primary rounded-full scale-150 animate-pulse-ring" }), (0, jsx_runtime_1.jsxs)("svg", { viewBox: "0 0 120 120", className: "w-28 h-28 md:w-32 md:h-32 animate-logo-float relative z-10", children: [(0, jsx_runtime_1.jsx)("circle", { cx: "60", cy: "60", r: "56", fill: "none", className: "stroke-primary/15", strokeWidth: "0.5", strokeDasharray: "8 6", children: (0, jsx_runtime_1.jsx)("animateTransform", { attributeName: "transform", type: "rotate", from: "0 60 60", to: "360 60 60", dur: "40s", repeatCount: "indefinite" }) }), (0, jsx_runtime_1.jsx)("circle", { cx: "60", cy: "60", r: "48", fill: "none", className: "stroke-primary/25", strokeWidth: "1" }), (0, jsx_runtime_1.jsx)("circle", { cx: "60", cy: "60", r: "40", fill: "none", className: "stroke-primary/20", strokeWidth: "0.5", strokeDasharray: "4 4", children: (0, jsx_runtime_1.jsx)("animateTransform", { attributeName: "transform", type: "rotate", from: "360 60 60", to: "0 60 60", dur: "25s", repeatCount: "indefinite" }) }), (0, jsx_runtime_1.jsx)("rect", { x: "30", y: "30", width: "60", height: "60", rx: "16", className: "fill-card" }), (0, jsx_runtime_1.jsx)("rect", { x: "30", y: "30", width: "60", height: "60", rx: "16", fill: "none", className: "stroke-primary", strokeWidth: "2" }), (0, jsx_runtime_1.jsx)("defs", { children: (0, jsx_runtime_1.jsxs)("linearGradient", { id: "check-gradient", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [(0, jsx_runtime_1.jsx)("stop", { offset: "0%", stopColor: "oklch(0.72 0.17 165)" }), (0, jsx_runtime_1.jsx)("stop", { offset: "100%", stopColor: "oklch(0.68 0.15 200)" })] }) }), (0, jsx_runtime_1.jsx)("path", { d: "M42 60L52 70L78 44", fill: "none", stroke: "url(#check-gradient)", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("circle", { cx: "60", cy: "60", r: "18", className: "fill-primary/10" }), (0, jsx_runtime_1.jsxs)("circle", { cx: "60", cy: "60", r: "30", fill: "none", className: "stroke-primary/30", strokeWidth: "0.5", children: [(0, jsx_runtime_1.jsx)("animate", { attributeName: "r", values: "30;52;30", dur: "3s", repeatCount: "indefinite" }), (0, jsx_runtime_1.jsx)("animate", { attributeName: "opacity", values: "0.3;0;0.3", dur: "3s", repeatCount: "indefinite" })] })] }), (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "absolute -top-2 -right-2 w-5 h-5 text-primary/60 animate-pulse" }), (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "absolute -bottom-1 -left-1 w-4 h-4 text-primary/40 animate-pulse animate-delay-500" })] }));
}
