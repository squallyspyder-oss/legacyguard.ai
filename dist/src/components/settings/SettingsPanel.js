"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SettingsPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
// Default user settings for initial state
const defaultUserSettings = {
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
};
function SettingsPanel({ isOpen, onClose, settings, onUpdateSettings }) {
    const [activeTab, setActiveTab] = (0, react_1.useState)("profile");
    const [userSettings, setUserSettings] = (0, react_1.useState)(defaultUserSettings);
    const [isAuthenticated, setIsAuthenticated] = (0, react_1.useState)(false);
    const [isSaving, setIsSaving] = (0, react_1.useState)(false);
    // Load user settings on mount
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            fetch('/api/user/settings')
                .then(res => res.json())
                .then(data => {
                if (data.settings) {
                    setUserSettings(data.settings);
                    setIsAuthenticated(data.authenticated);
                }
            })
                .catch(console.error);
        }
    }, [isOpen]);
    const updateUserSettings = async (updates) => {
        const newSettings = { ...userSettings, ...updates };
        setUserSettings(newSettings);
        if (isAuthenticated) {
            setIsSaving(true);
            try {
                await fetch('/api/user/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ settings: newSettings })
                });
            }
            catch (error) {
                console.error('Failed to save user settings:', error);
            }
            finally {
                setIsSaving(false);
            }
        }
    };
    if (!isOpen)
        return null;
    const tabs = [
        { id: "profile", label: "Perfil", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.User, { className: "w-4 h-4" }) },
        { id: "security", label: "Seguranca", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-4 h-4" }) },
        { id: "infrastructure", label: "Infra", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Zap, { className: "w-4 h-4" }) },
        { id: "cost", label: "Custos", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.DollarSign, { className: "w-4 h-4" }) },
        { id: "data", label: "Dados", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Settings2, { className: "w-4 h-4" }) },
    ];
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-fade-in", onClick: onClose }), (0, jsx_runtime_1.jsxs)("div", { className: "fixed right-0 top-0 bottom-0 w-full max-w-lg bg-background border-l border-border z-50 animate-slide-in-right overflow-hidden flex flex-col", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { className: "text-lg font-bold", children: "Configuracoes" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Governanca, seguranca e controles" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: onClose, className: "p-2 rounded-lg hover:bg-secondary transition-colors", "aria-label": "Fechar configuracoes", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-5 h-5" }) })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex border-b border-border px-6", children: tabs.map((tab) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => setActiveTab(tab.id), className: `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"}`, children: [tab.icon, (0, jsx_runtime_1.jsx)("span", { className: "hidden sm:inline", children: tab.label })] }, tab.id))) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 overflow-y-auto p-6 space-y-6", children: [activeTab === "profile" && (0, jsx_runtime_1.jsx)(ProfileSettings, { settings: userSettings, onUpdate: updateUserSettings, isAuthenticated: isAuthenticated }), activeTab === "security" && (0, jsx_runtime_1.jsx)(SecuritySettings, { settings: settings, onUpdate: onUpdateSettings }), activeTab === "infrastructure" && (0, jsx_runtime_1.jsx)(InfrastructureSettings, { settings: settings, onUpdate: onUpdateSettings }), activeTab === "cost" && (0, jsx_runtime_1.jsx)(CostSettings, { settings: settings, onUpdate: onUpdateSettings }), activeTab === "data" && (0, jsx_runtime_1.jsx)(DataSettings, { settings: settings, onUpdate: onUpdateSettings })] }), (0, jsx_runtime_1.jsx)("div", { className: "border-t border-border px-6 py-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: isSaving ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" }), (0, jsx_runtime_1.jsx)("span", { children: "Salvando..." })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Info, { className: "w-4 h-4" }), (0, jsx_runtime_1.jsx)("span", { children: "Alteracoes aplicadas automaticamente" })] })) }), (0, jsx_runtime_1.jsx)("button", { onClick: onClose, className: "px-4 py-2 rounded-lg btn-primary text-sm font-medium", "aria-label": "Fechar painel de configuracoes", children: "Concluido" })] }) })] })] }));
}
// ============================================
// PROFILE SETTINGS (User Personal Settings)
// ============================================
function ProfileSettings({ settings, onUpdate, isAuthenticated, }) {
    const themeOptions = [
        { value: 'light', label: 'Claro', icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Sun, { className: "w-4 h-4" }) },
        { value: 'dark', label: 'Escuro', icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Moon, { className: "w-4 h-4" }) },
        { value: 'system', label: 'Sistema', icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Monitor, { className: "w-4 h-4" }) },
    ];
    const agents = [
        { value: 'orchestrate', label: 'Orquestrador' },
        { value: 'advisor', label: 'Conselheiro' },
        { value: 'planner', label: 'Planejador' },
        { value: 'executor', label: 'Executor' },
        { value: 'reviewer', label: 'Revisor' },
    ];
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [!isAuthenticated && ((0, jsx_runtime_1.jsxs)("div", { className: "p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3 mb-2", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Info, { className: "w-5 h-5 text-yellow-500" }), (0, jsx_runtime_1.jsx)("span", { className: "font-semibold text-yellow-500", children: "Nao Autenticado" })] }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Faca login para salvar suas preferencias. Configuracoes atuais sao temporarias." })] })), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Informacoes do Perfil", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden", children: settings.avatarUrl ? ((0, jsx_runtime_1.jsx)("img", { src: settings.avatarUrl, alt: "Avatar", className: "w-full h-full object-cover" })) : ((0, jsx_runtime_1.jsx)(lucide_react_1.User, { className: "w-8 h-8 text-primary" })) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", value: settings.displayName, onChange: (e) => onUpdate({ displayName: e.target.value }), placeholder: "Seu nome", className: "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-muted-foreground mt-1", children: settings.email || 'Email nao disponivel' })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-2 gap-4", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm text-muted-foreground mb-1 block", htmlFor: "settings-timezone", children: "Fuso Horario" }), (0, jsx_runtime_1.jsxs)("select", { id: "settings-timezone", value: settings.timezone, onChange: (e) => onUpdate({ timezone: e.target.value }), className: "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary", children: [(0, jsx_runtime_1.jsx)("option", { value: "America/Sao_Paulo", children: "Sao Paulo (GMT-3)" }), (0, jsx_runtime_1.jsx)("option", { value: "America/New_York", children: "New York (GMT-5)" }), (0, jsx_runtime_1.jsx)("option", { value: "Europe/London", children: "London (GMT+0)" }), (0, jsx_runtime_1.jsx)("option", { value: "Asia/Tokyo", children: "Tokyo (GMT+9)" })] })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm text-muted-foreground mb-1 block", htmlFor: "settings-language", children: "Idioma" }), (0, jsx_runtime_1.jsxs)("select", { id: "settings-language", value: settings.language, onChange: (e) => onUpdate({ language: e.target.value }), className: "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary", children: [(0, jsx_runtime_1.jsx)("option", { value: "pt-BR", children: "Portugues (BR)" }), (0, jsx_runtime_1.jsx)("option", { value: "en-US", children: "English (US)" }), (0, jsx_runtime_1.jsx)("option", { value: "es-ES", children: "Espanol" })] })] })] })] }) }), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Aparencia", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm text-muted-foreground mb-2 block", children: "Tema" }), (0, jsx_runtime_1.jsx)("div", { className: "flex gap-2", children: themeOptions.map((option) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => onUpdate({ theme: option.value }), className: `flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${settings.theme === option.value
                                            ? 'bg-primary/20 border-primary text-primary'
                                            : 'bg-secondary border-border hover:border-primary/50'}`, children: [option.icon, (0, jsx_runtime_1.jsx)("span", { className: "text-sm", children: option.label })] }, option.value))) })] }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Modo Compacto", description: "Reduz espacamento para exibir mais conteudo", checked: settings.compactMode, onChange: (v) => onUpdate({ compactMode: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Mostrar Timestamps", description: "Exibe horario nas mensagens do chat", checked: settings.showTimestamps, onChange: (v) => onUpdate({ showTimestamps: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Sons", description: "Reproduz sons para notificacoes", checked: settings.soundEnabled, onChange: (v) => onUpdate({ soundEnabled: v }) })] }) }), (0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Notificacoes", children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Notificacoes por Email", description: "Receba atualizacoes importantes por email", checked: settings.emailNotifications, onChange: (v) => onUpdate({ emailNotifications: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Notificacoes Desktop", description: "Notificacoes do navegador quando em background", checked: settings.desktopNotifications, onChange: (v) => onUpdate({ desktopNotifications: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Notificar ao Concluir", description: "Avisa quando tarefas longas terminam", checked: settings.notifyOnComplete, onChange: (v) => onUpdate({ notifyOnComplete: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Notificar Erros", description: "Alertas imediatos sobre falhas", checked: settings.notifyOnError, onChange: (v) => onUpdate({ notifyOnError: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Resumo Diario", description: "Receba um resumo diario de atividades", checked: settings.dailyDigest, onChange: (v) => onUpdate({ dailyDigest: v }) })] }), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Preferencias de Agentes", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm text-muted-foreground mb-2 block", htmlFor: "settings-default-agent", children: "Agente Padrao" }), (0, jsx_runtime_1.jsx)("select", { id: "settings-default-agent", value: settings.defaultAgent, onChange: (e) => onUpdate({ defaultAgent: e.target.value }), className: "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary", children: agents.map((agent) => ((0, jsx_runtime_1.jsx)("option", { value: agent.value, children: agent.label }, agent.value))) })] }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Sugestoes de Agentes", description: "Sugere automaticamente o melhor agente", checked: settings.autoSuggestAgents, onChange: (v) => onUpdate({ autoSuggestAgents: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Mostrar Raciocinio", description: "Exibe o processo de pensamento do agente", checked: settings.showAgentThinking, onChange: (v) => onUpdate({ showAgentThinking: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Streaming de Respostas", description: "Mostra respostas em tempo real", checked: settings.streamResponses, onChange: (v) => onUpdate({ streamResponses: v }) })] }) }), (0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Privacidade", children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Compartilhar Analytics", description: "Ajuda a melhorar o produto (anonimo)", checked: settings.shareAnalytics, onChange: (v) => onUpdate({ shareAnalytics: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Salvar Historico", description: "Mantem historico de conversas", checked: settings.saveHistory, onChange: (v) => onUpdate({ saveHistory: v }) }), settings.saveHistory && ((0, jsx_runtime_1.jsx)(SliderRow, { label: "Retencao de Historico", description: "Dias para manter o historico", value: settings.historyRetentionDays, min: 7, max: 365, step: 7, unit: " dias", onChange: (v) => onUpdate({ historyRetentionDays: v }) }))] }), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Atalhos de Teclado", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [(0, jsx_runtime_1.jsx)(ShortcutRow, { label: "Novo Chat", shortcut: settings.shortcuts.newChat }), (0, jsx_runtime_1.jsx)(ShortcutRow, { label: "Alternar Sidebar", shortcut: settings.shortcuts.toggleSidebar }), (0, jsx_runtime_1.jsx)(ShortcutRow, { label: "Abrir Configuracoes", shortcut: settings.shortcuts.openSettings }), (0, jsx_runtime_1.jsx)(ShortcutRow, { label: "Focar Input", shortcut: settings.shortcuts.focusInput })] }) }), (0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Avancado", children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Modo Desenvolvedor", description: "Habilita ferramentas de debug", checked: settings.developerMode, onChange: (v) => onUpdate({ developerMode: v }) }), settings.developerMode && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Logs Detalhados", description: "Exibe logs verbose no console", checked: settings.verboseLogs, onChange: (v) => onUpdate({ verboseLogs: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Recursos Experimentais", description: "Habilita features em beta (instavel)", checked: settings.experimentalFeatures, onChange: (v) => onUpdate({ experimentalFeatures: v }) })] }))] })] }));
}
// ============================================
// SECURITY SETTINGS (Platform)
// ============================================
function SecuritySettings({ settings, onUpdate, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [(0, jsx_runtime_1.jsxs)("div", { className: "p-4 rounded-xl bg-primary/10 border border-primary/30", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3 mb-2", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-5 h-5 text-primary" }), (0, jsx_runtime_1.jsx)("span", { className: "font-semibold text-primary", children: "Modo Seguro Ativo" })] }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Acoes destrutivas estao bloqueadas. Sandbox e revisao obrigatoria estao habilitados." })] }), (0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Execucao Segura", children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Sandbox Isolado", description: "Executa codigo em ambiente containerizado", checked: settings.sandboxEnabled, onChange: (v) => onUpdate({ sandboxEnabled: v }) }), settings.sandboxEnabled && ((0, jsx_runtime_1.jsxs)("div", { className: "ml-6 mt-3", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm text-muted-foreground mb-2 block", children: "Modo de falha" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => onUpdate({ sandboxMode: "fail" }), className: `flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${settings.sandboxMode === "fail"
                                            ? "bg-destructive/20 text-destructive border border-destructive/30"
                                            : "bg-secondary hover:bg-secondary/80"}`, children: "Fail (bloqueia)" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => onUpdate({ sandboxMode: "warn" }), className: `flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${settings.sandboxMode === "warn"
                                            ? "bg-warning/20 text-warning border border-warning/30"
                                            : "bg-secondary hover:bg-secondary/80"}`, children: "Warn (alerta)" })] })] })), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Safe Mode", description: "Bloqueia execucoes destrutivas sem aprovacao", checked: settings.safeMode, onChange: (v) => onUpdate({ safeMode: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Reviewer Obrigatorio", description: "Valida patches antes do executor aplicar", checked: settings.reviewGate, onChange: (v) => onUpdate({ reviewGate: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "Mascaramento de Segredos", description: "Oculta tokens e credenciais nos logs", checked: settings.maskingEnabled, onChange: (v) => onUpdate({ maskingEnabled: v }) })] }), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Boas Praticas", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)(BestPracticeItem, { text: "Exigir citacoes de origem para sugestoes", checked: true }), (0, jsx_runtime_1.jsx)(BestPracticeItem, { text: "Circuit-breaker: limite de passos por orquestracao", checked: true }), (0, jsx_runtime_1.jsx)(BestPracticeItem, { text: "Dry-run antes de qualquer escrita ou deploy", checked: true }), (0, jsx_runtime_1.jsx)(BestPracticeItem, { text: "Bloquear mudancas em pastas criticas sem aprovacao", checked: true })] }) })] }));
}
function InfrastructureSettings({ settings, onUpdate, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [(0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Servicos", children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Worker/Redis", description: "Habilita orquestracao em fila", checked: settings.workerEnabled, onChange: (v) => onUpdate({ workerEnabled: v }) }), (0, jsx_runtime_1.jsx)(ToggleRow, { label: "API Publica", description: "Expoe endpoints com chaves rotacionaveis", checked: settings.apiEnabled, onChange: (v) => onUpdate({ apiEnabled: v }) })] }), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Status", children: (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-2 gap-3", children: [(0, jsx_runtime_1.jsx)(StatusCard, { label: "Worker", status: settings.workerEnabled ? "online" : "offline" }), (0, jsx_runtime_1.jsx)(StatusCard, { label: "Sandbox", status: settings.sandboxEnabled ? "online" : "offline" }), (0, jsx_runtime_1.jsx)(StatusCard, { label: "RAG", status: settings.ragReady ? "online" : "pending" }), (0, jsx_runtime_1.jsx)(StatusCard, { label: "API", status: settings.apiEnabled ? "online" : "offline" })] }) })] }));
}
function CostSettings({ settings, onUpdate, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [(0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Controle de Modelos", children: [(0, jsx_runtime_1.jsx)(ToggleRow, { label: "Pesquisa Profunda", description: "Usa modelos mais robustos (maior custo)", checked: settings.deepSearch, onChange: (v) => onUpdate({ deepSearch: v }) }), (0, jsx_runtime_1.jsx)(SliderRow, { label: "Temperature Cap", value: settings.temperatureCap, onChange: (v) => onUpdate({ temperatureCap: v }), min: 0, max: 1, step: 0.05, display: `${(settings.temperatureCap * 100).toFixed(0)}%` }), (0, jsx_runtime_1.jsx)(SliderRow, { label: "Limite de Tokens", value: settings.tokenCap, onChange: (v) => onUpdate({ tokenCap: v }), min: 2000, max: 24000, step: 1000, display: `${settings.tokenCap.toLocaleString()} tokens` })] }), (0, jsx_runtime_1.jsxs)(SettingsSection, { title: "Orcamento", children: [(0, jsx_runtime_1.jsx)(SliderRow, { label: "Teto Diario", value: settings.billingCap, onChange: (v) => onUpdate({ billingCap: v }), min: 5, max: 100, step: 5, display: `USD ${settings.billingCap}` }), (0, jsx_runtime_1.jsxs)("div", { className: "p-4 rounded-xl bg-secondary border border-border", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between mb-2", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium", children: "Uso hoje" }), (0, jsx_runtime_1.jsxs)("span", { className: "text-sm text-primary font-semibold", children: ["$4.23 / $", settings.billingCap] })] }), (0, jsx_runtime_1.jsx)("progress", { className: "lg-progress", max: settings.billingCap, value: 4.23, "aria-label": "Uso de or\u00E7amento di\u00E1rio" })] })] })] }));
}
function DataSettings({ settings, onUpdate, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [(0, jsx_runtime_1.jsx)(SettingsSection, { title: "RAG & Indexacao", children: (0, jsx_runtime_1.jsxs)("div", { className: "p-4 rounded-xl border border-border", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between mb-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Database, { className: "w-5 h-5 text-primary" }), (0, jsx_runtime_1.jsx)("span", { className: "font-medium", children: "Indice RAG" })] }), (0, jsx_runtime_1.jsx)("span", { className: `badge ${settings.ragReady ? "badge-success" : "badge-warning"}`, children: settings.ragReady ? "Indexado" : "Pendente" })] }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground mb-4", children: "O RAG precisa estar indexado para respostas com contexto de repositorio." }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsx)("button", { className: "flex-1 px-4 py-2 rounded-lg btn-secondary text-sm font-medium", children: "Reindexar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => onUpdate({ ragReady: !settings.ragReady }), className: "flex-1 px-4 py-2 rounded-lg btn-primary text-sm font-medium", children: settings.ragReady ? "Desmarcar" : "Marcar pronto" })] })] }) }), (0, jsx_runtime_1.jsx)(SettingsSection, { title: "Fontes Externas", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2 text-sm text-muted-foreground", children: [(0, jsx_runtime_1.jsx)("p", { children: "\u2022 Confluence - Desabilitado" }), (0, jsx_runtime_1.jsx)("p", { children: "\u2022 Jira - Desabilitado" }), (0, jsx_runtime_1.jsx)("p", { children: "\u2022 GitHub PRs - Habilitado" })] }) })] }));
}
function SettingsSection({ title, children }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)("h3", { className: "text-sm font-semibold text-muted-foreground uppercase tracking-wider", children: title }), (0, jsx_runtime_1.jsx)("div", { className: "space-y-3", children: children })] }));
}
function ToggleRow({ label, description, checked, onChange, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex-1", children: [(0, jsx_runtime_1.jsx)("p", { className: "font-medium", children: label }), description && (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground mt-0.5", children: description })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => onChange(!checked), className: `relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`, "aria-label": label, children: (0, jsx_runtime_1.jsx)("span", { className: `absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}` }) })] }));
}
function SliderRow({ label, description, value, onChange, min, max, step, display, unit, }) {
    const displayValue = display || `${value}${unit || ''}`;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "p-4 rounded-xl bg-secondary/50 border border-border", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between mb-2", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("span", { className: "font-medium", children: label }), description && (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground mt-0.5", children: description })] }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-primary font-semibold", children: displayValue })] }), (0, jsx_runtime_1.jsx)("input", { type: "range", min: min, max: max, step: step, value: value, onChange: (e) => onChange(Number(e.target.value)), className: "w-full accent-primary", "aria-label": label })] }));
}
function ShortcutRow({ label, shortcut }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm", children: label }), (0, jsx_runtime_1.jsx)("kbd", { className: "px-2 py-1 rounded bg-muted text-xs font-mono text-muted-foreground border border-border", children: shortcut })] }));
}
function StatusCard({ label, status }) {
    const colors = {
        online: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
        offline: "text-red-400 bg-red-500/10 border-red-500/30",
        pending: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: `p-3 rounded-xl border ${colors[status]}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("span", { className: `status-dot ${status === "online" ? "status-online" : status === "offline" ? "status-offline" : "status-warning"}` }), (0, jsx_runtime_1.jsx)("span", { className: "font-medium", children: label })] }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs mt-1 opacity-80 capitalize", children: status })] }));
}
function BestPracticeItem({ text, checked }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-sm", children: [checked ? ((0, jsx_runtime_1.jsx)(lucide_react_1.Check, { className: "w-4 h-4 text-primary shrink-0" })) : ((0, jsx_runtime_1.jsx)("div", { className: "w-4 h-4 rounded-full border border-muted-foreground shrink-0" })), (0, jsx_runtime_1.jsx)("span", { className: checked ? "text-foreground" : "text-muted-foreground", children: text })] }));
}
