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
  ragReady: false,
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
        const res = await fetch("/api/config")
        if (res.ok) {
          const data = await res.json()
          const cfg = data.config || {}
          setSettings((prev) => ({
            ...prev,
            sandboxEnabled: cfg.sandboxEnabled ?? prev.sandboxEnabled,
            sandboxMode: cfg.sandboxFailMode ?? prev.sandboxMode,
            safeMode: cfg.safeMode ?? prev.safeMode,
            workerEnabled: cfg.workerEnabled ?? prev.workerEnabled,
            maskingEnabled: cfg.maskingEnabled ?? prev.maskingEnabled,
            deepSearch: cfg.deepSearch ?? prev.deepSearch,
          }))
        }
      } catch {
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
    setAssistStep(step)
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
