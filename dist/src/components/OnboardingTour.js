"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = OnboardingTour;
exports.useOnboarding = useOnboarding;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const ONBOARDING_STEPS = [
    {
        id: "context",
        title: "Contexto & Histórico",
        description: "Comece definindo o escopo da tarefa. Selecione uma sessão anterior, importe um repositório ou configure um merge.",
        column: 1,
        icon: "📂",
    },
    {
        id: "chat",
        title: "Chat & Orquestração",
        description: "Esta é a área principal de interação. Converse com os agentes, acompanhe a orquestração e veja os resultados.",
        column: 2,
        icon: "💬",
    },
    {
        id: "governance",
        title: "Governança & Controles",
        description: "Configure guardrails de segurança, sandbox, limites de custo e monitore o status da infraestrutura.",
        column: 3,
        icon: "⚙️",
    },
    {
        id: "agents",
        title: "Modos de Execução",
        description: "Escolha entre LegacyAssist (guiado), Chat Livre, Orquestrador ou agentes específicos conforme sua necessidade.",
        column: 2,
        icon: "🤖",
    },
    {
        id: "safety",
        title: "Segurança Primeiro",
        description: "Ative sandbox, safe mode e reviewer obrigatório para garantir que nenhuma ação destrutiva seja executada sem validação.",
        column: 3,
        icon: "🛡️",
    },
];
function OnboardingTour({ isOpen, onClose, onComplete }) {
    // Reset to step 0 when opening via key
    const [currentStep, setCurrentStep] = (0, react_1.useState)(0);
    const [isAnimating, setIsAnimating] = (0, react_1.useState)(false);
    const [prevIsOpen, setPrevIsOpen] = (0, react_1.useState)(isOpen);
    // Reset step when modal opens (using derived state pattern)
    if (isOpen && !prevIsOpen) {
        setCurrentStep(0);
    }
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
    }
    if (!isOpen)
        return null;
    const step = ONBOARDING_STEPS[currentStep];
    const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
    const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;
    const handleNext = () => {
        if (isLastStep) {
            onComplete();
            return;
        }
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentStep((prev) => prev + 1);
            setIsAnimating(false);
        }, 200);
    };
    const handlePrev = () => {
        if (currentStep === 0)
            return;
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentStep((prev) => prev - 1);
            setIsAnimating(false);
        }, 200);
    };
    const handleSkip = () => {
        onClose();
    };
    const getColumnHighlight = (column) => {
        switch (column) {
            case 1:
                return "border-indigo-400/50 bg-indigo-500/10";
            case 2:
                return "border-emerald-400/50 bg-emerald-500/10";
            case 3:
                return "border-amber-400/50 bg-amber-500/10";
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute inset-0 bg-black/80 backdrop-blur-sm", onClick: handleSkip }), (0, jsx_runtime_1.jsxs)("div", { className: "relative w-full max-w-2xl bg-slate-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden", children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute top-0 left-0 right-0 h-1 bg-white/10", children: (0, jsx_runtime_1.jsx)("progress", { className: "lg-progress lg-progress-emerald", max: 100, value: progress, "aria-label": "Progresso do tour" }) }), (0, jsx_runtime_1.jsx)("div", { className: "p-6 border-b border-white/10", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("div", { className: `h-12 w-12 rounded-xl flex items-center justify-center text-2xl ${getColumnHighlight(step.column)}`, children: step.icon }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("p", { className: "text-xs text-slate-400 uppercase tracking-wide", children: ["Passo ", currentStep + 1, " de ", ONBOARDING_STEPS.length, " \u2022 Coluna ", step.column] }), (0, jsx_runtime_1.jsx)("h2", { className: "text-xl font-bold text-white", children: step.title })] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: handleSkip, className: "text-2xl text-slate-400 hover:text-white transition-colors", "aria-label": "Pular tour", children: "\u00D7" })] }) }), (0, jsx_runtime_1.jsxs)("div", { className: `p-6 transition-opacity duration-200 ${isAnimating ? "opacity-0" : "opacity-100"}`, children: [(0, jsx_runtime_1.jsx)("p", { className: "text-slate-200 text-base leading-relaxed mb-6", children: step.description }), (0, jsx_runtime_1.jsx)("div", { className: "grid grid-cols-3 gap-3 mb-6", children: [1, 2, 3].map((col) => ((0, jsx_runtime_1.jsxs)("div", { className: `rounded-xl p-4 border-2 transition-all duration-300 ${col === step.column
                                        ? getColumnHighlight(col)
                                        : "border-white/5 bg-white/5 opacity-40"}`, children: [(0, jsx_runtime_1.jsxs)("p", { className: "text-xs font-semibold text-center mb-1", children: [col === 1 && "📂 Contexto", col === 2 && "💬 Chat", col === 3 && "⚙️ Governança"] }), (0, jsx_runtime_1.jsxs)("p", { className: "text-[10px] text-slate-400 text-center", children: [col === 1 && "Escopo & histórico", col === 2 && "Ação & interação", col === 3 && "Controles & segurança"] })] }, col))) }), (0, jsx_runtime_1.jsxs)("div", { className: "rounded-xl bg-white/5 border border-white/10 p-4", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-semibold text-emerald-200 mb-2", children: "\uD83D\uDCA1 Dica" }), step.id === "context" && ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "Retome sess\u00F5es anteriores para manter o contexto do RAG. O sistema reindexar\u00E1 automaticamente." })), step.id === "chat" && ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "Use LegacyAssist para um fluxo guiado sem execu\u00E7\u00E3o autom\u00E1tica, ideal para iniciantes." })), step.id === "governance" && ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "Monitore os indicadores de status (verde/vermelho) para saber se Worker e Sandbox est\u00E3o ativos." })), step.id === "agents" && ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "O Orquestrador quebra tarefas complexas em subtarefas e coordena m\u00FAltiplos agentes automaticamente." })), step.id === "safety" && ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "Com Safe Mode ativo, a\u00E7\u00F5es destrutivas como merge s\u00E3o bloqueadas at\u00E9 voc\u00EA desativar manualmente." }))] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-6 border-t border-white/10 flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex items-center gap-2", children: ONBOARDING_STEPS.map((_, idx) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => setCurrentStep(idx), className: `w-2 h-2 rounded-full transition-all ${idx === currentStep
                                        ? "bg-emerald-500 w-4"
                                        : idx < currentStep
                                            ? "bg-emerald-500/50"
                                            : "bg-white/20"}`, "aria-label": `Ir para passo ${idx + 1}` }, idx))) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [currentStep > 0 && ((0, jsx_runtime_1.jsx)("button", { onClick: handlePrev, className: "px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10 transition-colors", children: "Anterior" })), (0, jsx_runtime_1.jsx)("button", { onClick: handleNext, className: "px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm shadow-lg shadow-emerald-500/30 transition-colors", children: isLastStep ? "Começar!" : "Próximo" })] })] })] })] }));
}
// Hook for managing onboarding state
function useOnboarding(storageKey) {
    // Start with SSR-safe defaults, then hydrate on client
    const [hasSeenTour, setHasSeenTour] = (0, react_1.useState)(true); // SSR default
    const [showTour, setShowTour] = (0, react_1.useState)(false);
    const [isHydrated, setIsHydrated] = (0, react_1.useState)(false);
    // Hydrate from localStorage after mount (client-side only)
    if (typeof window !== 'undefined' && !isHydrated) {
        const seen = localStorage.getItem(`${storageKey}:tourComplete`);
        if (seen !== null) {
            // Only update if different from SSR default
            const seenValue = seen === "true";
            if (seenValue !== hasSeenTour) {
                setHasSeenTour(seenValue);
            }
        }
        else {
            // First time user - hasn't seen tour
            setHasSeenTour(false);
        }
        setIsHydrated(true);
    }
    const completeTour = () => {
        localStorage.setItem(`${storageKey}:tourComplete`, "true");
        setHasSeenTour(true);
        setShowTour(false);
    };
    const startTour = () => {
        setShowTour(true);
    };
    const closeTour = () => {
        setShowTour(false);
    };
    const resetTour = () => {
        localStorage.removeItem(`${storageKey}:tourComplete`);
        setHasSeenTour(false);
        setShowTour(true);
    };
    return {
        hasSeenTour,
        showTour,
        startTour,
        closeTour,
        completeTour,
        resetTour,
    };
}
