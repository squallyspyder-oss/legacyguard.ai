"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { X, Sparkles, Search, Globe, Lightbulb, Box, Play, ChevronRight } from "lucide-react"

interface LegacyAssistOverlayProps {
  step: string
  onClose: () => void
  onAction: (action: string) => void
}

const ASSIST_STEPS: Record<
  string,
  {
    title: string
    description: string
    actions: { id: string; label: string; icon: React.ReactNode; description: string }[]
    position?: { top?: string; left?: string; right?: string; bottom?: string }
  }
> = {
  welcome: {
    title: "Bem-vindo ao LegacyAssist",
    description: "Eu vou guiar voce passo a passo. Primeiro, me conte o que voce precisa fazer.",
    actions: [
      {
        id: "rag",
        label: "Buscar Contexto",
        icon: <Search className="w-4 h-4" />,
        description: "Pesquisar no indice RAG",
      },
      { id: "web", label: "Pesquisa Web", icon: <Globe className="w-4 h-4" />, description: "Buscar na internet" },
      {
        id: "brainstorm",
        label: "Brainstorm",
        icon: <Lightbulb className="w-4 h-4" />,
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
        icon: <Search className="w-4 h-4" />,
        description: "Codigo e docs indexados",
      },
      { id: "web", label: "Web Search", icon: <Globe className="w-4 h-4" />, description: "Fontes externas" },
    ],
  },
  validate: {
    title: "Validacao",
    description: "Antes de executar, vamos validar em ambiente seguro.",
    actions: [
      { id: "twin", label: "Twin Builder", icon: <Box className="w-4 h-4" />, description: "Reproduzir cenario" },
      { id: "sandbox", label: "Sandbox", icon: <Play className="w-4 h-4" />, description: "Testar isoladamente" },
    ],
  },
  execute: {
    title: "Pronto para Executar",
    description: "Validacao completa. Deseja prosseguir com a orquestracao?",
    actions: [
      {
        id: "orchestrate",
        label: "Orquestrar",
        icon: <Sparkles className="w-4 h-4" />,
        description: "Executar plano completo",
      },
    ],
  },
}

export default function LegacyAssistOverlay({ step, onClose, onAction }: LegacyAssistOverlayProps) {
  const [currentStep, setCurrentStep] = useState(step)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const stepData = ASSIST_STEPS[currentStep] || ASSIST_STEPS.welcome

  const handleAction = (actionId: string) => {
    onAction(actionId)

    // Auto-advance to next step based on action
    if (actionId === "rag" || actionId === "web" || actionId === "brainstorm") {
      setCurrentStep("validate")
    } else if (actionId === "twin" || actionId === "sandbox") {
      setCurrentStep("execute")
    } else if (actionId === "orchestrate") {
      onClose()
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[100] pointer-events-none ${isVisible ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
    >
      {/* Spotlight effect - points to chat input */}
      <div
        className="absolute bottom-32 left-1/2 -translate-x-1/2 w-[600px] h-24
                   rounded-2xl border-2 border-primary/50 pointer-events-none"
        style={{
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.7), 0 0 40px rgba(16, 185, 129, 0.3)",
          animation: "spotlight 0.4s ease-out forwards",
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute bottom-60 left-1/2 -translate-x-1/2 w-full max-w-md
                   pointer-events-auto animate-fade-in-up"
      >
        <div className="bg-card/90 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-primary/30 relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{stepData.title}</h3>
              <p className="text-sm text-muted-foreground">{stepData.description}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {stepData.actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                className="w-full flex items-center gap-4 p-4 rounded-xl
                         bg-secondary/50 border border-border
                         hover:bg-primary/10 hover:border-primary/30
                         transition-all duration-200 group text-left"
              >
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  {action.icon}
                </div>
                <div className="flex-1">
                  <p className="font-medium group-hover:text-primary transition-colors">{action.label}</p>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {Object.keys(ASSIST_STEPS).map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === currentStep
                    ? "bg-primary w-4"
                    : Object.keys(ASSIST_STEPS).indexOf(currentStep) > i
                      ? "bg-primary/50"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Skip link */}
          <button
            onClick={onClose}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors"
          >
            Fechar guia e continuar sozinho
          </button>

          {/* Arrow pointing down */}
          <div
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6
                       bg-card border-b border-r border-primary/30 rotate-45"
          />
        </div>
      </div>
    </div>
  )
}
