"use strict";
'use client';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChatInterface;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const image_1 = __importDefault(require("next/image"));
const react_diff_viewer_continued_1 = __importDefault(require("react-diff-viewer-continued"));
const react_2 = require("next-auth/react");
const AgentSelector_1 = __importStar(require("./AgentSelector"));
const SettingsSidebar_1 = __importDefault(require("./SettingsSidebar"));
function ChatInterface() {
    var _a, _b, _c;
    const { data: session, status } = (0, react_2.useSession)();
    const [messages, setMessages] = (0, react_1.useState)([
        {
            role: 'assistant',
            content: session
                ? `👋 Olá, ${((_a = session.user) === null || _a === void 0 ? void 0 : _a.name) || 'usuário'}! Eu sou o LegacyGuard. Use **LegacyAssist** para um roteiro guiado ("o que faço agora?") com pesquisas (web/RAG/brainstorm) e, quando quiser executar, troque para Orquestrador ou operadores.`
                : '👋 Olá! Eu sou o LegacyGuard. Use **LegacyAssist** para um roteiro guiado ("o que faço agora?") com pesquisas (web/RAG/brainstorm) e, quando quiser executar, troque para Orquestrador ou operadores. Faça login com GitHub para repositórios privados.'
        }
    ]);
    const [input, setInput] = (0, react_1.useState)('');
    const [githubUrl, setGithubUrl] = (0, react_1.useState)('');
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [uploadedFiles, setUploadedFiles] = (0, react_1.useState)([]);
    const [selectedPatch, setSelectedPatch] = (0, react_1.useState)(null);
    const [selectedTest, setSelectedTest] = (0, react_1.useState)(null);
    const [agentRole, setAgentRole] = (0, react_1.useState)(AgentSelector_1.AGENT_ROLES[0].key);
    const [deepSearch, setDeepSearch] = (0, react_1.useState)(false);
    const [mergeOwner, setMergeOwner] = (0, react_1.useState)('');
    const [mergeRepo, setMergeRepo] = (0, react_1.useState)('');
    const [mergePrNumber, setMergePrNumber] = (0, react_1.useState)('');
    const [mergeLoading, setMergeLoading] = (0, react_1.useState)(false);
    const [inlineSuggestions, setInlineSuggestions] = (0, react_1.useState)([]);
    // Configurações gerais (sidebar controlada)
    const [sandboxEnabled, setSandboxEnabled] = (0, react_1.useState)(true);
    const [sandboxMode, setSandboxMode] = (0, react_1.useState)('fail');
    const [safeMode, setSafeMode] = (0, react_1.useState)(true);
    const [reviewGate, setReviewGate] = (0, react_1.useState)(true);
    const [workerEnabled, setWorkerEnabled] = (0, react_1.useState)(true);
    const [maskingEnabled, setMaskingEnabled] = (0, react_1.useState)(true);
    const [ragReady, setRagReady] = (0, react_1.useState)(false);
    const [apiEnabled, setApiEnabled] = (0, react_1.useState)(false);
    const [billingCap, setBillingCap] = (0, react_1.useState)(20);
    const [tokenCap, setTokenCap] = (0, react_1.useState)(12000);
    const [temperatureCap, setTemperatureCap] = (0, react_1.useState)(0.5);
    // LegacyAssist (modo guiado)
    const [assistOnboardingSeen, setAssistOnboardingSeen] = (0, react_1.useState)(false);
    const [showAssistModal, setShowAssistModal] = (0, react_1.useState)(false);
    const [assistMetrics, setAssistMetrics] = (0, react_1.useState)({
        stepsCompleted: 0,
        researches: 0,
        executionBlocked: true,
    });
    const assistStorageKey = (0, react_1.useMemo)(() => { var _a; return (((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email) ? `legacyAssist:${session.user.email}` : 'legacyAssist:anon'); }, [(_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.email]);
    // Persistência de onboarding/metrics no cliente (por usuário/sessão)
    (0, react_1.useEffect)(() => {
        try {
            const seen = localStorage.getItem(`${assistStorageKey}:onboardingSeen`);
            if (seen === 'true')
                setAssistOnboardingSeen(true);
            else
                setAssistOnboardingSeen(false);
            const metricsRaw = localStorage.getItem(`${assistStorageKey}:metrics`);
            if (metricsRaw) {
                const parsed = JSON.parse(metricsRaw);
                if (typeof (parsed === null || parsed === void 0 ? void 0 : parsed.stepsCompleted) === 'number' && typeof (parsed === null || parsed === void 0 ? void 0 : parsed.researches) === 'number') {
                    setAssistMetrics({
                        stepsCompleted: parsed.stepsCompleted,
                        researches: parsed.researches,
                        executionBlocked: true,
                    });
                }
                else {
                    setAssistMetrics({ stepsCompleted: 0, researches: 0, executionBlocked: true });
                }
            }
            else {
                setAssistMetrics({ stepsCompleted: 0, researches: 0, executionBlocked: true });
            }
        }
        catch {
            setAssistMetrics({ stepsCompleted: 0, researches: 0, executionBlocked: true });
        }
    }, [assistStorageKey]);
    // Se não há sessão (sign-out), garante estado anônimo limpo
    (0, react_1.useEffect)(() => {
        var _a;
        if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.email)) {
            setAssistOnboardingSeen(false);
            setAssistMetrics({ stepsCompleted: 0, researches: 0, executionBlocked: true });
        }
    }, [(_c = session === null || session === void 0 ? void 0 : session.user) === null || _c === void 0 ? void 0 : _c.email]);
    (0, react_1.useEffect)(() => {
        try {
            localStorage.setItem(`${assistStorageKey}:onboardingSeen`, assistOnboardingSeen ? 'true' : 'false');
            localStorage.setItem(`${assistStorageKey}:metrics`, JSON.stringify(assistMetrics));
        }
        catch {
            // ignore
        }
    }, [assistOnboardingSeen, assistMetrics, assistStorageKey]);
    const [sessions, setSessions] = (0, react_1.useState)([]);
    const [sessionsLoading, setSessionsLoading] = (0, react_1.useState)(false);
    const safetyBadges = (0, react_1.useMemo)(() => [
        sandboxEnabled ? `Sandbox ${sandboxMode === 'fail' ? '(fail)' : '(warn)'}` : 'Sandbox off',
        safeMode ? 'Safe mode on' : 'Safe mode off',
        reviewGate ? 'Reviewer gating on' : 'Reviewer gating off',
        workerEnabled ? 'Worker on' : 'Worker off',
        maskingEnabled ? 'Masking on' : 'Masking off',
    ], [sandboxEnabled, sandboxMode, safeMode, reviewGate, workerEnabled, maskingEnabled]);
    (0, react_1.useEffect)(() => {
        const loadSessions = async () => {
            setSessionsLoading(true);
            try {
                const res = await fetch('/api/sessions');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.sessions)) {
                        setSessions(data.sessions);
                        return;
                    }
                }
                // API returned non-ok or no sessions array - start fresh
                setSessions([]);
            }
            catch {
                // Network error - start with empty sessions
                setSessions([]);
            }
            finally {
                setSessionsLoading(false);
            }
        };
        loadSessions();
    }, []);
    (0, react_1.useEffect)(() => {
        const loadConfig = async () => {
            try {
                const res = await fetch('/api/config');
                if (!res.ok)
                    return;
                const data = await res.json();
                const cfg = data.config || {};
                if (typeof cfg.sandboxEnabled === 'boolean')
                    setSandboxEnabled(cfg.sandboxEnabled);
                if (typeof cfg.sandboxFailMode === 'string')
                    setSandboxMode(cfg.sandboxFailMode);
                if (typeof cfg.safeMode === 'boolean')
                    setSafeMode(cfg.safeMode);
                if (typeof cfg.workerEnabled === 'boolean')
                    setWorkerEnabled(cfg.workerEnabled);
                if (typeof cfg.maskingEnabled === 'boolean')
                    setMaskingEnabled(cfg.maskingEnabled);
                if (typeof cfg.deepSearch === 'boolean')
                    setDeepSearch(cfg.deepSearch);
            }
            catch {
                // ignore
            }
        };
        loadConfig();
    }, []);
    // Exibir modal de onboarding quando entrar no modo LegacyAssist pela primeira vez
    (0, react_1.useEffect)(() => {
        if (agentRole === 'legacyAssist' && !assistOnboardingSeen) {
            setShowAssistModal(true);
        }
    }, [agentRole, assistOnboardingSeen]);
    const handleFileUpload = (files) => {
        if (files) {
            const newFiles = Array.from(files).filter(file => file.size < 1000000);
            if (newFiles.length < files.length)
                alert('Arquivos >1MB foram ignorados.');
            setUploadedFiles(prev => [...prev, ...newFiles]);
        }
    };
    const removeFile = (index) => {
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    };
    const shouldSuggestTwinBuilder = (text) => {
        const lower = text.toLowerCase();
        return ['incident', 'incidente', 'erro', 'falha', 'crash', 'alerta', 'exfiltra', 'vazamento'].some((kw) => lower.includes(kw));
    };
    const maybeOfferTwinBuilder = (text) => {
        if (!shouldSuggestTwinBuilder(text))
            return;
        setMessages(prev => [...prev, {
                role: 'assistant',
                content: '🔎 Detectei contexto de incidente. Deseja acionar o Twin Builder para reproduzir e mitigar em sandbox?',
                twinOffer: { prompt: text },
            }]);
    };
    const buildSandboxPayload = () => ({
        enabled: sandboxEnabled,
        failMode: sandboxMode,
        languageHint: undefined,
        // comando opcional poderia vir de config avançada; deixamos vazio para autodetect
        timeoutMs: 15 * 60 * 1000,
        repoPath: undefined,
        runnerPath: undefined,
    });
    const computeSuggestions = (text) => {
        const t = text.toLowerCase();
        const list = [];
        if (t.includes('incidente') || t.includes('erro') || t.includes('alerta')) {
            list.push('Acionar Twin Builder para reproduzir o incidente.');
            list.push('Gerar fixtures sintéticos e rodar sandbox em modo fail.');
        }
        if (t.includes('sandbox') || t.includes('teste')) {
            list.push('Sandbox fail mode + lint + security antes do executor.');
        }
        if (t.includes('orquestra') || agentRole === 'orchestrate') {
            list.push('Criar plano com approval antes de executor.');
        }
        if (list.length === 0 && text.length > 8) {
            list.push('Adicionar contexto: repoPath, risco, prazo.');
        }
        return list.slice(0, 3);
    };
    const buildLegacyAssistGuide = (text) => {
        const base = text || 'Descreva o que você precisa.';
        return [
            '🎛️ Modo assistido ativo: nenhuma execução automática.',
            `1) Entender: confirme contexto (repo/riscos/prazo). Pedido: "${base}"`,
            '2) Pesquisar: escolha RAG interno, Web ou Brainstorm curto.',
            '3) Se for incidente: acione Twin Builder para reproduzir e gerar harness.',
            '4) Validar: rode sandbox (fail) ou harness Twin antes de qualquer merge.',
            '5) Executar (opcional): use Orquestrador para plano+aprovação ou Operator/Executor após validações.',
            '⚠️ Execução bloqueada neste modo: confirme antes de acionar agentes. Risco atual: baixo (consultivo).',
        ].join('\n');
    };
    const getAssistStub = (action) => {
        const common = 'Esta é uma prévia guiada. Nenhuma execução real foi feita.';
        if (action === 'rag')
            return `🔍 RAG interno (stub)\n- Procurar no índice: erros, stacktrace, serviços afetados\n- Próximo passo: validar snippet encontrado\n${common}`;
        if (action === 'web')
            return `🌐 Busca web (stub)\n- Pesquise fornecedores, CVEs ou artigos relevantes\n- Próximo passo: comparar com contexto local\n${common}`;
        if (action === 'brainstorm')
            return `💡 Brainstorm curto (stub)\n- Gerar 3 hipóteses de causa e 3 passos de mitigação\n- Escolha uma para detalhar\n${common}`;
        if (action === 'twin')
            return `🧪 Twin Builder (stub)\n- Planeje reproduzir o incidente e gerar harness.commands\n- Próximo passo: rodar sandbox com harness (fail-mode)\n${common}`;
        if (action === 'sandbox')
            return `🛡️ Sandbox (stub)\n- Rodar comando seguro em modo fail\n- Se falhar: reproduziu o bug (bom para diagnóstico)\n${common}`;
        return `🎭 Orquestrador (stub)\n- Criar plano com aprovação\n- Subtarefas: reproduce → analyze → refactor → test → review → deploy\n${common}`;
    };
    const getAssistResultsStub = (action) => {
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (action === 'rag')
            return [`[${ts}] service-auth: stacktrace NullPointer em login (alto)`, `[${ts}] service-billing: timeout ao chamar gateway (médio)`, `[${ts}] recomendação: priorizar auth, coletar traces`].join('\n');
        if (action === 'web')
            return [`[${ts}] CVE-2024-xxxx referência similar (alto)`, `[${ts}] Artigo: mitigação com retry + circuit breaker (médio)`, `[${ts}] recomendação: comparar versão/lib local`].join('\n');
        if (action === 'brainstorm')
            return [`[${ts}] Hipótese A: regressão em auth`, `[${ts}] Hipótese B: falta de idempotência`, `[${ts}] Próximo: priorizar sandbox fail e logs de auth`].join('\n');
        if (action === 'twin')
            return [`[${ts}] Harness pronto (stub): npm test -- run twin-fixture`, `[${ts}] Próximo: rodar sandbox fail-mode com harness`, `[${ts}] Verificar se reproduz stacktrace original`].join('\n');
        if (action === 'sandbox')
            return `[${ts}] Execução simulada: exit 1 (reproduziu bug) — bom para diagnóstico`;
        if (action === 'orchestrate')
            return [`[${ts}] Plano stub: reproduce → analyze → refactor → test → review → deploy`, `[${ts}] Risco: medium; aprovação requerida para executor`, `[${ts}] Próximo: adicionar checklist de rollback`].join('\n');
        return null;
    };
    const handleAssistAction = (action) => {
        const labels = {
            rag: '🔍 Pesquisar no índice interno (RAG) — sugerido para contexto de código/projeto.',
            web: '🌐 Pesquisar na web — buscar referências externas.',
            brainstorm: '💡 Brainstorm rápido — gerar opções e próximos passos.',
            twin: '🧪 Acionar Twin Builder — reproduzir incidente em ambiente controlado.',
            sandbox: '🛡️ Rodar sandbox fail-mode — validar comandos antes de merge.',
            orchestrate: '🎭 Abrir Orquestrador — gerar plano com aprovação antes de executar.',
        };
        setAssistMetrics((prev) => ({
            ...prev,
            researches: ['rag', 'web', 'brainstorm'].includes(action) ? prev.researches + 1 : prev.researches,
            stepsCompleted: prev.stepsCompleted + 1,
        }));
        const resultsStub = getAssistResultsStub(action);
        setMessages((prev) => {
            const newMsgs = [
                { role: 'assistant', content: labels[action] },
                { role: 'assistant', content: getAssistStub(action) },
            ];
            if (resultsStub)
                newMsgs.push({ role: 'assistant', content: resultsStub });
            return [...prev, ...newMsgs];
        });
    };
    const buildExecutionPolicy = () => {
        const allowed = safeMode ? ['advisor', 'reviewer', 'operator', 'advisor-impact'] : undefined;
        const requireApprovalFor = ['executor'];
        return { allowedAgents: allowed, requireApprovalFor };
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLoading || (!input.trim() && uploadedFiles.length === 0))
            return;
        setInlineSuggestions([]);
        const userText = input.trim() || `Analise os arquivos e gere patches de correção.`;
        const userMessage = {
            role: 'user',
            content: userText + (uploadedFiles.length > 0 ? `\n\nArquivos anexados: ${uploadedFiles.map(f => f.name).join(', ')}` : '')
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        maybeOfferTwinBuilder(userText);
        // Modo LegacyAssist: apenas guia, não executa
        if (agentRole === 'legacyAssist') {
            const guide = buildLegacyAssistGuide(userText);
            setAssistMetrics((prev) => ({ ...prev, stepsCompleted: prev.stepsCompleted + 1 }));
            setMessages(prev => [...prev, { role: 'assistant', content: guide }]);
            // Sugerir CTA explícito para orquestrar ou validar em sandbox, sem executar.
            setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'Sugestão: abra o Orquestrador para plano com aprovação, ou rode Sandbox (fail) primeiro. Nenhuma ação será executada sem sua confirmação.',
                }]);
            setInlineSuggestions(computeSuggestions(userText));
            setUploadedFiles([]);
            return;
        }
        // Se modo orquestração, usar fluxo multi-agente
        if (agentRole === 'orchestrate') {
            if (!workerEnabled) {
                setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Worker/Redis desativado. Ative na barra lateral para orquestrar.' }]);
                return;
            }
            await handleOrchestrate(userText, {
                files: uploadedFiles.map(f => f.name),
                sandbox: buildSandboxPayload(),
                safeMode,
            });
            setUploadedFiles([]);
            return;
        }
        // Modo chat livre (econômico / pesquisa)
        if (agentRole === 'chat') {
            setIsLoading(true);
            try {
                if (deepSearch && !ragReady) {
                    setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Pesquisa profunda ligada mas índice/RAG está pendente. Reindexe em Configurações para reduzir alucinações.' }]);
                }
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userText, deep: deepSearch }),
                });
                if (!res.ok)
                    throw new Error('Erro no modo chat');
                const data = await res.json();
                setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: data.reply,
                        suggestOrchestrateText: data.suggestOrchestrate ? userText : undefined,
                    }]);
            }
            catch {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao processar o chat livre.' }]);
            }
            finally {
                setIsLoading(false);
                setUploadedFiles([]);
            }
            return;
        }
        setIsLoading(true);
        const formData = new FormData();
        formData.append('message', userText);
        formData.append('role', agentRole);
        uploadedFiles.forEach(file => formData.append('files', file));
        try {
            const res = await fetch('/api/agent', { method: 'POST', body: formData });
            if (!res.ok)
                throw new Error('Erro no servidor');
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply, patches: data.patches || [], tests: data.tests || [] }]);
        }
        catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao processar. Tente novamente.' }]);
        }
        finally {
            setIsLoading(false);
            setUploadedFiles([]);
        }
    };
    const handleImportRepo = async () => {
        var _a;
        if (!githubUrl.trim() || isLoading)
            return;
        const repoMessage = { role: 'user', content: `Importar repo GitHub: ${githubUrl}` };
        setMessages(prev => [...prev, repoMessage]);
        // Se modo orquestração, usar fluxo multi-agente
        if (agentRole === 'orchestrate') {
            setGithubUrl('');
            await handleOrchestrate(`Analise o repositório ${githubUrl.trim()} com foco em segurança e refatoração`, { githubUrl: githubUrl.trim() });
            return;
        }
        setGithubUrl('');
        setIsLoading(true);
        try {
            const res = await fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: agentRole,
                    message: `Analise o repositório completo com foco em segurança e refatoração.`,
                    githubUrl: githubUrl.trim(),
                    // Corrigido: accessToken pode estar em session.user ou session, dependendo da config do NextAuth
                    accessToken: (session === null || session === void 0 ? void 0 : session.accessToken) || ((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.accessToken) || undefined,
                }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.reply || 'Erro ao importar');
            }
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply, patches: data.patches || [], tests: data.tests || [] }]);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Erro ao importar o repositório.\n\n${errMsg || 'Verifique se o repo existe e se você tem acesso (público ou privado com login).'}`
                }]);
        }
        finally {
            setIsLoading(false);
        }
    };
    const applyPatch = async (patch) => {
        if (agentRole === 'legacyAssist') {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Modo assistido: aplicação automática de patch bloqueada. Use Orquestrador ou mude de modo para executar.' }]);
            return;
        }
        if (safeMode) {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Safe mode ativado. Desative em Configurações para aplicar patches.' }]);
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch('/api/agent/apply-patch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patch }),
            });
            if (!res.ok)
                throw new Error();
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'projeto-corrigido.zip';
            a.click();
            window.URL.revokeObjectURL(url);
            setMessages(prev => [...prev, { role: 'assistant', content: '✅ **Patch aplicado com sucesso!**\nDownload do projeto corrigido iniciado.' }]);
        }
        catch {
            setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro ao aplicar o patch.' }]);
        }
        finally {
            setIsLoading(false);
        }
    };
    const downloadTest = (filename, content) => {
        try {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
            setMessages(prev => [...prev, { role: 'assistant', content: `✅ Download iniciado: ${filename}` }]);
        }
        catch {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Falha ao baixar: ${filename}` }]);
        }
    };
    const downloadAllTests = async (tests) => {
        try {
            const JSZip = (await Promise.resolve().then(() => __importStar(require('jszip')))).default;
            const zip = new JSZip();
            tests.forEach(t => zip.file(t.file, t.content));
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `legacyguard-tests-${Date.now()}.zip`;
            a.click();
            window.URL.revokeObjectURL(url);
            setMessages(prev => [...prev, { role: 'assistant', content: `✅ Download ZIP iniciado (${tests.length} arquivos)` }]);
        }
        catch {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Falha ao gerar ZIP de testes` }]);
        }
    };
    const triggerTwinBuilder = async (prompt) => {
        if (isLoading)
            return;
        if (!workerEnabled) {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Worker/Redis desativado. Ative para enfileirar o Twin Builder.' }]);
            return;
        }
        setIsLoading(true);
        try {
            const incident = {
                id: `inc-${Date.now()}`,
                source: 'custom',
                title: prompt.slice(0, 140),
                payload: { userText: prompt },
            };
            const res = await fetch('/api/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    incident,
                    sandbox: { enabled: sandboxEnabled, failMode: sandboxMode },
                }),
            });
            if (!res.ok)
                throw new Error('Falha ao enfileirar Twin Builder');
            const data = await res.json();
            setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `🧪 Twin Builder enfileirado (tarefa ${data.taskId}). Acompanhe SSE: ${data.streamUrl || '/api/agents/stream'} e logs: ${data.logsUrl || '/api/agents/logs'}`,
                }]);
            if (data.streamUrl) {
                const twinStream = new EventSource(data.streamUrl);
                twinStream.onmessage = (event) => {
                    try {
                        const update = JSON.parse(event.data);
                        if (update.type === 'twin-built' && update.result) {
                            const res = update.result;
                            setMessages(prev => {
                                var _a, _b;
                                return [...prev, {
                                        role: 'assistant',
                                        content: `🧪 **Twin pronto**\nSnapshot: ${res.snapshotPath || 'n/d'}\nFixture: ${res.syntheticFixturePath || 'n/d'}\nTests: ${((_a = res.syntheticTests) === null || _a === void 0 ? void 0 : _a.length) || 0}\nComandos: ${Object.values(res.commands || {}).join(', ') || 'n/d'}\nGuardrails: ${(((_b = res.impactGuardrails) === null || _b === void 0 ? void 0 : _b.warnings) || []).join('; ') || 'nenhum'}`,
                                        twinReady: true,
                                    }];
                            });
                            twinStream.close();
                        }
                    }
                    catch {
                        // ignore
                    }
                };
                twinStream.onerror = () => twinStream.close();
            }
            if (data.logsUrl) {
                const logSource = new EventSource(data.logsUrl);
                logSource.onmessage = (event) => {
                    try {
                        const logUpdate = JSON.parse(event.data);
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `📡 [Twin log] ${logUpdate.message || event.data}`,
                            }]);
                    }
                    catch {
                        // ignore
                    }
                };
                logSource.onerror = () => logSource.close();
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro ao acionar Twin Builder';
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }]);
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleOrchestrate = async (request, context) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'orchestrate',
                    request,
                    context,
                    sandbox: context === null || context === void 0 ? void 0 : context.sandbox,
                    safeMode,
                    executionPolicy: buildExecutionPolicy(),
                }),
            });
            if (!res.ok)
                throw new Error('Falha ao iniciar orquestração');
            const data = await res.json();
            let logSource = null;
            setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `🎭 **Orquestração iniciada**\n\nTarefa: ${data.taskId}\n\nO Planner está analisando seu pedido e criando um plano de execução coordenada. Acompanhe o progresso abaixo.`
                }]);
            if (data.taskId) {
                logSource = new EventSource(`/api/agents/logs?taskId=${encodeURIComponent(data.taskId)}`);
                logSource.onmessage = (event) => {
                    try {
                        const logUpdate = JSON.parse(event.data);
                        const label = logUpdate.scope === 'audit' ? 'Audit' : 'Sandbox';
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `📡 **${label} log**\n${logUpdate.message || event.data}`,
                            }]);
                    }
                    catch {
                        // ignore malformed log event
                    }
                };
                logSource.onerror = () => {
                    logSource === null || logSource === void 0 ? void 0 : logSource.close();
                };
            }
            // Iniciar SSE para receber atualizações em tempo real
            const eventSource = new EventSource(data.streamUrl);
            eventSource.onmessage = (event) => {
                try {
                    const update = JSON.parse(event.data);
                    if (update.type === 'plan') {
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `📋 **Plano criado**\n\n${update.plan.summary}\n\n**Subtarefas:** ${update.plan.subtasks.length}\n**Risco:** ${update.plan.riskLevel}\n**Tempo estimado:** ${update.plan.estimatedTime}`
                            }]);
                    }
                    else if (update.type === 'task-complete') {
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `✅ **[${update.task.agent}]** ${update.task.description}`
                            }]);
                    }
                    else if (update.type === 'task-failed') {
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `❌ **Falha em [${update.task.agent}]:** ${update.error}\n\n_Verifique logs do worker para detalhes. O fluxo pode ter sido interrompido._`
                            }]);
                    }
                    else if (update.type === 'approval-required') {
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `⏸️ **Aprovação necessária**\n\nA tarefa "${update.task.description}" requer aprovação humana antes de continuar.\n\nClique no botão abaixo para aprovar.`,
                                approvalRequired: update.orchestrationId,
                            }]);
                    }
                    else if (update.type === 'orchestration-complete') {
                        setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `🎉 **Orquestração concluída**\n\nStatus: ${update.state.status}\nResultados: ${update.state.results.length} tarefas executadas`
                            }]);
                        logSource === null || logSource === void 0 ? void 0 : logSource.close();
                        eventSource.close();
                    }
                }
                catch (err) {
                    console.error('Erro ao processar update SSE:', err);
                }
            };
            eventSource.onerror = (e) => {
                console.error('SSE connection error', e);
                setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `⚠️ Conexão SSE perdida. A orquestração pode continuar em segundo plano. Recarregue para ver atualizações.`
                    }]);
                logSource === null || logSource === void 0 ? void 0 : logSource.close();
                eventSource.close();
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro ao iniciar orquestração';
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }]);
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleApproval = async (orchestrationId) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'approve',
                    orchestrationId,
                }),
            });
            if (!res.ok)
                throw new Error('Falha ao aprovar');
            setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `✅ Aprovação concedida. Continuando execução...`
                }]);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro ao aprovar';
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }]);
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleMerge = async () => {
        var _a;
        if (agentRole === 'legacyAssist') {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Modo assistido: merge automático bloqueado. Abra o Orquestrador para plano + aprovação.' }]);
            return;
        }
        if (!mergeOwner.trim() || !mergeRepo.trim() || !mergePrNumber.trim())
            return;
        if (safeMode) {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Safe mode ativo. Desative em Configurações para permitir merge pelo Executor.' }]);
            return;
        }
        setMergeLoading(true);
        try {
            const prNumber = Number(mergePrNumber.trim());
            if (Number.isNaN(prNumber))
                throw new Error('PR inválido');
            const token = (session === null || session === void 0 ? void 0 : session.accessToken) || ((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.accessToken);
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'executor',
                    payload: { owner: mergeOwner.trim(), repo: mergeRepo.trim(), prNumber, token },
                }),
            });
            if (!res.ok)
                throw new Error('Falha ao enfileirar merge');
            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: `✅ Merge solicitado ao Executor (tarefa ${data.id || 'enfileirada'})` }]);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro ao solicitar merge';
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}` }]);
        }
        finally {
            setMergeLoading(false);
        }
    };
    const handleResumeSession = async (sessionItem) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `🔄 Retomando sessão "${sessionItem.title}" (tag: ${sessionItem.tag}).` }]);
        try {
            if (!ragReady) {
                const res = await fetch('/api/index', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                if (res.ok) {
                    const data = await res.json();
                    setRagReady(true);
                    setMessages(prev => { var _a; return [...prev, { role: 'assistant', content: `📚 RAG reindexado (${(_a = data.fileCount) !== null && _a !== void 0 ? _a : 0} arquivos). Contexto pronto.` }]; });
                }
                else {
                    const err = await res.json().catch(() => ({}));
                    setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Falha ao reindexar: ${err.error || res.statusText}. Continue mesmo assim?` }]);
                }
            }
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Erro ao reindexar para retomada: ${msg}` }]);
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "min-h-screen relative overflow-hidden bg-transparent text-slate-50", children: [(0, jsx_runtime_1.jsxs)("div", { className: "pointer-events-none absolute inset-0 mix-blend-screen opacity-60", children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute -left-32 -top-32 w-80 h-80 rounded-full bg-emerald-500 blur-[140px]" }), (0, jsx_runtime_1.jsx)("div", { className: "absolute right-0 top-10 w-72 h-72 rounded-full bg-indigo-500 blur-[140px]" }), (0, jsx_runtime_1.jsx)("div", { className: "absolute left-20 bottom-0 w-96 h-96 rounded-full bg-cyan-500 blur-[160px]" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "relative max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-[320px,1fr] gap-4", children: [(0, jsx_runtime_1.jsx)(SettingsSidebar_1.default, { deepSearch: deepSearch, onToggleDeep: setDeepSearch, sandboxEnabled: sandboxEnabled, onToggleSandbox: setSandboxEnabled, sandboxMode: sandboxMode, onChangeSandboxMode: setSandboxMode, safeMode: safeMode, onToggleSafeMode: setSafeMode, reviewGate: reviewGate, onToggleReviewGate: setReviewGate, workerEnabled: workerEnabled, onToggleWorker: setWorkerEnabled, maskingEnabled: maskingEnabled, onToggleMasking: setMaskingEnabled, ragReady: ragReady, onToggleRagReady: setRagReady, apiEnabled: apiEnabled, onToggleApi: setApiEnabled, billingCap: billingCap, onChangeBillingCap: setBillingCap, tokenCap: tokenCap, onChangeTokenCap: setTokenCap, temperatureCap: temperatureCap, onChangeTemperatureCap: setTemperatureCap, sessions: sessions, onResumeSession: handleResumeSession, sessionsLoading: sessionsLoading }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-6", children: [(0, jsx_runtime_1.jsxs)("header", { className: "glass rounded-2xl px-6 py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("div", { className: "h-11 w-11 rounded-xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-xl", children: "\uD83D\uDEE1\uFE0F" }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h1", { className: "text-2xl font-bold text-white", children: "LegacyGuard Console" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "Orquestre agentes, teste em sandbox e revise seguran\u00E7a em um s\u00F3 lugar." }), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2 mt-2", children: safetyBadges.map((b, idx) => ((0, jsx_runtime_1.jsx)("span", { className: "text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-200", children: b }, idx))) })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [status === 'loading' && (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-slate-300", children: "Carregando sess\u00E3o..." }), status !== 'loading' && (session === null || session === void 0 ? void 0 : session.user) && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [session.user.image && ((0, jsx_runtime_1.jsx)(image_1.default, { src: session.user.image, alt: "Avatar", width: 40, height: 40, className: "rounded-full border border-white/10" })), (0, jsx_runtime_1.jsxs)("div", { className: "text-right", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-semibold", children: session.user.name || session.user.email }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-emerald-200", children: "GitHub conectado" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => (0, react_2.signOut)({ callbackUrl: '/' }), className: "px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-sm font-semibold transition", children: "Sair" })] })), status !== 'loading' && !(session === null || session === void 0 ? void 0 : session.user) && ((0, jsx_runtime_1.jsx)("button", { onClick: () => (0, react_2.signIn)('github'), className: "px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold shadow-lg shadow-emerald-500/30", children: "Login com GitHub" }))] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid lg:grid-cols-[2fr,1fr] gap-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "glass rounded-2xl p-4 flex flex-col gap-4 min-h-[75vh]", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-300", children: "Chat & Execu\u00E7\u00E3o" }), (0, jsx_runtime_1.jsx)("p", { className: "text-lg font-semibold", children: "Fale com os agentes e acompanhe a orquestra\u00E7\u00E3o" })] }), isLoading && (0, jsx_runtime_1.jsx)("span", { className: "px-3 py-1 rounded-full bg-amber-400/15 text-amber-200 text-xs border border-amber-400/40", children: "Processando..." })] }), agentRole === 'legacyAssist' && ((0, jsx_runtime_1.jsxs)("div", { className: "rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 flex flex-col gap-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex flex-wrap items-center gap-2 justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-semibold text-emerald-100", children: "Modo Assistido ativo" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-emerald-200", children: "Nenhuma execu\u00E7\u00E3o autom\u00E1tica. Siga os passos guiados e confirme antes de acionar agentes." })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-wrap gap-2 text-[11px] text-emerald-100", children: [(0, jsx_runtime_1.jsx)("span", { className: "px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40", children: "Execu\u00E7\u00E3o bloqueada" }), (0, jsx_runtime_1.jsxs)("span", { className: "px-2 py-1 rounded-full bg-white/10 border border-white/20", children: ["Passos: ", assistMetrics.stepsCompleted] }), (0, jsx_runtime_1.jsxs)("span", { className: "px-2 py-1 rounded-full bg-white/10 border border-white/20", children: ["Pesquisas: ", assistMetrics.researches] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid md:grid-cols-2 gap-2 text-xs text-emerald-50", children: [(0, jsx_runtime_1.jsx)("div", { className: "rounded-lg border border-white/10 bg-white/5 p-3", children: "1) Entender \u2192 Confirme contexto (repo/riscos/prazo)." }), (0, jsx_runtime_1.jsx)("div", { className: "rounded-lg border border-white/10 bg-white/5 p-3", children: "2) Pesquisar \u2192 RAG interno, Web, Brainstorm curto." }), (0, jsx_runtime_1.jsx)("div", { className: "rounded-lg border border-white/10 bg-white/5 p-3", children: "3) Incidente \u2192 Acione Twin Builder e gere harness." }), (0, jsx_runtime_1.jsx)("div", { className: "rounded-lg border border-white/10 bg-white/5 p-3", children: "4) Validar \u2192 Sandbox fail-mode antes de qualquer merge." })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-wrap gap-2 text-sm", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => handleAssistAction('rag'), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\uD83D\uDD0D RAG interno" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleAssistAction('web'), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\uD83C\uDF10 Buscar web" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleAssistAction('brainstorm'), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\uD83D\uDCA1 Brainstorm" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleAssistAction('twin'), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\uD83E\uDDEA Twin Builder" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleAssistAction('sandbox'), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\uD83D\uDEE1\uFE0F Sandbox fail" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleAssistAction('orchestrate'), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\uD83C\uDFAD Orquestrar (plano)" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setShowAssistModal(true), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15", children: "\u2139\uFE0F Ajuda do modo" })] })] })), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 overflow-y-auto pr-1 space-y-4 rounded-xl border border-white/5 bg-black/10 p-3", children: [messages.map((msg, i) => ((0, jsx_runtime_1.jsx)("div", { className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`, children: (0, jsx_runtime_1.jsxs)("div", { className: `max-w-3xl px-5 py-4 rounded-2xl shadow-sm border whitespace-pre-wrap leading-relaxed
                        ${msg.role === 'user'
                                                                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-50'
                                                                : 'bg-white/5 border-white/10 text-slate-100'}`, children: [(0, jsx_runtime_1.jsx)("div", { children: msg.content.split('\n').map((line, idx, arr) => ((0, jsx_runtime_1.jsxs)(react_1.default.Fragment, { children: [line, idx < arr.length - 1 && (0, jsx_runtime_1.jsx)("br", {})] }, idx))) }), msg.twinOffer && ((0, jsx_runtime_1.jsxs)("div", { className: "mt-3 flex flex-wrap gap-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => triggerTwinBuilder(msg.twinOffer.prompt), disabled: isLoading, className: "px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-50 text-sm disabled:opacity-50 hover:bg-emerald-500/30", children: "\uD83D\uDE80 Acionar Twin Builder" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setMessages(prev => [...prev, { role: 'assistant', content: 'Twin Builder não foi acionado desta vez.' }]), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-slate-200 text-sm hover:bg-white/20", children: "Agora n\u00E3o" })] })), msg.twinReady && ((0, jsx_runtime_1.jsxs)("div", { className: "mt-3 flex flex-wrap gap-2", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setMessages(prev => [...prev, { role: 'assistant', content: 'Rollback preparado (placeholder).' }]), className: "px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-50 text-sm hover:bg-amber-500/30", children: "\uD83D\uDEE1\uFE0F Preparar rollback" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setMessages(prev => [...prev, { role: 'assistant', content: 'Continuar sem rollback (placeholder).' }]), className: "px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-slate-200 text-sm hover:bg-white/20", children: "Continuar sem rollback" })] })), msg.role === 'assistant' && msg.patches && msg.patches.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "mt-5 space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-emerald-200 text-sm font-semibold", children: [(0, jsx_runtime_1.jsx)("span", { children: "\uD83D\uDEE0\uFE0F Patches dispon\u00EDveis" }), (0, jsx_runtime_1.jsx)("span", { className: "px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs", children: msg.patches.length })] }), msg.patches.map((patch, idx) => ((0, jsx_runtime_1.jsxs)("div", { className: "rounded-lg border border-white/10 bg-black/20 p-3 flex flex-col gap-3", children: [(0, jsx_runtime_1.jsxs)("p", { className: "font-medium text-sm", children: ["\uD83D\uDCC4 ", patch.file] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 flex-wrap", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedPatch(patch), className: "px-3 py-2 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-indigo-50 text-sm hover:bg-indigo-500/30", children: "\uD83D\uDC41\uFE0F Visualizar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => applyPatch(patch), disabled: isLoading, className: "px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-50 text-sm disabled:opacity-50 hover:bg-emerald-500/30", children: "\u2705 Aplicar" })] })] }, idx)))] })), msg.role === 'assistant' && msg.tests && msg.tests.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "mt-5 space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-cyan-200 text-sm font-semibold", children: [(0, jsx_runtime_1.jsx)("span", { children: "\uD83E\uDDEA Testes gerados" }), (0, jsx_runtime_1.jsx)("span", { className: "px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-xs", children: msg.tests.length }), msg.tests.length > 1 && ((0, jsx_runtime_1.jsx)("button", { onClick: () => downloadAllTests(msg.tests), className: "ml-2 px-2 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 border border-white/10", children: "\u2B07\uFE0F Baixar todos" }))] }), msg.tests.map((t, idx) => ((0, jsx_runtime_1.jsxs)("div", { className: "rounded-lg border border-white/10 bg-black/20 p-3 flex flex-col gap-3", children: [(0, jsx_runtime_1.jsxs)("p", { className: "font-medium text-sm", children: ["\uD83D\uDCC4 ", t.file] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2 flex-wrap", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedTest(t), className: "px-3 py-2 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-indigo-50 text-sm hover:bg-indigo-500/30", children: "\uD83D\uDC41\uFE0F Visualizar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => downloadTest(t.file, t.content), className: "px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-50 text-sm hover:bg-cyan-500/30", children: "\u2B07\uFE0F Baixar" })] })] }, idx)))] })), msg.role === 'assistant' && msg.approvalRequired && ((0, jsx_runtime_1.jsx)("div", { className: "mt-5", children: (0, jsx_runtime_1.jsx)("button", { onClick: () => handleApproval(msg.approvalRequired), disabled: isLoading, className: "px-4 py-3 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-100 font-semibold disabled:opacity-50 animate-pulse", children: "\u2705 Aprovar e continuar execu\u00E7\u00E3o" }) })), msg.role === 'assistant' && msg.suggestOrchestrateText && ((0, jsx_runtime_1.jsxs)("div", { className: "mt-4 p-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-emerald-100 font-semibold mb-2", children: "Esta solicita\u00E7\u00E3o parece exigir agentes. Quer orquestrar?" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleOrchestrate(msg.suggestOrchestrateText, { files: uploadedFiles.map(f => f.name) }), className: "px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold", children: "Iniciar Orquestra\u00E7\u00E3o" })] }))] }) }, i))), isLoading && messages.length === 0 && ((0, jsx_runtime_1.jsx)("div", { className: "text-sm text-slate-300", children: "Processando reposit\u00F3rio e gerando an\u00E1lise..." }))] }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, className: "space-y-3", children: [uploadedFiles.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2", children: uploadedFiles.map((file, i) => ((0, jsx_runtime_1.jsxs)("div", { className: "px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("span", { children: file.name }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => removeFile(i), className: "text-rose-300 hover:text-rose-200", children: "\u00D7" })] }, i))) })), inlineSuggestions.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2 -mb-1", children: inlineSuggestions.map((sug, idx) => ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setInput(prev => (prev.trim().length ? `${prev.trim()} ${sug}` : sug)), className: "px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[12px] text-slate-100 hover:bg-white/20", children: sug }, idx))) })), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", value: input, onChange: (e) => {
                                                                    const val = e.target.value;
                                                                    setInput(val);
                                                                    setInlineSuggestions(computeSuggestions(val));
                                                                }, placeholder: agentRole === 'chat' ? 'Pergunte, pesquise, faça brainstorm...' : 'Peça análise, refatoração ou orquestração completa...', className: "flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/40", disabled: isLoading }), (0, jsx_runtime_1.jsx)("input", { type: "file", id: "file-upload", multiple: true, className: "hidden", onChange: (e) => handleFileUpload(e.target.files) }), (0, jsx_runtime_1.jsx)("label", { htmlFor: "file-upload", className: "px-3 py-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 text-lg", children: "\uD83D\uDCCE" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", disabled: isLoading || (!input.trim() && uploadedFiles.length === 0), className: "px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold disabled:opacity-50 shadow-lg shadow-emerald-500/30", children: "Enviar" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "glass rounded-2xl p-4 space-y-4", children: [(0, jsx_runtime_1.jsx)(AgentSelector_1.default, { value: agentRole, onChange: setAgentRole }), agentRole === 'chat' && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-slate-100 font-semibold", children: "Pesquisa profunda" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-slate-400", children: "Ativa modelo mais caro + busca contextual" })] }), (0, jsx_runtime_1.jsxs)("label", { className: "inline-flex items-center gap-2 cursor-pointer", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", className: "h-4 w-4 accent-emerald-500", checked: deepSearch, onChange: (e) => setDeepSearch(e.target.checked) }), (0, jsx_runtime_1.jsx)("span", { className: "text-xs text-slate-200", children: "Ligado" })] })] })), (0, jsx_runtime_1.jsxs)("div", { className: "rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-slate-300 leading-relaxed", children: [(0, jsx_runtime_1.jsx)("p", { className: "font-semibold text-slate-100 mb-1", children: "Dicas r\u00E1pidas" }), (0, jsx_runtime_1.jsxs)("ul", { className: "list-disc list-inside space-y-1", children: [(0, jsx_runtime_1.jsx)("li", { children: "Use Orquestrador para planos completos com aprova\u00E7\u00E3o." }), (0, jsx_runtime_1.jsx)("li", { children: "Habilite sandbox via contexto/ambiente para validar antes do executor." }), (0, jsx_runtime_1.jsx)("li", { children: "Importer repo p\u00FAblico ou privado (login GitHub para privado)." })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "glass rounded-2xl p-4 space-y-3", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-semibold text-white", children: "Importar reposit\u00F3rio" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", value: githubUrl, onChange: (e) => setGithubUrl(e.target.value), placeholder: "https://github.com/user/repo", className: "flex-1 px-3 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30", disabled: isLoading }), (0, jsx_runtime_1.jsx)("button", { onClick: handleImportRepo, disabled: isLoading || !githubUrl.trim(), className: "px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold disabled:opacity-50 shadow-md shadow-cyan-500/30", children: "Importar" })] }), !session && ((0, jsx_runtime_1.jsx)("p", { className: "text-xs text-slate-400", children: "Fa\u00E7a login com GitHub para importar privados." }))] }), (0, jsx_runtime_1.jsxs)("div", { className: "glass rounded-2xl p-4 space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm font-semibold text-white", children: "Merge (Executor)" }), mergeLoading && (0, jsx_runtime_1.jsx)("span", { className: "text-xs text-amber-200", children: "Solicitando..." })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-wrap gap-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", value: mergeOwner, onChange: (e) => setMergeOwner(e.target.value), placeholder: "owner", className: "flex-1 min-w-32 px-3 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30", disabled: isLoading }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: mergeRepo, onChange: (e) => setMergeRepo(e.target.value), placeholder: "repo", className: "flex-1 min-w-32 px-3 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30", disabled: isLoading }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: mergePrNumber, onChange: (e) => setMergePrNumber(e.target.value), placeholder: "PR #", className: "w-24 px-3 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/30", disabled: isLoading }), (0, jsx_runtime_1.jsx)("button", { onClick: handleMerge, disabled: mergeLoading || !mergeOwner.trim() || !mergeRepo.trim() || !mergePrNumber.trim(), className: "px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold disabled:opacity-50 shadow-md shadow-amber-500/30", children: "Merge PR" })] }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-slate-400", children: "Requer token GitHub com permiss\u00E3o de merge. Use com cautela." })] })] })] })] })] }), showAssistModal && ((0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4", onClick: () => { setShowAssistModal(false); setAssistOnboardingSeen(true); }, children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-slate-900 rounded-xl max-w-3xl w-full shadow-2xl border border-emerald-400/40", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "p-6 border-b border-white/10 flex justify-between items-center", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("p", { className: "text-xs text-emerald-200 uppercase tracking-wide", children: "LegacyAssist" }), (0, jsx_runtime_1.jsx)("h2", { className: "text-2xl font-bold text-emerald-100 mt-1", children: "Modo assistido \u2014 sem execu\u00E7\u00E3o autom\u00E1tica" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => { setShowAssistModal(false); setAssistOnboardingSeen(true); }, className: "text-3xl text-slate-300 hover:text-white", children: "\u00D7" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "p-6 space-y-4 text-slate-100 text-sm", children: [(0, jsx_runtime_1.jsx)("p", { children: "O LegacyAssist guia voc\u00EA em passos, sugere pesquisas (RAG/Web/Brainstorm) e valida\u00E7\u00F5es (Twin/Sandbox) antes de qualquer a\u00E7\u00E3o. Nada ser\u00E1 executado sem sua confirma\u00E7\u00E3o." }), (0, jsx_runtime_1.jsxs)("ul", { className: "list-disc list-inside space-y-2 text-slate-200", children: [(0, jsx_runtime_1.jsx)("li", { children: "Fluxo: Entender \u2192 Pesquisar \u2192 Validar \u2192 (Opcional) Orquestrar/Executar." }), (0, jsx_runtime_1.jsx)("li", { children: "Execu\u00E7\u00E3o bloqueada por padr\u00E3o; use CTA para abrir Orquestrador ou agentes." }), (0, jsx_runtime_1.jsx)("li", { children: "Para incidentes: acione Twin Builder e valide em sandbox fail-mode." })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "p-6 border-t border-white/10 flex justify-end gap-3", children: (0, jsx_runtime_1.jsx)("button", { onClick: () => { setShowAssistModal(false); setAssistOnboardingSeen(true); }, className: "px-5 py-3 rounded-lg bg-white/10 border border-white/20 text-slate-200", children: "Entendi, come\u00E7ar tour" }) })] }) })), selectedPatch && ((0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4", onClick: () => setSelectedPatch(null), children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-slate-900 rounded-xl max-w-7xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-white/10", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "p-6 border-b border-white/10 flex justify-between items-center", children: [(0, jsx_runtime_1.jsxs)("h2", { className: "text-2xl font-bold text-emerald-300", children: ["Preview do Patch: ", selectedPatch.file] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedPatch(null), className: "text-3xl text-slate-300 hover:text-white", children: "\u00D7" })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 overflow-auto", children: (0, jsx_runtime_1.jsx)(react_diff_viewer_continued_1.default, { oldValue: selectedPatch.original, newValue: selectedPatch.fixed, splitView: true, useDarkTheme: true, leftTitle: "C\u00F3digo Original", rightTitle: "C\u00F3digo Corrigido", styles: {
                                    contentText: { lineHeight: '1.6' },
                                    diffContainer: { fontFamily: 'monospace', fontSize: '14px' },
                                    line: { padding: '2px 4px' },
                                } }) }), (0, jsx_runtime_1.jsxs)("div", { className: "p-6 border-t border-white/10 flex justify-end gap-4", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedPatch(null), className: "px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-medium border border-white/10", children: "Fechar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                        applyPatch(selectedPatch);
                                        setSelectedPatch(null);
                                    }, disabled: isLoading, className: "px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg font-semibold disabled:opacity-50", children: "Aplicar este Patch" })] })] }) })), selectedTest && ((0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4", onClick: () => setSelectedTest(null), children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-white/10", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { className: "p-6 border-b border-white/10 flex justify-between items-center", children: [(0, jsx_runtime_1.jsxs)("h2", { className: "text-2xl font-bold text-emerald-300", children: ["Preview do Teste: ", selectedTest.file] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedTest(null), className: "text-3xl text-slate-300 hover:text-white", children: "\u00D7" })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 overflow-auto p-6", children: (0, jsx_runtime_1.jsx)("pre", { className: "whitespace-pre-wrap font-mono text-sm text-slate-100", children: selectedTest.content }) }), (0, jsx_runtime_1.jsxs)("div", { className: "p-6 border-t border-white/10 flex justify-end gap-4", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setSelectedTest(null), className: "px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-medium border border-white/10", children: "Fechar" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                                        downloadTest(selectedTest.file, selectedTest.content);
                                        setSelectedTest(null);
                                    }, className: "px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-lg font-semibold", children: "Baixar este Teste" })] })] }) }))] }));
}
