"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FloatingSuggestions;
const jsx_runtime_1 = require("react/jsx-runtime");
const lucide_react_1 = require("lucide-react");
function FloatingSuggestions({ suggestions, visible, onSelect, onDismiss }) {
    if (!visible || suggestions.length === 0)
        return null;
    return ((0, jsx_runtime_1.jsx)("div", { className: "absolute bottom-full left-0 right-0 px-4 pb-3 animate-fade-in-up", children: (0, jsx_runtime_1.jsx)("div", { className: "max-w-3xl mx-auto", children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-card/90 backdrop-blur-xl border border-border rounded-xl p-3 shadow-xl", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between mb-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-3.5 h-3.5 text-primary" }), (0, jsx_runtime_1.jsx)("span", { children: "Sugestoes" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: onDismiss, className: "p-1 rounded hover:bg-secondary transition-colors", "aria-label": "Fechar sugestoes", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-3.5 h-3.5 text-muted-foreground" }) })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2", children: suggestions.map((suggestion) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => onSelect(suggestion), className: "\n                  flex items-center gap-2 px-3 py-2 rounded-lg\n                  bg-secondary/50 border border-border\n                  hover:bg-primary/10 hover:border-primary/30 hover:text-primary\n                  text-sm transition-all duration-200 group\n                ", children: [(0, jsx_runtime_1.jsx)("span", { children: suggestion }), (0, jsx_runtime_1.jsx)(lucide_react_1.ArrowRight, { className: "w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" })] }, suggestion))) })] }) }) }));
}
