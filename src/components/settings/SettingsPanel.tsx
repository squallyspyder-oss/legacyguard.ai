"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { X, Shield, Zap, DollarSign, Info, Check, User, Bell, Keyboard, Settings2, Moon, Sun, Monitor } from "lucide-react"
import type { AppSettings } from "../layout/MainLayout"
import type { UserSettings } from "../../app/api/user/settings/route"

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdateSettings: (updates: Partial<AppSettings>) => void
}

type SettingsTab = "profile" | "security" | "infrastructure" | "cost" | "data"

// Default user settings for initial state
const defaultUserSettings: UserSettings = {
  displayName: '',
  email: '',
  avatarUrl: undefined,
  timezone: 'America/Sao_Paulo',
  language: 'pt-BR',
  theme: 'dark',
  compactMode: false,
  showTimestamps: true,
  soundEnabled: false,
  emailNotifications: true,
  desktopNotifications: true,
  notifyOnComplete: true,
  notifyOnError: true,
  dailyDigest: false,
  defaultAgent: 'orchestrate',
  autoSuggestAgents: true,
  showAgentThinking: true,
  streamResponses: true,
  shareAnalytics: false,
  saveHistory: true,
  historyRetentionDays: 30,
  shortcuts: {
    newChat: 'Ctrl+N',
    toggleSidebar: 'Ctrl+B',
    openSettings: 'Ctrl+,',
    focusInput: '/',
  },
  developerMode: false,
  verboseLogs: false,
  experimentalFeatures: false,
}

export default function SettingsPanel({ isOpen, onClose, settings, onUpdateSettings }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile")
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load user settings on mount
  useEffect(() => {
    if (isOpen) {
      fetch('/api/user/settings')
        .then(res => res.json())
        .then(data => {
          if (data.settings) {
            setUserSettings(data.settings)
            setIsAuthenticated(data.authenticated)
          }
        })
        .catch(console.error)
    }
  }, [isOpen])

  const updateUserSettings = async (updates: Partial<UserSettings>) => {
    const newSettings = { ...userSettings, ...updates }
    setUserSettings(newSettings)
    
    if (isAuthenticated) {
      setIsSaving(true)
      try {
        await fetch('/api/user/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: newSettings })
        })
      } catch (error) {
        console.error('Failed to save user settings:', error)
      } finally {
        setIsSaving(false)
      }
    }
  }

  if (!isOpen) return null

  const tabs = [
    { id: "profile" as const, label: "Perfil", icon: <User className="w-4 h-4" /> },
    { id: "security" as const, label: "Seguranca", icon: <Shield className="w-4 h-4" /> },
    { id: "infrastructure" as const, label: "Infra", icon: <Zap className="w-4 h-4" /> },
    { id: "cost" as const, label: "Custos", icon: <DollarSign className="w-4 h-4" /> },
    { id: "data" as const, label: "Dados", icon: <Settings2 className="w-4 h-4" /> },
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-background border-l border-border z-50 animate-slide-in-right overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold">Configuracoes</h2>
            <p className="text-sm text-muted-foreground">Governanca, seguranca e controles</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors" aria-label="Fechar configuracoes">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "profile" && <ProfileSettings settings={userSettings} onUpdate={updateUserSettings} isAuthenticated={isAuthenticated} />}
          {activeTab === "security" && <SecuritySettings settings={settings} onUpdate={onUpdateSettings} />}
          {activeTab === "infrastructure" && <InfrastructureSettings settings={settings} onUpdate={onUpdateSettings} />}
          {activeTab === "cost" && <CostSettings settings={settings} onUpdate={onUpdateSettings} />}
          {activeTab === "data" && <DataSettings settings={settings} onUpdate={onUpdateSettings} />}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Info className="w-4 h-4" />
                  <span>Alteracoes aplicadas automaticamente</span>
                </>
              )}
            </div>
            <button onClick={onClose} className="px-4 py-2 rounded-lg btn-primary text-sm font-medium" aria-label="Fechar painel de configuracoes">
              Concluido
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================
// PROFILE SETTINGS (User Personal Settings)
// ============================================

