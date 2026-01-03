"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import type { Session } from "next-auth"
import type { AppSettings } from "../layout/MainLayout"
import WelcomeScreen from "./WelcomeScreen"
import MessageList from "./MessageList"
import ChatInput from "./ChatInput"
import FloatingSuggestions from "./FloatingSuggestions"
import { AGENT_ROLES } from "../AgentSelector"
import { Menu, Settings, Shield, Sparkles } from "lucide-react"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  patches?: Patch[]
  tests?: TestFile[]
  approvalRequired?: string
  suggestOrchestrateText?: string
  twinOffer?: { prompt: string }
  twinReady?: boolean
  agentRole?: string
}

export interface Patch {
  file: string
  original: string
  fixed: string
}

export interface TestFile {
  file: string
  content: string
}

interface ChatContainerProps {
  session: Session | null
  settings: AppSettings
  isMobile: boolean
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenSettings: () => void
  assistActive: boolean
  onAssistToggle: (active: boolean) => void
  onAssistAction: (step: string) => void
  // LegacyAssist action execution
  pendingAssistAction?: string | null
  onAssistActionConsumed?: () => void
  // Quick action from sidebar
  quickAgentRole?: string | null
  quickPrompt?: string | null
  onQuickActionConsumed?: () => void
}

export default function ChatContainer({
  session,
  settings,
  isMobile,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenSettings,
  assistActive: _assistActive,
  onAssistToggle,
  onAssistAction: _onAssistAction,
  pendingAssistAction,
  onAssistActionConsumed,
  quickAgentRole,
  quickPrompt,
  onQuickActionConsumed,
}: ChatContainerProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [agentRole, setAgentRole] = useState<string>(AGENT_ROLES[0].key)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const hasMessages = messages.length > 0

  // Smart Agent Router - detecta intenção e sugere/seleciona agente
  const routeToAgent = useCallback((message: string): string => {
    const t = message.toLowerCase()
    // Incidentes/erros -> orquestrar com Twin Builder
    if (/incidente|erro|bug|falha|crash|exception|stacktrace/.test(t)) return 'orchestrate'
    // Ações de código -> operador ou orquestrador
    if (/patch|fix|corrigir|refatorar|aplicar|criar pr|pull request|branch/.test(t)) return 'orchestrate'
    // Deploy/merge -> executor (via orquestrador)
    if (/deploy|merge|publicar|release/.test(t)) return 'orchestrate'
    // Revisão/compliance -> reviewer
    if (/revisar|review|compliance|gdpr|soc2|segurança|vulnerabilidade/.test(t)) return 'reviewer'
    // Análise simples -> advisor
    if (/analisar|analise|explicar|entender|como funciona/.test(t)) return 'advisor'
    // Default -> chat
    return 'chat'
  }, [])

  // Effect para processar quick actions da sidebar
  useEffect(() => {
    if (quickAgentRole) {
      setAgentRole(quickAgentRole)
      if (quickPrompt) {
        setInput(quickPrompt)
      }
      onQuickActionConsumed?.()
    }
  }, [quickAgentRole, quickPrompt, onQuickActionConsumed])

  // Compute inline suggestions based on input
  const suggestions = useMemo(() => {
    if (!input.trim() || input.length < 3) return []
    const t = input.toLowerCase()
    const list: string[] = []

    if (t.includes("incidente") || t.includes("erro") || t.includes("falha")) {
      list.push("Acionar Twin Builder para reproduzir o incidente")
      list.push("Analisar logs e stacktrace do erro")
    }
    if (t.includes("sandbox") || t.includes("test")) {
      list.push("Executar em sandbox isolado antes de aplicar")
    }
    if (t.includes("refator") || t.includes("legacy")) {
      list.push("Analisar complexidade ciclomatica do codigo")
      list.push("Sugerir padroes de modernizacao")
    }
    if (t.includes("segur") || t.includes("vuln")) {
      list.push("Executar scan de vulnerabilidades")
      list.push("Verificar compliance GDPR/SOC2")
    }
    if (t.includes("deploy") || t.includes("merge")) {
      list.push("Revisar changeset antes do merge")
      list.push("Executar testes de regressao")
    }
    if (list.length === 0 && input.length > 10) {
      list.push("Pesquisar no contexto RAG")
      list.push("Consultar documentacao")
    }

    return list.slice(0, 4)
  }, [input])

  useEffect(() => {
    setShowSuggestions(suggestions.length > 0 && !isLoading)
  }, [suggestions, isLoading])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Activate LegacyAssist when selected
  useEffect(() => {
    if (agentRole === "legacyAssist") {
      onAssistToggle(true)
    } else {
      onAssistToggle(false)
    }
  }, [agentRole, onAssistToggle])

  // LegacyAssist action handlers
  const executeLegacyAssistAction = useCallback(async (action: string, context?: string) => {
    setIsLoading(true)
    
    // Adiciona mensagem do usuário indicando a ação
    const actionLabels: Record<string, string> = {
      rag: "🔍 Buscar no RAG",
      web: "🌐 Pesquisar na Web",
      brainstorm: "💡 Brainstorm",
      twin: "🧬 Twin Builder",
      sandbox: "🔒 Executar no Sandbox",
      orchestrate: "🚀 Orquestrar",
    }
    
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: `${actionLabels[action] || action}${context ? `: ${context}` : ""}`,
      timestamp: new Date(),
      agentRole: "legacyAssist",
    }
    setMessages((prev) => [...prev, userMessage])
    
    try {
      let response: Message | null = null
      
      switch (action) {
        case "rag": {
          // Busca no índice RAG
          const query = context || input || "buscar contexto relevante"
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`)
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro no RAG" }))
            throw new Error(error.error || "Erro ao buscar no RAG")
          }
          
          const data = await res.json()
          const resultsText = data.results?.length > 0
            ? data.results.map((r: any, i: number) => `**${i + 1}. ${r.path}**\n\`\`\`${r.language || ''}\n${r.snippet}\n\`\`\``).join("\n\n")
            : "Nenhum resultado encontrado no índice RAG."
          
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `## 🔍 Busca RAG\n\n**Query:** "${query}"\n**Resultados:** ${data.count || 0}\n\n${resultsText}`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
          break
        }
        
        case "web": {
          // Pesquisa web (usa o chat com deepSearch)
          const query = context || input || "pesquisar informações relevantes"
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              message: `[Web Search] ${query}`,
              deepSearch: true,
              context: { mode: "webSearch" }
            }),
          })
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro na pesquisa web" }))
            throw new Error(error.error || "Erro na pesquisa web")
          }
          
          const data = await res.json()
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `## 🌐 Pesquisa Web\n\n${data.reply || "Sem resultados."}`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
          break
        }
        
        case "brainstorm": {
          // Brainstorm usando chat
          const query = context || input || "explorar soluções"
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              message: `[Brainstorm] Explore diferentes abordagens e soluções para: ${query}`,
              deepSearch: false,
              context: { mode: "brainstorm" }
            }),
          })
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro no brainstorm" }))
            throw new Error(error.error || "Erro no brainstorm")
          }
          
          const data = await res.json()
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `## 💡 Brainstorm\n\n${data.reply || "Sem ideias geradas."}`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
          break
        }
        
        case "twin": {
          // Twin Builder - aciona orquestração com twin-builder
          if (!settings.workerEnabled) {
            throw new Error("Worker desativado. Ative nas configurações para usar o Twin Builder.")
          }
          
          const res = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "orchestrate",
              request: `[Twin Builder] Reproduzir cenário para: ${context || input || "análise"}`,
              sandbox: { enabled: true, mode: settings.sandboxMode },
              safeMode: settings.safeMode,
              reviewGate: settings.reviewGate,
            }),
          })
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro no Twin Builder" }))
            throw new Error(error.error || "Erro ao acionar Twin Builder")
          }
          
          const data = await res.json()
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `## 🧬 Twin Builder\n\n✅ **Cenário iniciado**\n\nID: \`${data.taskId || data.id || "pending"}\`\n\nO Twin Builder está reproduzindo o cenário em ambiente isolado. Acompanhe o progresso.`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
          break
        }
        
        case "sandbox": {
          // Sandbox - execução isolada
          if (!settings.workerEnabled) {
            throw new Error("Worker desativado. Ative nas configurações para usar o Sandbox.")
          }
          
          const res = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "executor",
              payload: {
                request: `[Sandbox] Executar em ambiente isolado: ${context || input || "teste"}`,
                sandbox: { enabled: true, mode: "fail" },
              },
            }),
          })
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro no Sandbox" }))
            throw new Error(error.error || "Erro ao executar no Sandbox")
          }
          
          const data = await res.json()
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `## 🔒 Sandbox\n\n✅ **Execução iniciada**\n\nID: \`${data.taskId || data.id || "pending"}\`\n\nO código está sendo executado em ambiente isolado. Aguarde os resultados.`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
          break
        }
        
        case "orchestrate": {
          // Orquestração completa
          if (!settings.workerEnabled) {
            throw new Error("Worker desativado. Ative nas configurações para usar a Orquestração.")
          }
          
          const res = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "orchestrate",
              request: context || input || "executar plano completo",
              sandbox: settings.sandboxEnabled ? { enabled: true, mode: settings.sandboxMode } : undefined,
              safeMode: settings.safeMode,
              reviewGate: settings.reviewGate,
            }),
          })
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro na orquestração" }))
            throw new Error(error.error || "Erro ao iniciar orquestração")
          }
          
          const data = await res.json()
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `## 🚀 Orquestração\n\n✅ **Plano em execução**\n\nID: \`${data.taskId || data.id || "pending"}\`\n\nO orquestrador está coordenando os agentes. Acompanhe o progresso em tempo real.`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
          break
        }
        
        default:
          response = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `Ação "${action}" não reconhecida.`,
            timestamp: new Date(),
            agentRole: "legacyAssist",
          }
      }
      
      if (response) {
        setMessages((prev) => [...prev, response!])
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `❌ **Erro**: ${error.message}`,
        timestamp: new Date(),
        agentRole: "legacyAssist",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [input, settings])

  // Handle assist overlay actions - executa quando uma ação do LegacyAssist é disparada
  useEffect(() => {
    if (pendingAssistAction) {
      console.log("[ChatContainer] Executing LegacyAssist action:", pendingAssistAction)
      executeLegacyAssistAction(pendingAssistAction, input)
      onAssistActionConsumed?.()
    }
  }, [pendingAssistAction, executeLegacyAssistAction, input, onAssistActionConsumed])


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading || (!input.trim() && uploadedFiles.length === 0)) return

    const userText = input.trim() || "Analise os arquivos enviados."
    
    // Smart routing: se estiver no chat e detectar ação complexa, sugerir mudança
    const suggestedAgent = routeToAgent(userText)
    const shouldSuggestSwitch = agentRole === 'chat' && suggestedAgent !== 'chat'
    
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: userText + (uploadedFiles.length > 0 ? `\n\n📎 ${uploadedFiles.map((f) => f.name).join(", ")}` : ""),
      timestamp: new Date(),
      agentRole,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setShowSuggestions(false)
    setIsLoading(true)

    try {
      // LegacyAssist mode - guided flow with real API
      if (agentRole === "legacyAssist") {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              message: `[LegacyAssist] ${userText}`,
              deepSearch: settings.deepSearch,
              context: { mode: "legacyAssist" } 
            }),
          })
          
          if (!res.ok) {
            const error = await res.json().catch(() => ({ error: "Erro no servidor" }))
            throw new Error(error.error || "Erro ao processar LegacyAssist")
          }
          
          const data = await res.json()
          const assistantMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: "assistant",
            content: data.reply || "Sem resposta do servidor.",
            timestamp: new Date(),
            agentRole,
          }
          setMessages((prev) => [...prev, assistantMessage])
        } catch (error: any) {
          const errorMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: "assistant",
            content: `❌ **Erro**: ${error.message}`,
            timestamp: new Date(),
            agentRole,
          }
          setMessages((prev) => [...prev, errorMessage])
        }
        setIsLoading(false)
        setUploadedFiles([])
        return
      }

      // Chat mode - call /api/chat
      if (agentRole === "chat") {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message: userText, 
            deepSearch: settings.deepSearch 
          }),
        })
        
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Erro no servidor" }))
          throw new Error(error.error || "Erro ao processar chat")
        }
        
        const data = await res.json()
        
        // Auto-sugestão: se detectou ação e backend também sugere, adicionar CTA
        const showAgentSuggestion = shouldSuggestSwitch || data.suggestOrchestrate
        const suggestContent = showAgentSuggestion 
          ? `\n\n---\n💡 **Detectei que você quer executar uma ação.** [Clique aqui para usar o Orquestrador](#switch-orchestrate) e automatizar o processo.`
          : ''
        
        const assistantMessage: Message = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: (data.reply || "Sem resposta do servidor.") + suggestContent,
          timestamp: new Date(),
          agentRole,
          suggestOrchestrateText: showAgentSuggestion ? userText : undefined,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsLoading(false)
        setUploadedFiles([])
        return
      }

      // Orchestrate mode - call /api/agents
      if (agentRole === "orchestrate") {
        console.log('[CHAT] Verificando workerEnabled para orquestração:', settings.workerEnabled);
        console.log('[CHAT] Configurações completas:', settings);

        if (!settings.workerEnabled) {
          console.log('[CHAT] Worker desabilitado, mostrando mensagem de erro');
          const assistantMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: "assistant",
            content: "⚠️ **Worker desativado.** Ative o Worker nas configurações para usar o modo Orquestração.",
            timestamp: new Date(),
            agentRole,
          }
          setMessages((prev) => [...prev, assistantMessage])
          setIsLoading(false)
          return
        }

        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "orchestrate",
            request: userText, // API espera 'request', não 'message'
            sandbox: settings.sandboxEnabled ? { enabled: true, mode: settings.sandboxMode } : undefined,
            safeMode: settings.safeMode,
            reviewGate: settings.reviewGate,
          }),
        })

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Erro no servidor" }))
          throw new Error(error.error || "Erro ao iniciar orquestração")
        }

        const data = await res.json()
        const assistantMessage: Message = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: data.reply || `🚀 **Orquestração iniciada**\n\nID: \`${data.orchestrationId || "pending"}\`\n\nAcompanhe o progresso em tempo real.`,
          timestamp: new Date(),
          agentRole,
          approvalRequired: data.requiresApproval ? data.orchestrationId : undefined,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsLoading(false)
        setUploadedFiles([])
        return
      }

      // Agent modes that go through worker queue (advisor, reviewer, operator, executor)
      const agentModesThroughQueue = ['advisor', 'reviewer', 'operator', 'executor']
      
      if (agentModesThroughQueue.includes(agentRole)) {
        // Esses agentes rodam via worker - usar /api/agents
        console.log('[CHAT] Verificando workerEnabled para agente', agentRole, ':', settings.workerEnabled);

        if (!settings.workerEnabled) {
          console.log('[CHAT] Worker desabilitado para agente', agentRole, ', mostrando mensagem de erro');
          const assistantMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: "assistant",
            content: `⚠️ **Worker desativado.** Ative o Worker nas configurações para usar o modo ${agentRole}.`,
            timestamp: new Date(),
            agentRole,
          }
          setMessages((prev) => [...prev, assistantMessage])
          setIsLoading(false)
          return
        }

        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: agentRole,
            payload: { 
              request: userText,
              context: {} 
            },
          }),
        })

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: "Erro no servidor" }))
          throw new Error(error.error || `Erro ao executar ${agentRole}`)
        }

        const data = await res.json()
        const assistantMessage: Message = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: data.reply || `🚀 **${agentRole}** iniciado\n\nID: \`${data.taskId || "pending"}\`\n\nAcompanhe o progresso em tempo real.`,
          timestamp: new Date(),
          agentRole,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsLoading(false)
        setUploadedFiles([])
        return
      }

      // Legacy modes (legacyAssist) - call /api/agent with FormData for static analysis
      const formData = new FormData()
      formData.append("message", userText)
      formData.append("role", agentRole)
      uploadedFiles.forEach((file) => formData.append("files", file))

      const res = await fetch("/api/agent", { method: "POST", body: formData })
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Erro no servidor" }))
        throw new Error(error.error || "Erro ao processar")
      }

      const data = await res.json()
      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: data.reply || "Processamento concluído.",
        timestamp: new Date(),
        agentRole,
        patches: data.patches,
        tests: data.tests,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: `❌ **Erro:** ${errorMessage}\n\nTente novamente ou verifique as configurações.`,
        timestamp: new Date(),
        agentRole,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } finally {
      setIsLoading(false)
      setUploadedFiles([])
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput((prev) => prev + " " + suggestion)
    setShowSuggestions(false)
  }

  const handleQuickAction = (prompt: string) => {
    setInput(prompt)
  }

  const handleFileUpload = (files: FileList | null) => {
    if (files) {
      const newFiles = Array.from(files).filter((file) => file.size < 2000000)
      setUploadedFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Safety badges for display
  const safetyBadges = useMemo(
    () =>
      [
        settings.sandboxEnabled ? `Sandbox ${settings.sandboxMode}` : null,
        settings.safeMode ? "Safe Mode" : null,
        settings.reviewGate ? "Review Gate" : null,
      ].filter(Boolean) as string[],
    [settings],
  )

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
            {agentRole === "legacyAssist" && <Sparkles className="w-4 h-4 text-primary" />}
            <span className="text-sm font-medium">
              {AGENT_ROLES.find((r) => r.key === agentRole)?.label.split(" — ")[0]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Safety badges */}
          <div className="hidden md:flex items-center gap-1.5">
            {safetyBadges.slice(0, 2).map((badge, i) => (
              <span key={i} className="badge badge-primary">
                <Shield className="w-3 h-3 mr-1" />
                {badge}
              </span>
            ))}
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Abrir configuracoes"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      {hasMessages ? (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">
              <MessageList 
                messages={messages} 
                isLoading={isLoading} 
                onSwitchAgent={(agent, prompt) => {
                  setAgentRole(agent)
                  if (prompt) setInput(prompt)
                }}
              />
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area with floating suggestions */}
          <div className="relative border-t border-border bg-background/80 backdrop-blur-xl">
            <FloatingSuggestions
              suggestions={suggestions}
              visible={showSuggestions}
              onSelect={handleSuggestionClick}
              onDismiss={() => setShowSuggestions(false)}
            />
            <div className="max-w-3xl mx-auto px-4 py-4">
              <ChatInput
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                uploadedFiles={uploadedFiles}
                onFileUpload={handleFileUpload}
                onRemoveFile={handleRemoveFile}
                agentRole={agentRole}
                onAgentRoleChange={setAgentRole}
                deepSearch={settings.deepSearch}
                onDeepSearchChange={() => {}}
                compact
              />
            </div>
          </div>
        </>
      ) : (
        <WelcomeScreen
          session={session}
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          uploadedFiles={uploadedFiles}
          onFileUpload={handleFileUpload}
          onRemoveFile={handleRemoveFile}
          agentRole={agentRole}
          onAgentRoleChange={setAgentRole}
          deepSearch={settings.deepSearch}
          onDeepSearchChange={() => {}}
          onQuickAction={handleQuickAction}
          suggestions={suggestions}
          showSuggestions={showSuggestions}
          onSuggestionClick={handleSuggestionClick}
          onDismissSuggestions={() => setShowSuggestions(false)}
        />
      )}
    </div>
  )
}
