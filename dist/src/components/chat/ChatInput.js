"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChatInput;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const AgentSelector_1 = require("../AgentSelector");
const roleIcons = {
    legacyAssist: (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-4 h-4" }),
    chat: (0, jsx_runtime_1.jsx)(lucide_react_1.MessageSquare, { className: "w-4 h-4" }),
    orchestrate: (0, jsx_runtime_1.jsx)(lucide_react_1.Zap, { className: "w-4 h-4" }),
    advisor: (0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "w-4 h-4" }),
    operator: (0, jsx_runtime_1.jsx)(lucide_react_1.Wrench, { className: "w-4 h-4" }),
    reviewer: (0, jsx_runtime_1.jsx)(lucide_react_1.Eye, { className: "w-4 h-4" }),
    executor: (0, jsx_runtime_1.jsx)(lucide_react_1.FileCheck, { className: "w-4 h-4" }),
};
function ChatInput({ input, onInputChange, onSubmit, isLoading, uploadedFiles, onFileUpload, onRemoveFile, agentRole, onAgentRoleChange, deepSearch, onDeepSearchChange, compact, }) {
    const [showAgentMenu, setShowAgentMenu] = (0, react_1.useState)(false);
    const fileInputRef = (0, react_1.useRef)(null);
    const textareaRef = (0, react_1.useRef)(null);
    const selectedRole = AgentSelector_1.AGENT_ROLES.find((r) => r.key === agentRole);
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
        }
    };
    const handleTextareaInput = (e) => {
        const target = e.target;
        target.style.height = "auto";
        target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [uploadedFiles.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2 animate-fade-in", children: uploadedFiles.map((file, i) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-3 py-1.5 rounded-lg\n                       bg-secondary border border-border text-sm group", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Paperclip, { className: "w-3.5 h-3.5 text-muted-foreground" }), (0, jsx_runtime_1.jsx)("span", { className: "truncate max-w-36", children: file.name }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => onRemoveFile(i), className: "text-muted-foreground hover:text-destructive transition-colors", "aria-label": "Remover arquivo", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-3.5 h-3.5" }) })] }, i))) })), (0, jsx_runtime_1.jsx)("form", { onSubmit: onSubmit, className: "relative", children: (0, jsx_runtime_1.jsxs)("div", { className: "glass rounded-2xl overflow-hidden shadow-lg", children: [!compact && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 px-4 py-2.5 border-b border-border/50", children: [(0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setShowAgentMenu(!showAgentMenu), className: "flex items-center gap-2 px-3 py-1.5 rounded-lg\n                           bg-secondary/50 hover:bg-secondary\n                           text-sm transition-colors", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-primary", children: roleIcons[agentRole] }), (0, jsx_runtime_1.jsx)("span", { className: "font-medium", children: selectedRole === null || selectedRole === void 0 ? void 0 : selectedRole.label.split(" — ")[0] }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: `w-3.5 h-3.5 text-muted-foreground transition-transform ${showAgentMenu ? "rotate-180" : ""}` })] }), showAgentMenu && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 z-40", onClick: () => setShowAgentMenu(false) }), (0, jsx_runtime_1.jsx)("div", { className: "absolute top-full left-0 mt-2 w-80 p-2\n                                bg-popover border border-border rounded-xl shadow-2xl z-50\n                                animate-scale-in origin-top-left", children: AgentSelector_1.AGENT_ROLES.map((role) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                                            onAgentRoleChange(role.key);
                                                            setShowAgentMenu(false);
                                                        }, className: `w-full text-left px-3 py-3 rounded-lg
                                            transition-colors ${agentRole === role.key
                                                            ? "bg-primary/10 border border-primary/30"
                                                            : "hover:bg-secondary border border-transparent"}`, children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("span", { className: agentRole === role.key ? "text-primary" : "text-muted-foreground", children: roleIcons[role.key] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 min-w-0", children: [(0, jsx_runtime_1.jsx)("p", { className: "font-medium text-sm", children: role.label.split(" — ")[0] }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-muted-foreground mt-0.5 line-clamp-1", children: role.description })] })] }) }, role.key))) })] }))] }), agentRole === "chat" && ((0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => onDeepSearchChange(!deepSearch), className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-sm transition-all duration-200 ${deepSearch
                                        ? "bg-primary/20 text-primary border border-primary/30"
                                        : "bg-secondary/50 hover:bg-secondary text-muted-foreground"}`, children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "w-3.5 h-3.5" }), (0, jsx_runtime_1.jsx)("span", { children: "Deep Search" })] }))] })), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-end gap-3 p-4", children: [(0, jsx_runtime_1.jsx)("input", { type: "file", ref: fileInputRef, multiple: true, className: "hidden", "aria-label": "Selecionar arquivos para upload", onChange: (e) => onFileUpload(e.target.files) }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => { var _a; return (_a = fileInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); }, className: "p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary\n                       text-muted-foreground hover:text-foreground\n                       transition-colors shrink-0", title: "Anexar arquivo", "aria-label": "Anexar arquivo", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Paperclip, { className: "w-5 h-5" }) }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1", children: (0, jsx_runtime_1.jsx)("textarea", { ref: textareaRef, value: input, onChange: (e) => onInputChange(e.target.value), onKeyDown: handleKeyDown, onInput: handleTextareaInput, placeholder: agentRole === "legacyAssist"
                                            ? "Descreva o que voce precisa, eu guio voce..."
                                            : agentRole === "chat"
                                                ? "Pergunte, pesquise, faca brainstorm..."
                                                : "Descreva sua tarefa de seguranca...", rows: 1, className: "w-full resize-none rounded-lg bg-card text-sm text-card-foreground placeholder:text-muted-foreground/70 border border-border/60 p-3 shadow-inner shadow-black/30 focus:ring-2 focus:ring-primary/40 focus:outline-none min-h-7 max-h-50", disabled: isLoading }) }), (0, jsx_runtime_1.jsx)("button", { type: "submit", disabled: isLoading || (!input.trim() && uploadedFiles.length === 0), className: "p-2.5 rounded-xl btn-primary disabled:opacity-50\n                       disabled:cursor-not-allowed disabled:shadow-none shrink-0", children: isLoading ? (0, jsx_runtime_1.jsx)(lucide_react_1.Loader2, { className: "w-5 h-5 animate-spin" }) : (0, jsx_runtime_1.jsx)(lucide_react_1.Send, { className: "w-5 h-5" }) })] })] }) }), compact && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-center gap-3 text-xs text-muted-foreground", children: [(0, jsx_runtime_1.jsx)("span", { children: "Modo:" }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setShowAgentMenu(true), className: "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg\n                     bg-secondary/50 hover:bg-secondary transition-colors", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-primary", children: roleIcons[agentRole] }), (0, jsx_runtime_1.jsx)("span", { className: "font-medium", children: selectedRole === null || selectedRole === void 0 ? void 0 : selectedRole.label.split(" — ")[0] }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "w-3 h-3" })] }), showAgentMenu && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 z-40", onClick: () => setShowAgentMenu(false) }), (0, jsx_runtime_1.jsx)("div", { className: "fixed bottom-24 left-1/2 -translate-x-1/2 w-80 p-2\n                          bg-popover border border-border rounded-xl shadow-2xl z-50\n                          animate-scale-in", children: AgentSelector_1.AGENT_ROLES.map((role) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                        onAgentRoleChange(role.key);
                                        setShowAgentMenu(false);
                                    }, className: `w-full text-left px-3 py-2.5 rounded-lg text-sm
                              transition-colors ${agentRole === role.key ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`, children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("span", { className: agentRole === role.key ? "text-primary" : "text-muted-foreground", children: roleIcons[role.key] }), (0, jsx_runtime_1.jsx)("span", { className: "font-medium", children: role.label.split(" — ")[0] })] }) }, role.key))) })] }))] }))] }));
}