function ProfileSettings({
  settings,
  onUpdate,
  isAuthenticated,
}: {
  settings: UserSettings
  onUpdate: (updates: Partial<UserSettings>) => void
  isAuthenticated: boolean
}) {
  const themeOptions = [
    { value: 'light', label: 'Claro', icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: 'Escuro', icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: 'Sistema', icon: <Monitor className="w-4 h-4" /> },
  ]

  const agents = [
    { value: 'orchestrate', label: 'Orquestrador' },
    { value: 'advisor', label: 'Conselheiro' },
    { value: 'planner', label: 'Planejador' },
    { value: 'executor', label: 'Executor' },
    { value: 'reviewer', label: 'Revisor' },
  ]

  return (
    <div className="space-y-6">
      {/* Authentication Warning */}
      {!isAuthenticated && (
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-center gap-3 mb-2">
            <Info className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-yellow-500">Nao Autenticado</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Faca login para salvar suas preferencias. Configuracoes atuais sao temporarias.
          </p>
        </div>
      )}

      {/* Profile Info */}
      <SettingsSection title="Informacoes do Perfil">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {settings.avatarUrl ? (
                <img src={settings.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={settings.displayName}
                onChange={(e) => onUpdate({ displayName: e.target.value })}
                placeholder="Seu nome"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">{settings.email || 'Email nao disponivel'}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block" htmlFor="settings-timezone">Fuso Horario</label>
              <select
                id="settings-timezone"
                value={settings.timezone}
                onChange={(e) => onUpdate({ timezone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="America/Sao_Paulo">Sao Paulo (GMT-3)</option>
                <option value="America/New_York">New York (GMT-5)</option>
                <option value="Europe/London">London (GMT+0)</option>
                <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block" htmlFor="settings-language">Idioma</label>
              <select
                id="settings-language"
                value={settings.language}
                onChange={(e) => onUpdate({ language: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="pt-BR">Portugues (BR)</option>
                <option value="en-US">English (US)</option>
                <option value="es-ES">Espanol</option>
              </select>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Theme */}
      <SettingsSection title="Aparencia">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Tema</label>
            <div className="flex gap-2">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onUpdate({ theme: option.value as 'light' | 'dark' | 'system' })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                    settings.theme === option.value
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-secondary border-border hover:border-primary/50'
                  }`}
                >
                  {option.icon}
                  <span className="text-sm">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <ToggleRow
            label="Modo Compacto"
            description="Reduz espacamento para exibir mais conteudo"
            checked={settings.compactMode}
            onChange={(v) => onUpdate({ compactMode: v })}
          />
          <ToggleRow
            label="Mostrar Timestamps"
            description="Exibe horario nas mensagens do chat"
            checked={settings.showTimestamps}
            onChange={(v) => onUpdate({ showTimestamps: v })}
          />
          <ToggleRow
            label="Sons"
            description="Reproduz sons para notificacoes"
            checked={settings.soundEnabled}
            onChange={(v) => onUpdate({ soundEnabled: v })}
          />
        </div>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notificacoes">
        <ToggleRow
          label="Notificacoes por Email"
          description="Receba atualizacoes importantes por email"
          checked={settings.emailNotifications}
          onChange={(v) => onUpdate({ emailNotifications: v })}
        />
        <ToggleRow
          label="Notificacoes Desktop"
          description="Notificacoes do navegador quando em background"
          checked={settings.desktopNotifications}
          onChange={(v) => onUpdate({ desktopNotifications: v })}
        />
        <ToggleRow
          label="Notificar ao Concluir"
          description="Avisa quando tarefas longas terminam"
          checked={settings.notifyOnComplete}
          onChange={(v) => onUpdate({ notifyOnComplete: v })}
        />
        <ToggleRow
          label="Notificar Erros"
          description="Alertas imediatos sobre falhas"
          checked={settings.notifyOnError}
          onChange={(v) => onUpdate({ notifyOnError: v })}
        />
        <ToggleRow
          label="Resumo Diario"
          description="Receba um resumo diario de atividades"
          checked={settings.dailyDigest}
          onChange={(v) => onUpdate({ dailyDigest: v })}
        />
      </SettingsSection>

      {/* Agent Preferences */}
      <SettingsSection title="Preferencias de Agentes">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block" htmlFor="settings-default-agent">Agente Padrao</label>
            <select
              id="settings-default-agent"
              value={settings.defaultAgent}
              onChange={(e) => onUpdate({ defaultAgent: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {agents.map((agent) => (
                <option key={agent.value} value={agent.value}>{agent.label}</option>
              ))}
            </select>
          </div>
          
          <ToggleRow
            label="Sugestoes de Agentes"
            description="Sugere automaticamente o melhor agente"
            checked={settings.autoSuggestAgents}
            onChange={(v) => onUpdate({ autoSuggestAgents: v })}
          />
          <ToggleRow
            label="Mostrar Raciocinio"
            description="Exibe o processo de pensamento do agente"
            checked={settings.showAgentThinking}
            onChange={(v) => onUpdate({ showAgentThinking: v })}
          />
          <ToggleRow
            label="Streaming de Respostas"
            description="Mostra respostas em tempo real"
            checked={settings.streamResponses}
            onChange={(v) => onUpdate({ streamResponses: v })}
          />
        </div>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection title="Privacidade">
        <ToggleRow
          label="Compartilhar Analytics"
          description="Ajuda a melhorar o produto (anonimo)"
          checked={settings.shareAnalytics}
          onChange={(v) => onUpdate({ shareAnalytics: v })}
        />
        <ToggleRow
          label="Salvar Historico"
          description="Mantem historico de conversas"
          checked={settings.saveHistory}
          onChange={(v) => onUpdate({ saveHistory: v })}
        />
        {settings.saveHistory && (
          <SliderRow
            label="Retencao de Historico"
            description="Dias para manter o historico"
            value={settings.historyRetentionDays}
            min={7}
            max={365}
            step={7}
            unit=" dias"
            onChange={(v) => onUpdate({ historyRetentionDays: v })}
          />
        )}
      </SettingsSection>

      {/* Shortcuts */}
      <SettingsSection title="Atalhos de Teclado">
        <div className="space-y-3">
          <ShortcutRow label="Novo Chat" shortcut={settings.shortcuts.newChat} />
          <ShortcutRow label="Alternar Sidebar" shortcut={settings.shortcuts.toggleSidebar} />
          <ShortcutRow label="Abrir Configuracoes" shortcut={settings.shortcuts.openSettings} />
          <ShortcutRow label="Focar Input" shortcut={settings.shortcuts.focusInput} />
        </div>
      </SettingsSection>

      {/* Advanced */}
      <SettingsSection title="Avancado">
        <ToggleRow
          label="Modo Desenvolvedor"
          description="Habilita ferramentas de debug"
          checked={settings.developerMode}
          onChange={(v) => onUpdate({ developerMode: v })}
        />
        {settings.developerMode && (
          <>
            <ToggleRow
              label="Logs Detalhados"
              description="Exibe logs verbose no console"
              checked={settings.verboseLogs}
              onChange={(v) => onUpdate({ verboseLogs: v })}
            />
            <ToggleRow
              label="Recursos Experimentais"
              description="Habilita features em beta (instavel)"
              checked={settings.experimentalFeatures}
              onChange={(v) => onUpdate({ experimentalFeatures: v })}
            />
          </>
        )}
      </SettingsSection>
    </div>
  )
}

// ============================================
// SECURITY SETTINGS (Platform)
// ============================================

function SecuritySettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (updates: Partial<AppSettings>) => void
}) {
  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-semibold text-primary">Modo Seguro Ativo</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Acoes destrutivas estao bloqueadas. Sandbox e revisao obrigatoria estao habilitados.
        </p>
      </div>

      <SettingsSection title="Execucao Segura">
        <ToggleRow
          label="Sandbox Isolado"
          description="Executa codigo em ambiente containerizado"
          checked={settings.sandboxEnabled}
          onChange={(v) => onUpdate({ sandboxEnabled: v })}
        />
        {settings.sandboxEnabled && (
          <div className="ml-6 mt-3">
            <label className="text-sm text-muted-foreground mb-2 block">Modo de falha</label>
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate({ sandboxMode: "fail" })}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settings.sandboxMode === "fail"
                    ? "bg-destructive/20 text-destructive border border-destructive/30"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                Fail (bloqueia)
              </button>
              <button
                onClick={() => onUpdate({ sandboxMode: "warn" })}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settings.sandboxMode === "warn"
                    ? "bg-warning/20 text-warning border border-warning/30"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                Warn (alerta)
              </button>
            </div>
          </div>
        )}

        <ToggleRow
          label="Safe Mode"
          description="Bloqueia execucoes destrutivas sem aprovacao"
          checked={settings.safeMode}
          onChange={(v) => onUpdate({ safeMode: v })}
        />

        <ToggleRow
          label="Reviewer Obrigatorio"
          description="Valida patches antes do executor aplicar"
          checked={settings.reviewGate}
          onChange={(v) => onUpdate({ reviewGate: v })}
        />

        <ToggleRow
          label="Mascaramento de Segredos"
          description="Oculta tokens e credenciais nos logs"
          checked={settings.maskingEnabled}
          onChange={(v) => onUpdate({ maskingEnabled: v })}
        />
      </SettingsSection>

      <SettingsSection title="Boas Praticas">
        <div className="space-y-2">
          <BestPracticeItem text="Exigir citacoes de origem para sugestoes" checked />
          <BestPracticeItem text="Circuit-breaker: limite de passos por orquestracao" checked />
          <BestPracticeItem text="Dry-run antes de qualquer escrita ou deploy" checked />
          <BestPracticeItem text="Bloquear mudancas em pastas criticas sem aprovacao" checked />
        </div>
      </SettingsSection>
    </div>
  )
}

function InfrastructureSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (updates: Partial<AppSettings>) => void
}) {
  return (
    <div className="space-y-6">
      <SettingsSection title="Servicos">
        <ToggleRow
          label="Worker/Redis"
          description="Habilita orquestracao em fila"
          checked={settings.workerEnabled}
          onChange={(v) => onUpdate({ workerEnabled: v })}
        />

        <ToggleRow
          label="API Publica"
          description="Expoe endpoints com chaves rotacionaveis"
          checked={settings.apiEnabled}
          onChange={(v) => onUpdate({ apiEnabled: v })}
        />
      </SettingsSection>

      <SettingsSection title="Status">
        <div className="grid grid-cols-2 gap-3">
          <StatusCard label="Worker" status={settings.workerEnabled ? "online" : "offline"} />
          <StatusCard label="Sandbox" status={settings.sandboxEnabled ? "online" : "offline"} />
          <StatusCard label="RAG" status={settings.ragReady ? "online" : "pending"} />
          <StatusCard label="API" status={settings.apiEnabled ? "online" : "offline"} />
        </div>
      </SettingsSection>
    </div>
  )
}

function CostSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (updates: Partial<AppSettings>) => void
}) {
  return (
    <div className="space-y-6">
      <SettingsSection title="Controle de Modelos">
        <ToggleRow
          label="Pesquisa Profunda"
          description="Usa modelos mais robustos (maior custo)"
          checked={settings.deepSearch}
          onChange={(v) => onUpdate({ deepSearch: v })}
        />

        <SliderRow
          label="Temperature Cap"
          value={settings.temperatureCap}
          onChange={(v) => onUpdate({ temperatureCap: v })}
          min={0}
          max={1}
          step={0.05}
          display={`${(settings.temperatureCap * 100).toFixed(0)}%`}
        />

        <SliderRow
          label="Limite de Tokens"
          value={settings.tokenCap}
          onChange={(v) => onUpdate({ tokenCap: v })}
          min={2000}
          max={24000}
          step={1000}
          display={`${settings.tokenCap.toLocaleString()} tokens`}
        />
      </SettingsSection>

      <SettingsSection title="Orcamento">
        <SliderRow
          label="Teto Diario"
          value={settings.billingCap}
          onChange={(v) => onUpdate({ billingCap: v })}
          min={5}
          max={100}
          step={5}
          display={`USD ${settings.billingCap}`}
        />

        <div className="p-4 rounded-xl bg-secondary border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Uso hoje</span>
            <span className="text-sm text-primary font-semibold">$4.23 / ${settings.billingCap}</span>
          </div>
          <progress
            className="lg-progress"
            max={settings.billingCap}
            value={4.23}
            aria-label="Uso de orçamento diário"
          />
        </div>
      </SettingsSection>
    </div>
  )
}

function DataSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (updates: Partial<AppSettings>) => void
}) {
  return (
    <div className="space-y-6">
      <SettingsSection title="RAG & Indexacao">
        <div className="p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <span className="font-medium">Indice RAG</span>
            </div>
            <span className={`badge ${settings.ragReady ? "badge-success" : "badge-warning"}`}>
              {settings.ragReady ? "Indexado" : "Pendente"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            O RAG precisa estar indexado para respostas com contexto de repositorio.
          </p>
          <div className="flex gap-2">
            <button className="flex-1 px-4 py-2 rounded-lg btn-secondary text-sm font-medium">Reindexar</button>
            <button
              onClick={() => onUpdate({ ragReady: !settings.ragReady })}
              className="flex-1 px-4 py-2 rounded-lg btn-primary text-sm font-medium"
            >
              {settings.ragReady ? "Desmarcar" : "Marcar pronto"}
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Fontes Externas">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>• Confluence - Desabilitado</p>
          <p>• Jira - Desabilitado</p>
          <p>• GitHub PRs - Habilitado</p>
        </div>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
        aria-label={label}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  )
}

function SliderRow({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  display,
  unit,
}: {
  label: string
  description?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  display?: string
  unit?: string
}) {
  const displayValue = display || `${value}${unit || ''}`
  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-medium">{label}</span>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <span className="text-sm text-primary font-semibold">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </div>
  )
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
      <span className="text-sm">{label}</span>
      <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono text-muted-foreground border border-border">
        {shortcut}
      </kbd>
    </div>
  )
}

function StatusCard({ label, status }: { label: string; status: "online" | "offline" | "pending" }) {
  const colors = {
    online: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    offline: "text-red-400 bg-red-500/10 border-red-500/30",
    pending: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  }

  return (
    <div className={`p-3 rounded-xl border ${colors[status]}`}>
      <div className="flex items-center gap-2">
        <span
          className={`status-dot ${status === "online" ? "status-online" : status === "offline" ? "status-offline" : "status-warning"}`}
        />
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-xs mt-1 opacity-80 capitalize">{status}</p>
    </div>
  )
}

function BestPracticeItem({ text, checked }: { text: string; checked?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {checked ? (
        <Check className="w-4 h-4 text-primary shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border border-muted-foreground shrink-0" />
      )}
      <span className={checked ? "text-foreground" : "text-muted-foreground"}>{text}</span>
    </div>
  )
}
