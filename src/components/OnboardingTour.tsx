"use client";

import { useState } from "react";

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  column: 1 | 2 | 3;
  icon: string;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
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

type OnboardingTourProps = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
};

export default function OnboardingTour({ isOpen, onClose, onComplete }: OnboardingTourProps) {
  // Reset to step 0 when opening via key
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Reset step when modal opens (using derived state pattern)
  if (isOpen && !prevIsOpen) {
    setCurrentStep(0);
  }
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
  }

  if (!isOpen) return null;

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
    if (currentStep === 0) return;
    
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep((prev) => prev - 1);
      setIsAnimating(false);
    }, 200);
  };

  const handleSkip = () => {
    onClose();
  };

  const getColumnHighlight = (column: 1 | 2 | 3) => {
    switch (column) {
      case 1:
        return "border-indigo-400/50 bg-indigo-500/10";
      case 2:
        return "border-emerald-400/50 bg-emerald-500/10";
      case 3:
        return "border-amber-400/50 bg-amber-500/10";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleSkip}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
          <progress
            className="lg-progress lg-progress-emerald"
            max={100}
            value={progress}
            aria-label="Progresso do tour"
          />
        </div>

        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-2xl ${getColumnHighlight(step.column)}`}>
                {step.icon}
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">
                  Passo {currentStep + 1} de {ONBOARDING_STEPS.length} • Coluna {step.column}
                </p>
                <h2 className="text-xl font-bold text-white">{step.title}</h2>
              </div>
            </div>
            <button 
              onClick={handleSkip}
              className="text-2xl text-slate-400 hover:text-white transition-colors"
              aria-label="Pular tour"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`p-6 transition-opacity duration-200 ${isAnimating ? "opacity-0" : "opacity-100"}`}>
          <p className="text-slate-200 text-base leading-relaxed mb-6">{step.description}</p>
          
          {/* Visual Column Guide */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((col) => (
              <div
                key={col}
                className={`rounded-xl p-4 border-2 transition-all duration-300 ${
                  col === step.column
                    ? getColumnHighlight(col as 1 | 2 | 3)
                    : "border-white/5 bg-white/5 opacity-40"
                }`}
              >
                <p className="text-xs font-semibold text-center mb-1">
                  {col === 1 && "📂 Contexto"}
                  {col === 2 && "💬 Chat"}
                  {col === 3 && "⚙️ Governança"}
                </p>
                <p className="text-[10px] text-slate-400 text-center">
                  {col === 1 && "Escopo & histórico"}
                  {col === 2 && "Ação & interação"}
                  {col === 3 && "Controles & segurança"}
                </p>
              </div>
            ))}
          </div>

          {/* Step-specific tips */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-sm font-semibold text-emerald-200 mb-2">💡 Dica</p>
            {step.id === "context" && (
              <p className="text-sm text-slate-300">
                Retome sessões anteriores para manter o contexto do RAG. O sistema reindexará automaticamente.
              </p>
            )}
            {step.id === "chat" && (
              <p className="text-sm text-slate-300">
                Use LegacyAssist para um fluxo guiado sem execução automática, ideal para iniciantes.
              </p>
            )}
            {step.id === "governance" && (
              <p className="text-sm text-slate-300">
                Monitore os indicadores de status (verde/vermelho) para saber se Worker e Sandbox estão ativos.
              </p>
            )}
            {step.id === "agents" && (
              <p className="text-sm text-slate-300">
                O Orquestrador quebra tarefas complexas em subtarefas e coordena múltiplos agentes automaticamente.
              </p>
            )}
            {step.id === "safety" && (
              <p className="text-sm text-slate-300">
                Com Safe Mode ativo, ações destrutivas como merge são bloqueadas até você desativar manualmente.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ONBOARDING_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentStep 
                    ? "bg-emerald-500 w-4" 
                    : idx < currentStep 
                      ? "bg-emerald-500/50" 
                      : "bg-white/20"
                }`}
                aria-label={`Ir para passo ${idx + 1}`}
              />
            ))}
          </div>
          
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10 transition-colors"
              >
                Anterior
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm shadow-lg shadow-emerald-500/30 transition-colors"
            >
              {isLastStep ? "Começar!" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for managing onboarding state
export function useOnboarding(storageKey: string) {
  // Start with SSR-safe defaults, then hydrate on client
  const [hasSeenTour, setHasSeenTour] = useState(true); // SSR default
  const [showTour, setShowTour] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage after mount (client-side only)
  if (typeof window !== 'undefined' && !isHydrated) {
    const seen = localStorage.getItem(`${storageKey}:tourComplete`);
    if (seen !== null) {
      // Only update if different from SSR default
      const seenValue = seen === "true";
      if (seenValue !== hasSeenTour) {
        setHasSeenTour(seenValue);
      }
    } else {
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
