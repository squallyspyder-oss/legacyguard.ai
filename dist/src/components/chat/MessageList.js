"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MessageList;
const jsx_runtime_1 = require("react/jsx-runtime");
const lucide_react_1 = require("lucide-react");
const react_1 = require("react");
function MessageList({ messages, isLoading, onSwitchAgent }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [messages.map((msg, i) => ((0, jsx_runtime_1.jsx)(MessageBubble, { message: msg, index: i, onSwitchAgent: onSwitchAgent }, msg.id))), isLoading && ((0, jsx_runtime_1.jsxs)("div", { className: "flex gap-4 animate-fade-in-up", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Bot, { className: "w-5 h-5 text-primary" }) }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 pt-2", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 rounded-full bg-primary typing-dot" }), (0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 rounded-full bg-primary typing-dot" }), (0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 rounded-full bg-primary typing-dot" })] }) })] }))] }));
}
function MessageBubble({ message, index, onSwitchAgent }) {
    const isUser = message.role === "user";
    const [copied, setCopied] = (0, react_1.useState)(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    // Handler para links especiais de troca de agente
    const handleLinkClick = (href) => {
        if (href === '#switch-orchestrate') {
            onSwitchAgent === null || onSwitchAgent === void 0 ? void 0 : onSwitchAgent('orchestrate', message.suggestOrchestrateText);
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex gap-4 animate-fade-in-up group", children: [(0, jsx_runtime_1.jsx)("div", { className: `w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isUser ? "bg-secondary" : "bg-primary/15"}`, children: isUser ? (0, jsx_runtime_1.jsx)(lucide_react_1.User, { className: "w-5 h-5" }) : (0, jsx_runtime_1.jsx)(lucide_react_1.Bot, { className: "w-5 h-5 text-primary" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 min-w-0 space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm font-semibold", children: isUser ? "Voce" : "LegacyGuard" }), message.agentRole && message.agentRole !== "chat" && !isUser && ((0, jsx_runtime_1.jsxs)("span", { className: "badge badge-primary text-[10px]", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-3 h-3 mr-1" }), message.agentRole] })), (0, jsx_runtime_1.jsx)("span", { className: "text-[11px] text-muted-foreground", children: message.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) })] }), (0, jsx_runtime_1.jsx)("div", { className: `rounded-2xl px-4 py-3 ${isUser ? "message-user" : "message-assistant"}`, children: (0, jsx_runtime_1.jsx)("div", { className: "prose prose-sm prose-invert max-w-none prose-dark", children: (0, jsx_runtime_1.jsx)(FormattedContent, { content: message.content, onLinkClick: handleLinkClick }) }) }), !isUser && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity", children: [(0, jsx_runtime_1.jsx)("button", { onClick: handleCopy, className: "p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground", title: "Copiar", children: copied ? (0, jsx_runtime_1.jsx)(lucide_react_1.Check, { className: "w-4 h-4 text-primary" }) : (0, jsx_runtime_1.jsx)(lucide_react_1.Copy, { className: "w-4 h-4" }) }), (0, jsx_runtime_1.jsx)("button", { className: "p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground", title: "Util", children: (0, jsx_runtime_1.jsx)(lucide_react_1.ThumbsUp, { className: "w-4 h-4" }) }), (0, jsx_runtime_1.jsx)("button", { className: "p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground", title: "Nao util", children: (0, jsx_runtime_1.jsx)(lucide_react_1.ThumbsDown, { className: "w-4 h-4" }) })] })), message.patches && message.patches.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-2 mt-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-sm font-medium text-primary", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.FileCode, { className: "w-4 h-4" }), (0, jsx_runtime_1.jsxs)("span", { children: ["Patches disponiveis (", message.patches.length, ")"] })] }), message.patches.map((patch, idx) => ((0, jsx_runtime_1.jsx)("div", { className: "p-3 rounded-xl bg-card border border-border card-interactive", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm font-mono text-primary", children: patch.file }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsx)("button", { className: "text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors font-medium", children: "Ver diff" }), (0, jsx_runtime_1.jsx)("button", { className: "text-xs px-3 py-1.5 rounded-lg btn-primary font-medium", children: "Aplicar" })] })] }) }, idx)))] })), message.tests && message.tests.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-2 mt-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-sm font-medium text-emerald-400", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.TestTube, { className: "w-4 h-4" }), (0, jsx_runtime_1.jsxs)("span", { children: ["Testes gerados (", message.tests.length, ")"] })] }), message.tests.map((test, idx) => ((0, jsx_runtime_1.jsx)("div", { className: "p-3 rounded-xl bg-card border border-border card-interactive", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm font-mono", children: test.file }), (0, jsx_runtime_1.jsx)("button", { className: "text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-medium", children: "Download" })] }) }, idx)))] })), message.twinOffer && ((0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 mt-4", children: [(0, jsx_runtime_1.jsx)("button", { className: "text-sm px-4 py-2.5 rounded-xl btn-primary font-medium", children: "Acionar Twin Builder" }), (0, jsx_runtime_1.jsx)("button", { className: "text-sm px-4 py-2.5 rounded-xl btn-secondary font-medium", children: "Agora nao" })] })), message.approvalRequired && ((0, jsx_runtime_1.jsxs)("div", { className: "mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-amber-400 mb-3", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.AlertTriangle, { className: "w-5 h-5" }), (0, jsx_runtime_1.jsx)("span", { className: "font-semibold", children: "Aprovacao necessaria" })] }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground mb-3", children: "Esta acao requer sua aprovacao antes de prosseguir." }), (0, jsx_runtime_1.jsx)("button", { className: "text-sm px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors font-medium", children: "Aprovar e continuar" })] }))] })] }));
}
function FormattedContent({ content, onLinkClick }) {
    const lines = content.split("\n");
    return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: lines.map((line, i) => {
            // Headers
            if (line.startsWith("## ")) {
                return ((0, jsx_runtime_1.jsx)("h2", { className: "text-lg font-bold text-foreground mt-4 mb-2", children: line.slice(3) }, i));
            }
            if (line.startsWith("**") && line.endsWith("**")) {
                return ((0, jsx_runtime_1.jsx)("p", { className: "font-semibold text-foreground my-2", children: line.slice(2, -2) }, i));
            }
            // List items
            if (line.startsWith("- ") || line.startsWith("• ")) {
                return ((0, jsx_runtime_1.jsx)("li", { className: "ml-4 my-1", children: formatInlineText(line.slice(2), onLinkClick) }, i));
            }
            // Numbered list
            if (/^\d+\.\s/.test(line)) {
                return ((0, jsx_runtime_1.jsx)("li", { className: "ml-4 my-1 list-decimal", children: formatInlineText(line.replace(/^\d+\.\s/, ""), onLinkClick) }, i));
            }
            // Empty line
            if (!line.trim()) {
                return (0, jsx_runtime_1.jsx)("br", {}, i);
            }
            return (0, jsx_runtime_1.jsx)("p", { children: formatInlineText(line, onLinkClick) }, i);
        }) }));
}
function formatInlineText(text, onLinkClick) {
    // Links markdown [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const boldRegex = /\*\*(.*?)\*\*/g;
    // Primeiro, processa links
    if (linkRegex.test(text)) {
        const parts = [];
        let lastIndex = 0;
        let match;
        linkRegex.lastIndex = 0;
        while ((match = linkRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push((0, jsx_runtime_1.jsx)("span", { children: formatBoldText(text.slice(lastIndex, match.index)) }, `t-${lastIndex}`));
            }
            const linkText = match[1];
            const href = match[2];
            if (href.startsWith('#switch-')) {
                parts.push((0, jsx_runtime_1.jsx)("button", { onClick: () => onLinkClick === null || onLinkClick === void 0 ? void 0 : onLinkClick(href), className: "text-primary hover:underline font-medium cursor-pointer", children: linkText }, `l-${match.index}`));
            }
            else {
                parts.push((0, jsx_runtime_1.jsx)("a", { href: href, target: "_blank", rel: "noopener noreferrer", className: "text-primary hover:underline", children: linkText }, `l-${match.index}`));
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            parts.push((0, jsx_runtime_1.jsx)("span", { children: formatBoldText(text.slice(lastIndex)) }, `t-${lastIndex}`));
        }
        return (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: parts });
    }
    return formatBoldText(text);
}
function formatBoldText(text) {
    // Bold text
    if (text.includes("**")) {
        const parts = text.split(/\*\*(.*?)\*\*/g);
        return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: parts.map((part, j) => j % 2 === 1 ? ((0, jsx_runtime_1.jsx)("strong", { className: "font-semibold text-foreground", children: part }, j)) : ((0, jsx_runtime_1.jsx)("span", { children: part }, j))) }));
    }
    return text;
}
