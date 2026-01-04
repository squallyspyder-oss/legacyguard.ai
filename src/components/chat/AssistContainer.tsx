"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import type { Session } from "next-auth"
import type { AppSettings } from "../layout/MainLayout"
import { Menu, Settings, Shield, Zap, Search, Terminal, GitBranch, Eye, Lightbulb } from "lucide-react"

/**
 * AssistContainer - Container Principal do LegacyAssist
 * 
 * Implementa a UI para o agente autônomo de alta performance:
 * - Mostra o bloco de raciocínio (<thinking>)
 * - Exibe ferramentas sendo usadas em tempo real
 * - Gerencia estado de sessão persistente
 * - Interface proativa (não passiva)
 */

// Tipos
export interface ThinkingBlock {
  understanding: string
  missing: string[]
  bestAgent: string
  toolsNeeded: string[]
  plan: string[]
  risks: string[]
}

export interface ToolUsage {
  tool: string
  success: boolean
  timestamp: Date
}

export interface SessionState {
  repoPath?: string
  analyzedFiles: string[]
  lastError?: { message: string; timestamp: Date; context?: string }
  sandboxStatus: "idle" | "running" | "completed" | "failed"
  activeTasks: { id: string; type: string; status: string }[]
}

export interface AssistMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  thinking?: ThinkingBlock
  toolsUsed?: ToolUsage[]
  suggestedNextAction?: string
  pendingActions?: any[]
}

interface AssistContainerProps {
  session: Session | null
  settings: AppSettings
  isMobile: boolean
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenSettings: () => void
}

// Ícones para ferramentas
const TOOL_ICONS: Record<string, React.ReactNode> = {
  searchRAG: <Search className="w-3 h-3" />,
  runSandbox: <Terminal className="w-3 h-3" />,
  getGraph: <GitBranch className="w-3 h-3" />,
  analyzeCode: <Eye className="w-3 h-3" />,
  orchestrate: <Zap className="w-3 h-3" />,
  twinBuilder: <Lightbulb className="w-3 h-3" />,
  readFile: <Search className="w-3 h-3" />,
  listFiles: <Search className="w-3 h-3" />,
}

