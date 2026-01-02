"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LegacyAssistOverlay;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const ASSIST_STEPS = {
    welcome: {
        title: "Bem-vindo ao LegacyAssist",
        description: "Eu vou guiar voce passo a passo. Primeiro, me conte o que voce precisa fazer.",
        actions: [
            {
                id: "rag",
                label: "Buscar Contexto",
                icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "w-4 h-4" }),
                description: "Pesquisar no indice RAG",
            },
            { id: "web", label: "Pesquisa Web", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Globe, { className: "w-4 h-4" }), description: "Buscar na internet" },
            {
                id: "brainstorm",
                label: "Brainstorm",
                icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Lightbulb, { className: "w-4 h-4" }),
                description: "Explorar ideias",
            },
        ],
    },
    research: {
        title: "Fase de Pesquisa",
        description: "Vamos coletar informacoes antes de tomar qualquer acao.",
        actions: [
            {
                id: "rag",
                label: "Contexto RAG",
                icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Search, { className: "w-4 h-4" }),
                description: "Codigo e docs indexados",
            },
            { id: "web", label: "Web Search", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Globe, { className: "w-4 h-4" }), description: "Fontes externas" },
        ],
    },
    validate: {
        title: "Validacao",
        description: "Antes de executar, vamos validar em ambiente seguro.",
        actions: [
            { id: "twin", label: "Twin Builder", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Box, { className: "w-4 h-4" }), description: "Reproduzir cenario" },
            { id: "sandbox", label: "Sandbox", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Play, { className: "w-4 h-4" }), description: "Testar isoladamente" },
        ],
    },
    execute: {
        title: "Pronto para Executar",
        description: "Validacao completa. Deseja prosseguir com a orquestracao?",
        actions: [
            {
                id: "orchestrate",
                label: "Orquestrar",
                icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-4 h-4" }),
                description: "Executar plano completo",
            },
        ],
    },
};
function LegacyAssistOverlay({ step, onClose, onAction }) {
    const [currentStep, setCurrentStep] = (0, react_1.useState)(step);
    const [isVisible, setIsVisible] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setIsVisible(true);
    }, []);
    const stepData = ASSIST_STEPS[currentStep] || ASSIST_STEPS.welcome;
    const handleAction = (actionId) => {
        onAction(actionId);
        // Auto-advance to next step based on action
        if (actionId === "rag" || actionId === "web" || actionId === "brainstorm") {
            setCurrentStep("validate");
        }
        else if (actionId === "twin" || actionId === "sandbox") {
            setCurrentStep("execute");
        }
        else if (actionId === "orchestrate") {
            onClose();
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: `fixed inset-0 z-100 pointer-events-none ${isVisible ? "opacity-100" : "opacity-0"} transition-opacity duration-300`, children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute bottom-32 left-1/2 -translate-x-1/2 w-150 h-24\n                   rounded-2xl border-2 border-primary/50 pointer-events-none lg-spotlight" }), (0, jsx_runtime_1.jsx)("div", { className: "absolute bottom-60 left-1/2 -translate-x-1/2 w-full max-w-md\n                   pointer-events-auto animate-fade-in-up", children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-card/90 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-primary/30 relative", children: [(0, jsx_runtime_1.jsx)("button", { onClick: onClose, className: "absolute top-4 right-4 p-1.5 rounded-lg hover:bg-secondary transition-colors", "aria-label": "Fechar guia do LegacyAssist", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-4 h-4 text-muted-foreground" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3 mb-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "p-2.5 rounded-xl bg-primary/20 text-primary", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-5 h-5" }) }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { className: "font-bold text-lg", children: stepData.title }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: stepData.description })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "space-y-2", children: stepData.actions.map((action) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => handleAction(action.id), className: "w-full flex items-center gap-4 p-4 rounded-xl\n                         bg-secondary/50 border border-border\n                         hover:bg-primary/10 hover:border-primary/30\n                         transition-all duration-200 group text-left", children: [(0, jsx_runtime_1.jsx)("div", { className: "p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors", children: action.icon }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1", children: [(0, jsx_runtime_1.jsx)("p", { className: "font-medium group-hover:text-primary transition-colors", children: action.label }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: action.description })] }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronRight, { className: "w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" })] }, action.id))) }), (0, jsx_runtime_1.jsx)("div", { className: "flex items-center justify-center gap-2 mt-6", children: Object.keys(ASSIST_STEPS).map((s, i) => ((0, jsx_runtime_1.jsx)("div", { className: `w-2 h-2 rounded-full transition-colors ${s === currentStep
                                    ? "bg-primary w-4"
                                    : Object.keys(ASSIST_STEPS).indexOf(currentStep) > i
                                        ? "bg-primary/50"
                                        : "bg-muted"}` }, s))) }), (0, jsx_runtime_1.jsx)("button", { onClick: onClose, className: "w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors", children: "Fechar guia e continuar sozinho" }), (0, jsx_runtime_1.jsx)("div", { className: "absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6\n                       bg-card border-b border-r border-primary/30 rotate-45" })] }) })] }));
}
