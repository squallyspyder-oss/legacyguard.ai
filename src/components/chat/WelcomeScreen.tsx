"use client"

import type React from "react"
import type { Session } from "next-auth"
import ChatInput from "./ChatInput"
import FloatingSuggestions from "./FloatingSuggestions"
import { Shield, Zap, Search, FileCode, AlertTriangle, GitBranch, Sparkles } from "lucide-react"

interface WelcomeScreenProps {
  session: Session | null
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  uploadedFiles: File[]
  onFileUpload: (files: FileList | null) => void
  onRemoveFile: (index: number) => void
  agentRole: string
  onAgentRoleChange: (role: string) => void
  deepSearch: boolean
  onDeepSearchChange: (value: boolean) => void
  onQuickAction: (action: string) => void
  suggestions: string[]
  showSuggestions: boolean
  onSuggestionClick: (suggestion: string) => void
  onDismissSuggestions: () => void
}

const quickActions = [
  {
    icon: <FileCode className="w-5 h-5" />,
    label: "Analisar repositorio",
    description: "Scan de vulnerabilidades e problemas",
    prompt: "Analise o repositorio em busca de vulnerabilidades e problemas de seguranca",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    label: "Revisar compliance",
    description: "GDPR, SOC2, seguranca",
    prompt: "Revise o codigo para compliance GDPR e SOC2",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  {
    icon: <AlertTriangle className="w-5 h-5" />,
    label: "Investigar incidente",
    description: "Analise de causa raiz",
    prompt: "Ajude-me a investigar um incidente de seguranca",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  {
    icon: <GitBranch className="w-5 h-5" />,
    label: "Refatorar legacy",
    description: "Modernizacao de codigo",
    prompt: "Sugira refatoracoes para modernizar codigo legado",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/30",
  },
]

export default function WelcomeScreen({
  session,
  input,
  onInputChange,
  onSubmit,
  isLoading,
  uploadedFiles,
  onFileUpload,
  onRemoveFile,
  agentRole,
  onAgentRoleChange,
  deepSearch,
  onDeepSearchChange,
  onQuickAction,
  suggestions,
  showSuggestions,
  onSuggestionClick,
  onDismissSuggestions,
}: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-8">
        {/* Animated Logo */}
        <div className="text-center space-y-6 animate-fade-in-up">
          <div className="inline-flex items-center justify-center">
            <InteractiveLogo />
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {session?.user?.name ? (
                <>
                  Ola, <span className="gradient-text">{session.user.name.split(" ")[0]}</span>
                </>
              ) : (
                <>
                  Bem-vindo ao <span className="gradient-text">LegacyGuard</span>
                </>
              )}
            </h1>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Plataforma de seguranca com IA para sistemas legados. Como posso ajudar?
            </p>
          </div>
        </div>

        {/* Input area with floating suggestions */}
        <div className="relative animate-fade-in-up">
          <FloatingSuggestions
            suggestions={suggestions}
            visible={showSuggestions}
            onSelect={onSuggestionClick}
            onDismiss={onDismissSuggestions}
          />
          <ChatInput
            input={input}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            isLoading={isLoading}
            uploadedFiles={uploadedFiles}
            onFileUpload={onFileUpload}
            onRemoveFile={onRemoveFile}
            agentRole={agentRole}
            onAgentRoleChange={onAgentRoleChange}
            deepSearch={deepSearch}
            onDeepSearchChange={onDeepSearchChange}
          />
        </div>

        {/* Quick actions */}
        <div className="animate-fade-in-up">
          <p className="text-xs text-muted-foreground text-center mb-4 uppercase tracking-wider font-medium">
            Acoes rapidas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => onQuickAction(action.prompt)}
                className={`
                  flex items-start gap-4 p-4 rounded-xl
                  bg-card border border-border
                  hover:border-primary/30 hover:shadow-lg
                  transition-all duration-200 text-left group
                  card-interactive
                `}
              >
                <div className={`p-2.5 rounded-xl ${action.bg} ${action.color} transition-colors`}>{action.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">{action.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div
          className="flex items-center justify-center gap-6 text-xs text-muted-foreground animate-fade-in-up"
        >
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Sandbox isolado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span>Multi-agente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-primary" />
            <span>RAG contextual</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function InteractiveLogo() {
  return (
    <div className="relative group">
      {/* Outer glow */}
      <div className="absolute inset-0 blur-3xl opacity-40 bg-primary rounded-full scale-150 animate-pulse-ring" />

      {/* Main logo */}
      <svg viewBox="0 0 120 120" className="w-28 h-28 md:w-32 md:h-32 animate-logo-float relative z-10">
        {/* Outer rotating ring */}
        <circle
          cx="60"
          cy="60"
          r="56"
          fill="none"
          className="stroke-primary/15"
          strokeWidth="0.5"
          strokeDasharray="8 6"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 60 60"
            to="360 60 60"
            dur="40s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Middle ring */}
        <circle cx="60" cy="60" r="48" fill="none" className="stroke-primary/25" strokeWidth="1" />

        {/* Inner rotating ring */}
        <circle
          cx="60"
          cy="60"
          r="40"
          fill="none"
          className="stroke-primary/20"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360 60 60"
            to="0 60 60"
            dur="25s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Shield background */}
        <rect x="30" y="30" width="60" height="60" rx="16" className="fill-card" />
        <rect x="30" y="30" width="60" height="60" rx="16" fill="none" className="stroke-primary" strokeWidth="2" />

        {/* Checkmark with gradient */}
        <defs>
          <linearGradient id="check-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.72 0.17 165)" />
            <stop offset="100%" stopColor="oklch(0.68 0.15 200)" />
          </linearGradient>
        </defs>
        <path
          d="M42 60L52 70L78 44"
          fill="none"
          stroke="url(#check-gradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Center glow */}
        <circle cx="60" cy="60" r="18" className="fill-primary/10" />

        {/* Pulse effect */}
        <circle cx="60" cy="60" r="30" fill="none" className="stroke-primary/30" strokeWidth="0.5">
          <animate attributeName="r" values="30;52;30" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>

      {/* Sparkle effects */}
      <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-primary/60 animate-pulse" />
      <Sparkles
        className="absolute -bottom-1 -left-1 w-4 h-4 text-primary/40 animate-pulse animate-delay-500"
      />
    </div>
  )
}
