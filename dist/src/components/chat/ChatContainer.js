"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChatContainer;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const WelcomeScreen_1 = __importDefault(require("./WelcomeScreen"));
const MessageList_1 = __importDefault(require("./MessageList"));
const ChatInput_1 = __importDefault(require("./ChatInput"));
const FloatingSuggestions_1 = __importDefault(require("./FloatingSuggestions"));
const AgentSelector_1 = require("../AgentSelector");
const lucide_react_1 = require("lucide-react");
function ChatContainer({ session, settings, isMobile, sidebarCollapsed, onToggleSidebar, onOpenSettings, assistActive, onAssistToggle, onAssistAction, quickAgentRole, quickPrompt, onQuickActionConsumed, }) {
    var _a;
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [input, setInput] = (0, react_1.useState)("");
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [agentRole, setAgentRole] = (0, react_1.useState)(AgentSelector_1.AGENT_ROLES[0].key);
    const [uploadedFiles, setUploadedFiles] = (0, react_1.useState)([]);
    const [showSuggestions, setShowSuggestions] = (0, react_1.useState)(false);
    const messagesEndRef = (0, react_1.useRef)(null);
    const hasMessages = messages.length > 0;
    // Smart Agent Router - detecta intenção e sugere/seleciona agente
    const routeToAgent = (0, react_1.useCallback)((message) => {
        const t = message.toLowerCase();
        // Incidentes/erros -> orquestrar com Twin Builder
        if (/incidente|erro|bug|falha|crash|exception|stacktrace/.test(t))
            return 'orchestrate';
        // Ações de código -> operador ou orquestrador
        if (/patch|fix|corrigir|refatorar|aplicar|criar pr|pull request|branch/.test(t))
            return 'orchestrate';
        // Deploy/merge -> executor (via orquestrador)
        if (/deploy|merge|publicar|release/.test(t))
            return 'orchestrate';
        // Revisão/compliance -> reviewer
        if (/revisar|review|compliance|gdpr|soc2|segurança|vulnerabilidade/.test(t))
            return 'reviewer';
        // Análise simples -> advisor
        if (/analisar|analise|explicar|entender|como funciona/.test(t))
            return 'advisor';
        // Default -> chat
        return 'chat';
    }, []);
    // Effect para processar quick actions da sidebar
    (0, react_1.useEffect)(() => {
        if (quickAgentRole) {
            setAgentRole(quickAgentRole);
            if (quickPrompt) {
                setInput(quickPrompt);
            }
            onQuickActionConsumed === null || onQuickActionConsumed === void 0 ? void 0 : onQuickActionConsumed();
        }
    }, [quickAgentRole, quickPrompt, onQuickActionConsumed]);
    // Compute inline suggestions based on input
    const suggestions = (0, react_1.useMemo)(() => {
        if (!input.trim() || input.length < 3)
            return [];
        const t = input.toLowerCase();
        const list = [];
        if (t.includes("incidente") || t.includes("erro") || t.includes("falha")) {
            list.push("Acionar Twin Builder para reproduzir o incidente");
            list.push("Analisar logs e stacktrace do erro");
        }
        if (t.includes("sandbox") || t.includes("test")) {
            list.push("Executar em sandbox isolado antes de aplicar");
        }
        if (t.includes("refator") || t.includes("legacy")) {
            list.push("Analisar complexidade ciclomatica do codigo");
            list.push("Sugerir padroes de modernizacao");
        }
        if (t.includes("segur") || t.includes("vuln")) {
            list.push("Executar scan de vulnerabilidades");
            list.push("Verificar compliance GDPR/SOC2");
        }
        if (t.includes("deploy") || t.includes("merge")) {
            list.push("Revisar changeset antes do merge");
            list.push("Executar testes de regressao");
        }
        if (list.length === 0 && input.length > 10) {
            list.push("Pesquisar no contexto RAG");
            list.push("Consultar documentacao");
        }
        return list.slice(0, 4);
    }, [input]);
    (0, react_1.useEffect)(() => {
        setShowSuggestions(suggestions.length > 0 && !isLoading);
    }, [suggestions, isLoading]);
    const scrollToBottom = (0, react_1.useCallback)(() => {
        var _a;
        (_a = messagesEndRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: "smooth" });
    }, []);
    (0, react_1.useEffect)(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);
    // Activate LegacyAssist when selected
    (0, react_1.useEffect)(() => {
        if (agentRole === "legacyAssist") {
            onAssistToggle(true);
        }
        else {
            onAssistToggle(false);
        }
    }, [agentRole, onAssistToggle]);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLoading || (!input.trim() && uploadedFiles.length === 0))
            return;
        const userText = input.trim() || "Analise os arquivos enviados.";
        // Smart routing: se estiver no chat e detectar ação complexa, sugerir mudança
        const suggestedAgent = routeToAgent(userText);
        const shouldSuggestSwitch = agentRole === 'chat' && suggestedAgent !== 'chat';
        const userMessage = {
            id: `msg-${Date.now()}`,
            role: "user",
            content: userText + (uploadedFiles.length > 0 ? `\n\n📎 ${uploadedFiles.map((f) => f.name).join(", ")}` : ""),
            timestamp: new Date(),
            agentRole,
        };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setShowSuggestions(false);
        setIsLoading(true);
        try {
            // LegacyAssist mode - guided flow (local processing)
            if (agentRole === "legacyAssist") {
                const roleInfo = AgentSelector_1.AGENT_ROLES.find((r) => r.key === agentRole);
                const assistantMessage = {
                    id: `msg-${Date.now() + 1}`,
                    role: "assistant",
                    content: buildResponse(userText, agentRole, (roleInfo === null || roleInfo === void 0 ? void 0 : roleInfo.label) || ""),
                    timestamp: new Date(),
                    agentRole,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setIsLoading(false);
                setUploadedFiles([]);
                return;
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
                });
                if (!res.ok) {
                    const error = await res.json().catch(() => ({ error: "Erro no servidor" }));
                    throw new Error(error.error || "Erro ao processar chat");
                }
                const data = await res.json();
                // Auto-sugestão: se detectou ação e backend também sugere, adicionar CTA
                const showAgentSuggestion = shouldSuggestSwitch || data.suggestOrchestrate;
                const suggestContent = showAgentSuggestion
                    ? `\n\n---\n💡 **Detectei que você quer executar uma ação.** [Clique aqui para usar o Orquestrador](#switch-orchestrate) e automatizar o processo.`
                    : '';
                const assistantMessage = {
                    id: `msg-${Date.now() + 1}`,
                    role: "assistant",
                    content: (data.reply || "Sem resposta do servidor.") + suggestContent,
                    timestamp: new Date(),
                    agentRole,
                    suggestOrchestrateText: showAgentSuggestion ? userText : undefined,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setIsLoading(false);
                setUploadedFiles([]);
                return;
            }
            // Orchestrate mode - call /api/agents
            if (agentRole === "orchestrate") {
                if (!settings.workerEnabled) {
                    const assistantMessage = {
                        id: `msg-${Date.now() + 1}`,
                        role: "assistant",
                        content: "⚠️ **Worker desativado.** Ative o Worker nas configurações para usar o modo Orquestração.",
                        timestamp: new Date(),
                        agentRole,
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                    setIsLoading(false);
                    return;
                }
                const res = await fetch("/api/agents", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        role: "orchestrate",
                        request: userText, // API espera 'request', não 'message'
                        sandbox: settings.sandboxEnabled ? { enabled: true, mode: settings.sandboxMode } : undefined,
                        safeMode: settings.safeMode,
                    }),
                });
                if (!res.ok) {
                    const error = await res.json().catch(() => ({ error: "Erro no servidor" }));
                    throw new Error(error.error || "Erro ao iniciar orquestração");
                }
                const data = await res.json();
                const assistantMessage = {
                    id: `msg-${Date.now() + 1}`,
                    role: "assistant",
                    content: data.reply || `🚀 **Orquestração iniciada**\n\nID: \`${data.orchestrationId || "pending"}\`\n\nAcompanhe o progresso em tempo real.`,
                    timestamp: new Date(),
                    agentRole,
                    approvalRequired: data.requiresApproval ? data.orchestrationId : undefined,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setIsLoading(false);
                setUploadedFiles([]);
                return;
            }
            // Agent modes that go through worker queue (advisor, reviewer, operator, executor)
            const agentModesThroughQueue = ['advisor', 'reviewer', 'operator', 'executor'];
            if (agentModesThroughQueue.includes(agentRole)) {
                // Esses agentes rodam via worker - usar /api/agents
                if (!settings.workerEnabled) {
                    const assistantMessage = {
                        id: `msg-${Date.now() + 1}`,
                        role: "assistant",
                        content: `⚠️ **Worker desativado.** Ative o Worker nas configurações para usar o modo ${agentRole}.`,
                        timestamp: new Date(),
                        agentRole,
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                    setIsLoading(false);
                    return;
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
                });
                if (!res.ok) {
                    const error = await res.json().catch(() => ({ error: "Erro no servidor" }));
                    throw new Error(error.error || `Erro ao executar ${agentRole}`);
                }
                const data = await res.json();
                const assistantMessage = {
                    id: `msg-${Date.now() + 1}`,
                    role: "assistant",
                    content: data.reply || `🚀 **${agentRole}** iniciado\n\nID: \`${data.taskId || "pending"}\`\n\nAcompanhe o progresso em tempo real.`,
                    timestamp: new Date(),
                    agentRole,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setIsLoading(false);
                setUploadedFiles([]);
                return;
            }
            // Legacy modes (legacyAssist) - call /api/agent with FormData for static analysis
            const formData = new FormData();
            formData.append("message", userText);
            formData.append("role", agentRole);
            uploadedFiles.forEach((file) => formData.append("files", file));
            const res = await fetch("/api/agent", { method: "POST", body: formData });
            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: "Erro no servidor" }));
                throw new Error(error.error || "Erro ao processar");
            }
            const data = await res.json();
            const assistantMessage = {
                id: `msg-${Date.now() + 1}`,
                role: "assistant",
                content: data.reply || "Processamento concluído.",
                timestamp: new Date(),
                agentRole,
                patches: data.patches,
                tests: data.tests,
            };
            setMessages((prev) => [...prev, assistantMessage]);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
            const assistantMessage = {
                id: `msg-${Date.now() + 1}`,
                role: "assistant",
                content: `❌ **Erro:** ${errorMessage}\n\nTente novamente ou verifique as configurações.`,
                timestamp: new Date(),
                agentRole,
            };
            setMessages((prev) => [...prev, assistantMessage]);
        }
        finally {
            setIsLoading(false);
            setUploadedFiles([]);
        }
    };
    const handleSuggestionClick = (suggestion) => {
        setInput((prev) => prev + " " + suggestion);
        setShowSuggestions(false);
    };
    const handleQuickAction = (prompt) => {
        setInput(prompt);
    };
    const handleFileUpload = (files) => {
        if (files) {
            const newFiles = Array.from(files).filter((file) => file.size < 2000000);
            setUploadedFiles((prev) => [...prev, ...newFiles]);
        }
    };
    const handleRemoveFile = (index) => {
        setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    };
    // Safety badges for display
    const safetyBadges = (0, react_1.useMemo)(() => [
        settings.sandboxEnabled ? `Sandbox ${settings.sandboxMode}` : null,
        settings.safeMode ? "Safe Mode" : null,
        settings.reviewGate ? "Review Gate" : null,
    ].filter(Boolean), [settings]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex flex-col min-h-0 relative", children: [(0, jsx_runtime_1.jsxs)("header", { className: "flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-xl z-10", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(isMobile || sidebarCollapsed) && ((0, jsx_runtime_1.jsx)("button", { onClick: onToggleSidebar, className: "p-2 rounded-lg hover:bg-secondary transition-colors", "aria-label": "Alternar sidebar", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Menu, { className: "w-5 h-5" }) })), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [agentRole === "legacyAssist" && (0, jsx_runtime_1.jsx)(lucide_react_1.Sparkles, { className: "w-4 h-4 text-primary" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium", children: (_a = AgentSelector_1.AGENT_ROLES.find((r) => r.key === agentRole)) === null || _a === void 0 ? void 0 : _a.label.split(" — ")[0] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "hidden md:flex items-center gap-1.5", children: safetyBadges.slice(0, 2).map((badge, i) => ((0, jsx_runtime_1.jsxs)("span", { className: "badge badge-primary", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-3 h-3 mr-1" }), badge] }, i))) }), (0, jsx_runtime_1.jsx)("button", { onClick: onOpenSettings, className: "p-2 rounded-lg hover:bg-secondary transition-colors", "aria-label": "Abrir configuracoes", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Settings, { className: "w-5 h-5" }) })] })] }), hasMessages ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "flex-1 overflow-y-auto", children: (0, jsx_runtime_1.jsxs)("div", { className: "max-w-3xl mx-auto px-4 py-6", children: [(0, jsx_runtime_1.jsx)(MessageList_1.default, { messages: messages, isLoading: isLoading, onSwitchAgent: (agent, prompt) => {
                                        setAgentRole(agent);
                                        if (prompt)
                                            setInput(prompt);
                                    } }), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] }) }), (0, jsx_runtime_1.jsxs)("div", { className: "relative border-t border-border bg-background/80 backdrop-blur-xl", children: [(0, jsx_runtime_1.jsx)(FloatingSuggestions_1.default, { suggestions: suggestions, visible: showSuggestions, onSelect: handleSuggestionClick, onDismiss: () => setShowSuggestions(false) }), (0, jsx_runtime_1.jsx)("div", { className: "max-w-3xl mx-auto px-4 py-4", children: (0, jsx_runtime_1.jsx)(ChatInput_1.default, { input: input, onInputChange: setInput, onSubmit: handleSubmit, isLoading: isLoading, uploadedFiles: uploadedFiles, onFileUpload: handleFileUpload, onRemoveFile: handleRemoveFile, agentRole: agentRole, onAgentRoleChange: setAgentRole, deepSearch: settings.deepSearch, onDeepSearchChange: () => { }, compact: true }) })] })] })) : ((0, jsx_runtime_1.jsx)(WelcomeScreen_1.default, { session: session, input: input, onInputChange: setInput, onSubmit: handleSubmit, isLoading: isLoading, uploadedFiles: uploadedFiles, onFileUpload: handleFileUpload, onRemoveFile: handleRemoveFile, agentRole: agentRole, onAgentRoleChange: setAgentRole, deepSearch: settings.deepSearch, onDeepSearchChange: () => { }, onQuickAction: handleQuickAction, suggestions: suggestions, showSuggestions: showSuggestions, onSuggestionClick: handleSuggestionClick, onDismissSuggestions: () => setShowSuggestions(false) }))] }));
}
function buildResponse(userText, agentRole, roleLabel) {
    const t = userText.toLowerCase();
    if (agentRole === "legacyAssist") {
        return `## Guia LegacyAssist

Entendi sua solicitacao. Vamos seguir um fluxo estruturado:

**Fase 1 - Entendimento**
Confirme o contexto: qual repositorio ou sistema estamos analisando?

**Fase 2 - Pesquisa**
Posso ajudar com:
- 🔍 **RAG** - Buscar no contexto indexado
- 🌐 **Web** - Pesquisa externa
- 💡 **Brainstorm** - Explorar solucoes

**Fase 3 - Validacao**
Antes de qualquer acao, validaremos com Twin Builder ou Sandbox.

**Qual opcao voce prefere iniciar?**`;
    }
    if (t.includes("incidente") || t.includes("erro")) {
        return `## Analise de Incidente

Detectei contexto de incidente. Recomendo:

1. **Twin Builder** - Reproduzir o cenario em ambiente isolado
2. **Analise de logs** - Identificar root cause
3. **Patch generation** - Sugerir correcoes

Deseja que eu acione o Twin Builder para reproduzir o incidente?`;
    }
    return `## ${roleLabel}

Entendi sua solicitacao. Vou analisar o contexto e preparar uma resposta detalhada.

**Proximos passos:**
1. Analise do escopo
2. Identificacao de riscos
3. Sugestao de acoes

Processando...`;
}
