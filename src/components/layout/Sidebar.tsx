"use client"

import type React from "react"
import { useState } from "react"
import { signIn, signOut } from "next-auth/react"
import type { Session } from "next-auth"
import {
  History,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  LogIn,
  Search,
  Sparkles,
  Zap,
  HelpCircle,
  MoreHorizontal,
  GitBranch,
  FolderOpen,
} from "lucide-react"
import type { AppSettings, SessionItem } from "./MainLayout"
import ImportRepoModal from "../repo/ImportRepoModal"
import AuthModal from "../auth/AuthModal"

interface SidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  isMobile: boolean
  onToggle: () => void
  onClose: () => void
  session: Session | null
  sessions: SessionItem[]
  sessionsLoading: boolean
  activeSessionId: string | null
  onSelectSession: (session: SessionItem) => void
  onNewChat: () => void
  onOpenSettings: () => void
  onStartTour: () => void
  settings: AppSettings
  onQuickAction?: (action: string) => void
}

export default function Sidebar({
  isOpen,
  isCollapsed,
  isMobile,
  onToggle,
  onClose,
  session,
  sessions,
  sessionsLoading,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenSettings,
  onStartTour,
  settings,
  onQuickAction,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tag.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const riskColor = (risk: SessionItem["risk"]) => {
    if (risk === "alto") return "text-red-400"
    if (risk === "medio") return "text-amber-400"
    return "text-emerald-400"
  }

  const riskBg = (risk: SessionItem["risk"]) => {
    if (risk === "alto") return "bg-red-500/10 border-red-500/30"
    if (risk === "medio") return "bg-amber-500/10 border-amber-500/30"
    return "bg-emerald-500/10 border-emerald-500/30"
  }

  // Calculate safety score based on settings
  const safetyScore = [
    settings.sandboxEnabled,
    settings.safeMode,
    settings.reviewGate,
    settings.maskingEnabled,
    settings.workerEnabled,
  ].filter(Boolean).length

  const expanded = isMobile ? isOpen : !isCollapsed

  if (isMobile && !isOpen) return null

  return (
    <aside
      className={`
        ${isMobile ? "fixed inset-y-0 left-0 z-50 w-80" : "relative"}
        ${!isMobile && isCollapsed ? "w-17" : "w-72"}
        flex flex-col bg-sidebar border-r border-sidebar-border
        transition-all duration-300 ease-in-out
        ${isMobile ? "animate-slide-in-left" : ""}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {expanded ? (
          <>
            <div className="flex items-center gap-3">
              <Logo className="h-8 w-8 shrink-0 animate-logo-glow" />
              <div className="min-w-0">
                <h1 className="font-bold text-base tracking-tight">LegacyGuard</h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Security Platform</p>
              </div>
            </div>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
              title="Recolher sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="mx-auto p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
            title="Expandir sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
            bg-primary/10 border border-primary/30 text-primary
            hover:bg-primary/20 hover:border-primary/50
            transition-all duration-200 group
            ${!expanded && "justify-center px-2"}
          `}
        >
          <Plus className="w-5 h-5 shrink-0 group-hover:rotate-90 transition-transform duration-200" />
          {expanded && <span className="text-sm font-semibold">Nova conversa</span>}
        </button>
      </div>

      {/* Search */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-sidebar-accent/50 border border-sidebar-border
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                       transition-all duration-200"
            />
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Import Repo Button */}
          <button
            onClick={() => setShowImportModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                     bg-secondary/50 border border-border text-muted-foreground
                     hover:bg-secondary hover:text-foreground hover:border-primary/30
                     transition-all duration-200 group"
          >
            <GitBranch className="w-4 h-4 group-hover:text-primary transition-colors" />
            <span className="text-sm font-medium">Importar Repositório</span>
          </button>
          
          {/* Quick Mode Buttons */}
          <div className="grid grid-cols-3 gap-1.5">
            <QuickActionButton 
              icon={<Sparkles className="w-3.5 h-3.5" />} 
              label="Assist" 
              onClick={() => onQuickAction?.("legacyAssist")}
            />
            <QuickActionButton 
              icon={<Zap className="w-3.5 h-3.5" />} 
              label="Orquest." 
              onClick={() => onQuickAction?.("orchestrate")}
            />
            <QuickActionButton 
              icon={<Shield className="w-3.5 h-3.5" />} 
              label="Chat" 
              onClick={() => onQuickAction?.("chat")}
            />
          </div>
        </div>
      )}

      {/* History */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className={`flex items-center gap-2 px-2 py-2 ${!expanded && "justify-center"}`}>
          <History className="w-4 h-4 text-muted-foreground" />
          {expanded && (
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Historico</span>
          )}
        </div>

        {sessionsLoading ? (
          <div className="space-y-2 px-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg skeleton" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          expanded && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {searchQuery ? "Nenhum resultado encontrado" : "Nenhuma conversa ainda"}
            </p>
          )
        ) : (
          <div className="space-y-1">
            {filteredSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectSession(s)}
                onMouseEnter={() => setHoveredSession(s.id)}
                onMouseLeave={() => setHoveredSession(null)}
                className={`
                  w-full text-left px-3 py-2.5 rounded-lg
                  transition-all duration-200 group relative
                  ${activeSessionId === s.id ? "bg-sidebar-accent border border-sidebar-border" : "hover:bg-sidebar-accent/50"}
                  ${!expanded && "justify-center px-2"}
                `}
              >
                {expanded ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate flex-1">{s.title}</p>
                      {hoveredSession === s.id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                          className="p-1 rounded hover:bg-background/50 transition-colors"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      ) : (
                        <span className={`w-2 h-2 rounded-full ${riskColor(s.risk)} mt-1.5`} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${riskBg(s.risk)} ${riskColor(s.risk)}`}
                      >
                        {s.tag}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{s.recency}</span>
                    </div>
                  </>
                ) : (
                  <div className={`w-2 h-2 rounded-full mx-auto ${riskColor(s.risk)}`} title={s.title} />
                )}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Safety Status */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="p-3 rounded-xl bg-sidebar-accent/50 border border-sidebar-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">Nivel de seguranca</span>
              <span
                className={`text-xs font-bold ${safetyScore >= 4 ? "text-emerald-400" : safetyScore >= 2 ? "text-amber-400" : "text-red-400"}`}
              >
                {safetyScore}/5
              </span>
            </div>
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < safetyScore ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {settings.sandboxEnabled && <StatusBadge label="Sandbox" active />}
              {settings.safeMode && <StatusBadge label="Safe" active />}
              {settings.reviewGate && <StatusBadge label="Review" active />}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <NavItem
          icon={<Settings className="w-4 h-4" />}
          label="Configuracoes"
          expanded={expanded}
          onClick={onOpenSettings}
        />
        <NavItem
          icon={<HelpCircle className="w-4 h-4" />}
          label="Ajuda & Tour"
          expanded={expanded}
          onClick={onStartTour}
        />

        {/* User */}
        <div className="pt-2 mt-2 border-t border-sidebar-border">
          {session?.user ? (
            <button
              onClick={() => signOut()}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                hover:bg-sidebar-accent transition-colors
                ${!expanded && "justify-center px-2"}
              `}
            >
              {session.user.image ? (
                <img
                  src={session.user.image || "/placeholder.svg"}
                  alt=""
                  className="w-8 h-8 rounded-full shrink-0 ring-2 ring-primary/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">{session.user.name?.charAt(0) || "U"}</span>
                </div>
              )}
              {expanded && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{session.user.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{session.user.email}</p>
                  </div>
                  <LogOut className="w-4 h-4 text-muted-foreground" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                bg-secondary hover:bg-secondary/80 transition-colors
                ${!expanded && "justify-center px-2"}
              `}
            >
              <LogIn className="w-4 h-4 shrink-0" />
              {expanded && <span className="text-sm font-medium">Entrar / Cadastrar</span>}
            </button>
          )}
        </div>
      </div>

      {/* Import Repo Modal */}
      <ImportRepoModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(repoInfo) => {
          console.log("Repo imported:", repoInfo)
          // TODO: Update app state with imported repo
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </aside>
  )
}

function NavItem({
  icon,
  label,
  expanded,
  onClick,
  active,
  badge,
}: {
  icon: React.ReactNode
  label: string
  expanded: boolean
  onClick?: () => void
  active?: boolean
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        transition-all duration-200
        ${active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"}
        ${!expanded && "justify-center px-2"}
      `}
    >
      <span className="shrink-0">{icon}</span>
      {expanded && (
        <>
          <span className="text-sm flex-1 text-left">{label}</span>
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">{badge}</span>
          )}
        </>
      )}
    </button>
  )
}

function QuickActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-2 rounded-lg
                 bg-sidebar-accent/30 hover:bg-sidebar-accent border border-transparent hover:border-sidebar-border
                 transition-all duration-200 group"
    >
      <span className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</span>
      <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </button>
  )
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${
        active ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"
      }`}
    >
      {label}
    </span>
  )
}

function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="oklch(0.72 0.17 165)" />
          <stop offset="100%" stopColor="oklch(0.68 0.15 200)" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        fill="url(#logo-gradient)"
        fillOpacity="0.15"
        stroke="url(#logo-gradient)"
        strokeWidth="1.5"
      />
      <path
        d="M10 16L14 20L22 12"
        stroke="url(#logo-gradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="16"
        cy="16"
        r="10"
        stroke="url(#logo-gradient)"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeDasharray="4 4"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 16 16"
          to="360 16 16"
          dur="20s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}
