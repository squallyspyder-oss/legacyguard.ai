"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import Sidebar from "./Sidebar"
import ChatContainer from "../chat/ChatContainer"
import SettingsPanel from "../settings/SettingsPanel"
import LegacyAssistOverlay from "../assist/LegacyAssistOverlay"
import { useOnboarding } from "../OnboardingTour"
import OnboardingTour from "../OnboardingTour"

export type AppSettings = {
  // Security
  sandboxEnabled: boolean
  sandboxMode: "fail" | "warn"
  safeMode: boolean
  reviewGate: boolean
  maskingEnabled: boolean
  // Infrastructure
  workerEnabled: boolean
  apiEnabled: boolean
  ragReady: boolean
  ragDocumentCount: number // SITE_AUDIT P1: Contagem real de documentos
  // Cost controls
  deepSearch: boolean
  billingCap: number
  tokenCap: number
  temperatureCap: number
}

const defaultSettings: AppSettings = {
  sandboxEnabled: true,
  sandboxMode: "fail",
  safeMode: true,
  reviewGate: true,
  maskingEnabled: true,
  workerEnabled: true,
  apiEnabled: false,
  ragReady: true,
  ragDocumentCount: 0, // SITE_AUDIT P1: Padrão 0 até carregar
  deepSearch: false,
  billingCap: 20,
  tokenCap: 12000,
  temperatureCap: 0.5,
}

export type SessionItem = {
  id: string
  title: string
  tag: string
  recency: string
  risk: "baixo" | "medio" | "alto"
}

export default function MainLayout() {
  const { data: session } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // LegacyAssist state
  const [assistActive, setAssistActive] = useState(false)
  const [assistStep, setAssistStep] = useState<string | null>(null)
  const [pendingAssistAction, setPendingAssistAction] = useState<string | null>(null)

  // Quick action from sidebar -> ChatContainer
  const [quickAgentRole, setQuickAgentRole] = useState<string | null>(null)
  const [quickPrompt, setQuickPrompt] = useState<string | null>(null)

  // Handler for sidebar quick actions
  const handleQuickAction = useCallback((action: string) => {
    // action pode ser: agentRole (orchestrate, chat, etc) ou prompt completo
    const agentKeys = ['legacyAssist', 'chat', 'orchestrate', 'advisor', 'operator', 'reviewer', 'executor']
    if (agentKeys.includes(action)) {
      setQuickAgentRole(action)
      setQuickPrompt(null)
    } else {
      // É um prompt - usar orchestrate para ações complexas
      setQuickPrompt(action)
      setQuickAgentRole('orchestrate')
    }
    // Fechar sidebar em mobile
    if (isMobile) setSidebarOpen(false)
  }, [isMobile])

  // Onboarding
  const onboarding = useOnboarding(session?.user?.email ? `lg:${session.user.email}` : "lg:anon")

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
        setSidebarCollapsed(false)
      }
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Load sessions
  useEffect(() => {
    const loadSessions = async () => {
      setSessionsLoading(true)
      try {
        const res = await fetch("/api/sessions")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.sessions)) {
            setSessions(data.sessions)
            setSessionsLoading(false)
            return
          }
        }
      } catch {
        // Network error - continue with empty sessions
      }
      // No sessions found or API error - start fresh
      setSessions([])
      setSessionsLoading(false)
    }
    loadSessions()
  }, [])

  // Load config from server
  useEffect(() => {
    const loadConfig = async () => {
      try {
        console.log('[FRONTEND] Carregando configuração do servidor...');
        const res = await fetch("/api/config")
        console.log('[FRONTEND] Resposta da API config:', res.status, res.ok);

        if (res.ok) {
          const data = await res.json()
          console.log('[FRONTEND] Dados recebidos da API:', data);
          const cfg = data.config || {}
          const ragStatus = data.ragStatus || {}
          console.log('[FRONTEND] Configuração extraída:', cfg);
          console.log('[FRONTEND] RAG status:', ragStatus);
          console.log('[FRONTEND] workerEnabled da API:', cfg.workerEnabled);

          setSettings((prev) => {
            const newSettings = {
              ...prev,
              sandboxEnabled: cfg.sandboxEnabled ?? prev.sandboxEnabled,
              sandboxMode: cfg.sandboxFailMode ?? prev.sandboxMode,
              safeMode: cfg.safeMode ?? prev.safeMode,
              workerEnabled: cfg.workerEnabled ?? prev.workerEnabled,
              maskingEnabled: cfg.maskingEnabled ?? prev.maskingEnabled,
              deepSearch: cfg.deepSearch ?? prev.deepSearch,
              apiEnabled: cfg.apiEnabled ?? prev.apiEnabled,
              ragReady: cfg.ragReady ?? prev.ragReady,
              // SITE_AUDIT P1: Carregar documentCount do ragStatus
              ragDocumentCount: ragStatus.documentCount ?? prev.ragDocumentCount,
            };
            console.log('[FRONTEND] Novas configurações aplicadas:', newSettings);
            console.log('[FRONTEND] workerEnabled final:', newSettings.workerEnabled);
            return newSettings;
          })
        } else {
          console.error('[FRONTEND] Falha ao carregar configuração:', res.status);
        }
      } catch (error) {
        console.error('[FRONTEND] Erro ao carregar configuração:', error);
        // Keep defaults
      }
    }
    loadConfig()
  }, [])

  const handleUpdateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null)
  }, [])

  const handleSelectSession = useCallback(
    (sessionItem: SessionItem) => {
      setActiveSessionId(sessionItem.id)
      if (isMobile) setSidebarOpen(false)
    },
    [isMobile],
  )

  const handleAssistAction = useCallback((step: string) => {
    // Ações específicas do LegacyAssist (rag, web, brainstorm, twin, sandbox, orchestrate)
    const actionIds = ["rag", "web", "brainstorm", "twin", "sandbox", "orchestrate"]
    if (actionIds.includes(step)) {
      // Dispara a ação para o ChatContainer executar
      setPendingAssistAction(step)
    } else {
      // Apenas muda o step do overlay
      setAssistStep(step)
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setSidebarOpen(!sidebarOpen)
    } else {
      setSidebarCollapsed(!sidebarCollapsed)
    }
  }, [isMobile, sidebarOpen, sidebarCollapsed])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        isMobile={isMobile}
        onToggle={toggleSidebar}
        onClose={() => setSidebarOpen(false)}
        session={session}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onStartTour={onboarding.startTour}
        settings={settings}
        onQuickAction={handleQuickAction}
      />

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <ChatContainer
          session={session}
          settings={settings}
          isMobile={isMobile}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onOpenSettings={() => setSettingsOpen(true)}
          assistActive={assistActive}
          onAssistToggle={setAssistActive}
          onAssistAction={handleAssistAction}
          pendingAssistAction={pendingAssistAction}
          onAssistActionConsumed={() => setPendingAssistAction(null)}
          quickAgentRole={quickAgentRole}
          quickPrompt={quickPrompt}
          onQuickActionConsumed={() => { setQuickAgentRole(null); setQuickPrompt(null); }}
        />
      </main>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* LegacyAssist Overlay */}
      {assistActive && assistStep && (
        <LegacyAssistOverlay step={assistStep} onClose={() => setAssistStep(null)} onAction={handleAssistAction} />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour
        isOpen={onboarding.showTour}
        onClose={onboarding.closeTour}
        onComplete={onboarding.completeTour}
      />
    </div>
  )
}