export default function AssistContainer({
  session,
  settings,
  isMobile,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenSettings,
}: AssistContainerProps) {
  const [messages, setMessages] = useState<AssistMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sessionState, setSessionState] = useState<SessionState>({
    analyzedFiles: [],
    sandboxStatus: "idle",
    activeTasks: [],
  })
  const [showThinking, setShowThinking] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading || !input.trim()) return

    const userMessage: AssistMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input.trim(),
          sessionState: {
            repoPath: sessionState.repoPath,
            analyzedFiles: sessionState.analyzedFiles,
            lastError: sessionState.lastError
              ? {
                  message: sessionState.lastError.message,
                  timestamp: sessionState.lastError.timestamp.toISOString(),
                  context: sessionState.lastError.context,
                }
              : undefined,
            sandboxStatus: sessionState.sandboxStatus,
            activeTasks: sessionState.activeTasks,
          },
          settings: {
            sandboxEnabled: settings.sandboxEnabled,
            sandboxMode: settings.sandboxMode,
            workerEnabled: settings.workerEnabled,
            safeMode: settings.safeMode,
            reviewGate: settings.reviewGate,
          },
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro no servidor" }))
        throw new Error(error.error || "Erro ao processar")
      }

      const data = await res.json()

      // Atualizar estado da sessão
      if (data.sessionState) {
        setSessionState({
          repoPath: data.sessionState.repoPath,
          analyzedFiles: data.sessionState.analyzedFiles || [],
          lastError: data.sessionState.lastError,
          sandboxStatus: data.sessionState.sandboxStatus || "idle",
          activeTasks: data.sessionState.activeTasks || [],
        })
      }

      const assistantMessage: AssistMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        thinking: data.thinking,
        toolsUsed: data.toolsUsed?.map((t: any) => ({
          tool: t.tool.split("-")[0],
          success: t.success,
          timestamp: new Date(t.timestamp),
        })),
        suggestedNextAction: data.suggestedNextAction,
        pendingActions: data.pendingActions,
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Executar ações pendentes automaticamente
      if (data.pendingActions?.length > 0) {
        for (const action of data.pendingActions) {
          await executePendingAction(action)
        }
      }
    } catch (error: any) {
      const errorMessage: AssistMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: `❌ **Erro:** ${error.message}\n\nTente novamente ou verifique as configurações.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])

      // Registrar erro no estado da sessão
      setSessionState((prev) => ({
        ...prev,
        lastError: {
          message: error.message,
          timestamp: new Date(),
        },
      }))
    } finally {
      setIsLoading(false)
    }
  }

  const executePendingAction = async (action: any) => {
    // Executar orquestração ou twin-builder automaticamente
    if (action.action === "orchestrate" && settings.workerEnabled) {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "orchestrate",
          request: action.task,
          sandbox: settings.sandboxEnabled ? { enabled: true, mode: settings.sandboxMode } : undefined,
          safeMode: settings.safeMode,
          reviewGate: settings.reviewGate || action.requiresApproval,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setSessionState((prev) => ({
          ...prev,
          activeTasks: [
            ...prev.activeTasks,
            { id: data.taskId || data.orchestrationId, type: "orchestrate", status: "running" },
          ],
        }))
      }
    }
  }

  const quickActions = [
    { label: "Analisar repositório", prompt: "Analise a estrutura e qualidade do repositório atual" },
    { label: "Buscar bugs", prompt: "Busque no código por possíveis bugs ou problemas de segurança" },
    { label: "Mapear dependências", prompt: "Mostre o grafo de dependências dos principais módulos" },
    { label: "Reproduzir incidente", prompt: "Preciso reproduzir um incidente em ambiente seguro" },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          {(isMobile || sidebarCollapsed) && (
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Alternar sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            <span className="font-semibold">LegacyAssist</span>
            <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full">
              Guardião Autônomo
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Session state indicators */}
          <div className="hidden md:flex items-center gap-1.5">
            {sessionState.analyzedFiles.length > 0 && (
              <span className="badge badge-outline text-xs">
                {sessionState.analyzedFiles.length} arquivos
              </span>
            )}
            {sessionState.sandboxStatus !== "idle" && (
              <span
                className={`badge text-xs ${
                  sessionState.sandboxStatus === "running"
                    ? "badge-warning"
                    : sessionState.sandboxStatus === "completed"
                    ? "badge-success"
                    : "badge-error"
                }`}
              >
                Sandbox: {sessionState.sandboxStatus}
              </span>
            )}
            {settings.safeMode && (
              <span className="badge badge-primary text-xs">
                <Shield className="w-3 h-3 mr-1" />
                Safe
              </span>
            )}
          </div>
          <button
            onClick={() => setShowThinking(!showThinking)}
            className={`p-2 rounded-lg transition-colors ${
              showThinking ? "bg-primary/20 text-primary" : "hover:bg-secondary"
            }`}
            aria-label="Alternar visualização de raciocínio"
            title={showThinking ? "Ocultar raciocínio" : "Mostrar raciocínio"}
          >
            <Lightbulb className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Abrir configurações"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      {messages.length === 0 ? (
        /* Welcome Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-2xl w-full space-y-8">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
                <Lightbulb className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">LegacyAssist</h1>
              <p className="text-muted-foreground">
                Guardião técnico autônomo. Eu analiso, planejo, executo e corrijo.
                <br />
                <span className="text-sm">Não sou um assistente passivo — sou seu parceiro de execução.</span>
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => setInput(action.prompt)}
                  className="p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Descreva o que você precisa fazer..."
                className="w-full p-4 pr-12 rounded-xl border border-border bg-secondary/30 
                         focus:border-primary focus:ring-2 focus:ring-primary/20 
                         resize-none min-h-[120px] transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute bottom-4 right-4 p-2 rounded-lg bg-primary text-primary-foreground
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Zap className="w-5 h-5" />
              </button>
            </form>

            {/* Capabilities */}
            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded">
                <Search className="w-3 h-3" /> RAG
              </span>
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded">
                <Terminal className="w-3 h-3" /> Sandbox
              </span>
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded">
                <GitBranch className="w-3 h-3" /> Grafo
              </span>
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded">
                <Eye className="w-3 h-3" /> Análise
              </span>
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded">
                <Lightbulb className="w-3 h-3" /> Twin Builder
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Messages */
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/50 border border-border"
                    }`}
                  >
                    {/* Thinking Block (expandable) */}
                    {message.thinking && showThinking && (
                      <div className="mb-4 p-3 rounded-lg bg-background/50 border border-primary/20 text-sm">
                        <div className="flex items-center gap-2 text-primary font-medium mb-2">
                          <Lightbulb className="w-4 h-4" />
                          <span>Raciocínio</span>
                        </div>
                        <div className="space-y-2 text-muted-foreground">
                          {message.thinking.understanding && (
                            <p>
                              <strong>Entendi:</strong> {message.thinking.understanding}
                            </p>
                          )}
                          {message.thinking.plan.length > 0 && (
                            <div>
                              <strong>Plano:</strong>
                              <ol className="list-decimal list-inside ml-2">
                                {message.thinking.plan.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {message.thinking.risks.length > 0 && (
                            <p>
                              <strong>Riscos:</strong> {message.thinking.risks.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tools Used */}
                    {message.toolsUsed && message.toolsUsed.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {message.toolsUsed.map((tool, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs
                                     ${tool.success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
                          >
                            {TOOL_ICONS[tool.tool] || <Zap className="w-3 h-3" />}
                            {tool.tool}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Content */}
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {message.content.split("\n").map((line, i) => (
                        <p key={i} className="mb-1">
                          {line || <br />}
                        </p>
                      ))}
                    </div>

                    {/* Suggested Next Action */}
                    {message.suggestedNextAction && (
                      <button
                        onClick={() => setInput(message.suggestedNextAction!)}
                        className="mt-3 w-full p-2 rounded-lg bg-primary/10 border border-primary/20
                                 hover:bg-primary/20 transition-colors text-sm text-primary text-left"
                      >
                        💡 Próximo passo sugerido: {message.suggestedNextAction}
                      </button>
                    )}

                    {/* Timestamp */}
                    <div className="mt-2 text-xs text-muted-foreground opacity-50">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary/50 border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                      </div>
                      <span className="text-sm">Analisando e executando...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-border bg-background/80 backdrop-blur-xl">
            <div className="max-w-3xl mx-auto px-4 py-4">
              <form onSubmit={handleSubmit} className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Continue a conversa ou peça uma nova ação..."
                  className="w-full p-3 pr-12 rounded-xl border border-border bg-secondary/30 
                           focus:border-primary focus:ring-2 focus:ring-primary/20 
                           resize-none min-h-[60px] transition-all text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="absolute bottom-3 right-3 p-2 rounded-lg bg-primary text-primary-foreground
                           hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
