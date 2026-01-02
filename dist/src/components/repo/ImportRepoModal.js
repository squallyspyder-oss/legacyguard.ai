"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ImportRepoModal;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const react_2 = require("next-auth/react");
function ImportRepoModal({ isOpen, onClose, onImportComplete }) {
    const { status: sessionStatus } = (0, react_2.useSession)();
    const [mode, setMode] = (0, react_1.useState)("url");
    const [status, setStatus] = (0, react_1.useState)("idle");
    const [error, setError] = (0, react_1.useState)(null);
    const [ghRepos, setGhRepos] = (0, react_1.useState)([]);
    const [ghLoading, setGhLoading] = (0, react_1.useState)(false);
    const [ghSearch, setGhSearch] = (0, react_1.useState)("");
    // Git clone fields
    const [gitUrl, setGitUrl] = (0, react_1.useState)("");
    const [gitBranch, setGitBranch] = (0, react_1.useState)("main");
    // URL fields
    const [repoUrl, setRepoUrl] = (0, react_1.useState)("");
    // Local upload fields
    const [localFiles, setLocalFiles] = (0, react_1.useState)([]);
    const [localPath, setLocalPath] = (0, react_1.useState)("");
    // All hooks must be called before any conditional return
    const loadGithubRepos = (0, react_1.useCallback)(async () => {
        setGhLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/github/repos");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Falha ao listar repositórios");
            }
            const data = await res.json();
            setGhRepos(data.repos || []);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        }
        finally {
            setGhLoading(false);
        }
    }, []);
    (0, react_1.useEffect)(() => {
        if (isOpen && mode === "github" && sessionStatus === "authenticated" && ghRepos.length === 0 && !ghLoading) {
            loadGithubRepos();
        }
    }, [isOpen, mode, sessionStatus, ghRepos.length, ghLoading, loadGithubRepos]);
    const filteredRepos = (0, react_1.useMemo)(() => {
        if (!ghSearch.trim())
            return ghRepos;
        const q = ghSearch.toLowerCase();
        return ghRepos.filter((r) => r.fullName.toLowerCase().includes(q));
    }, [ghRepos, ghSearch]);
    // Early return AFTER all hooks
    if (!isOpen)
        return null;
    const resetForm = () => {
        setStatus("idle");
        setError(null);
        setGitUrl("");
        setGitBranch("main");
        setRepoUrl("");
        setLocalFiles([]);
        setLocalPath("");
        setGhRepos([]);
        setGhSearch("");
    };
    const handleClose = () => {
        resetForm();
        onClose();
    };
    // Parse GitHub/GitLab URL to extract owner/repo
    const parseRepoUrl = (url) => {
        const githubMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/i);
        if (githubMatch) {
            return { owner: githubMatch[1], repo: githubMatch[2], provider: "github" };
        }
        const gitlabMatch = url.match(/gitlab\.com[\/:]([^\/]+)\/([^\/\.]+)/i);
        if (gitlabMatch) {
            return { owner: gitlabMatch[1], repo: gitlabMatch[2], provider: "gitlab" };
        }
        return null;
    };
    // Handle Git Clone
    const handleGitClone = async () => {
        if (!gitUrl.trim()) {
            setError("URL do repositório é obrigatória");
            return;
        }
        setStatus("loading");
        setError(null);
        try {
            const res = await fetch("/api/index", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "clone",
                    gitUrl: gitUrl.trim(),
                    branch: gitBranch.trim() || "main",
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Erro ao clonar repositório");
            }
            const data = await res.json();
            setStatus("success");
            const parsed = parseRepoUrl(gitUrl);
            onImportComplete === null || onImportComplete === void 0 ? void 0 : onImportComplete({
                type: "git",
                name: (parsed === null || parsed === void 0 ? void 0 : parsed.repo) || gitUrl.split("/").pop() || "repo",
                url: gitUrl,
                branch: gitBranch,
                path: data.path,
                indexed: data.indexed,
            });
            setTimeout(handleClose, 1500);
        }
        catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        }
    };
    // Handle URL Import (public repo analysis)
    const handleUrlImport = async () => {
        if (!repoUrl.trim()) {
            setError("URL do repositório é obrigatória");
            return;
        }
        const parsed = parseRepoUrl(repoUrl);
        if (!parsed) {
            setError("URL inválida. Use uma URL do GitHub ou GitLab.");
            return;
        }
        setStatus("loading");
        setError(null);
        try {
            const res = await fetch("/api/index", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "index-url",
                    owner: parsed.owner,
                    repo: parsed.repo,
                    provider: parsed.provider,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Erro ao importar repositório");
            }
            const data = await res.json();
            setStatus("success");
            onImportComplete === null || onImportComplete === void 0 ? void 0 : onImportComplete({
                type: "url",
                name: `${parsed.owner}/${parsed.repo}`,
                url: repoUrl,
                indexed: data.indexed,
            });
            setTimeout(handleClose, 1500);
        }
        catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        }
    };
    // Handle Local Upload
    const handleLocalUpload = async () => {
        if (localFiles.length === 0 && !localPath.trim()) {
            setError("Selecione arquivos ou informe o caminho local");
            return;
        }
        setStatus("loading");
        setError(null);
        try {
            if (localFiles.length > 0) {
                // Upload files
                const formData = new FormData();
                formData.append("action", "upload");
                localFiles.forEach((file) => formData.append("files", file));
                const res = await fetch("/api/index", {
                    method: "POST",
                    body: formData,
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Erro ao fazer upload");
                }
                const data = await res.json();
                setStatus("success");
                onImportComplete === null || onImportComplete === void 0 ? void 0 : onImportComplete({
                    type: "local",
                    name: localFiles[0].name.replace(/\.[^/.]+$/, "") || "upload",
                    path: data.path,
                    indexed: data.indexed,
                });
            }
            else {
                // Index local path
                const res = await fetch("/api/index", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "index-local",
                        path: localPath.trim(),
                    }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Erro ao indexar caminho local");
                }
                const data = await res.json();
                setStatus("success");
                onImportComplete === null || onImportComplete === void 0 ? void 0 : onImportComplete({
                    type: "local",
                    name: localPath.split("/").pop() || "local",
                    path: localPath,
                    indexed: data.indexed,
                });
            }
            setTimeout(handleClose, 1500);
        }
        catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        }
    };
    const handleSubmit = () => {
        switch (mode) {
            case "git":
                handleGitClone();
                break;
            case "url":
                handleUrlImport();
                break;
            case "local":
                handleLocalUpload();
                break;
            case "github":
                // handled via button per repo
                break;
        }
    };
    const handleGithubClone = async (repo) => {
        setStatus("loading");
        setError(null);
        try {
            const res = await fetch("/api/index", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "clone-github",
                    owner: repo.owner || repo.fullName.split("/")[0],
                    repo: repo.name,
                    branch: repo.defaultBranch,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Erro ao clonar repositório do GitHub");
            }
            const data = await res.json();
            setStatus("success");
            onImportComplete === null || onImportComplete === void 0 ? void 0 : onImportComplete({
                type: "git",
                name: repo.fullName,
                url: repo.htmlUrl,
                branch: repo.defaultBranch,
                path: data.path,
                indexed: data.indexed,
            });
            setTimeout(handleClose, 1500);
        }
        catch (err) {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Erro desconhecido");
        }
    };
    const handleFileChange = (e) => {
        if (e.target.files) {
            setLocalFiles(Array.from(e.target.files));
        }
    };
    const modes = [
        {
            id: "github",
            icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Github, { className: "w-5 h-5" }),
            label: "GitHub",
            description: "Repos conectados",
        },
        {
            id: "url",
            icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Link, { className: "w-5 h-5" }),
            label: "URL Pública",
            description: "GitHub, GitLab público"
        },
        {
            id: "git",
            icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Terminal, { className: "w-5 h-5" }),
            label: "Git Clone",
            description: "Clone via SSH/HTTPS"
        },
        {
            id: "local",
            icon: (0, jsx_runtime_1.jsx)(lucide_react_1.Upload, { className: "w-5 h-5" }),
            label: "Local",
            description: "Upload ou caminho local"
        },
    ];
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-fade-in", onClick: handleClose }), (0, jsx_runtime_1.jsx)("div", { className: "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 animate-scale-in", children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-card border border-border rounded-2xl shadow-2xl overflow-hidden", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("div", { className: "p-2 rounded-xl bg-primary/10 text-primary", children: (0, jsx_runtime_1.jsx)(lucide_react_1.GitBranch, { className: "w-5 h-5" }) }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { className: "text-lg font-bold", children: "Importar Reposit\u00F3rio" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Escolha como deseja importar" })] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: handleClose, className: "p-2 rounded-lg hover:bg-secondary transition-colors", "aria-label": "Fechar modal de importacao", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "w-5 h-5" }) })] }), (0, jsx_runtime_1.jsx)("div", { className: "px-6 py-4 border-b border-border bg-secondary/20", children: (0, jsx_runtime_1.jsx)("div", { className: "grid grid-cols-3 gap-2", children: modes.map((m) => ((0, jsx_runtime_1.jsxs)("button", { onClick: () => { setMode(m.id); setError(null); }, disabled: status === "loading", className: `
                    flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
                    ${mode === m.id
                                        ? "bg-primary/10 border-primary/50 text-primary"
                                        : "bg-card border-border hover:border-primary/30"}
                    ${status === "loading" ? "opacity-50 cursor-not-allowed" : ""}
                  `, children: [m.icon, (0, jsx_runtime_1.jsx)("span", { className: "text-xs font-medium", children: m.label })] }, m.id))) }) }), (0, jsx_runtime_1.jsxs)("div", { className: "p-6 space-y-4", children: [status === "success" && ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col items-center gap-3 py-6", children: [(0, jsx_runtime_1.jsx)("div", { className: "p-3 rounded-full bg-emerald-500/10 text-emerald-500", children: (0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle2, { className: "w-8 h-8" }) }), (0, jsx_runtime_1.jsx)("p", { className: "text-lg font-semibold", children: "Reposit\u00F3rio importado!" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Indexa\u00E7\u00E3o em andamento..." })] })), error && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.AlertCircle, { className: "w-5 h-5 shrink-0" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm", children: error })] })), mode === "url" && status !== "success" && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Cole a URL de um reposit\u00F3rio p\u00FAblico do GitHub ou GitLab." }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm font-medium", children: "URL do Reposit\u00F3rio" }), (0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Github, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" }), (0, jsx_runtime_1.jsx)("input", { type: "url", value: repoUrl, onChange: (e) => setRepoUrl(e.target.value), placeholder: "https://github.com/owner/repo", disabled: status === "loading", className: "w-full pl-11 pr-4 py-3 rounded-xl bg-secondary border border-border\n                               text-foreground placeholder:text-muted-foreground\n                               focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40\n                               disabled:opacity-50" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.ExternalLink, { className: "w-3 h-3" }), (0, jsx_runtime_1.jsx)("span", { children: "Suporta GitHub e GitLab p\u00FAblicos" })] })] })), mode === "github" && status !== "success" && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [sessionStatus !== "authenticated" && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Conecte-se com GitHub para listar seus reposit\u00F3rios e importar sem informar URL." }), (0, jsx_runtime_1.jsxs)("button", { onClick: () => (0, react_2.signIn)("github"), className: "w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Github, { className: "w-5 h-5" }), (0, jsx_runtime_1.jsx)("span", { children: "Conectar GitHub" })] })] })), sessionStatus === "authenticated" && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Github, { className: "w-4 h-4" }), (0, jsx_runtime_1.jsx)("span", { children: "Reposit\u00F3rios" }), ghLoading && (0, jsx_runtime_1.jsx)(lucide_react_1.Loader2, { className: "w-4 h-4 animate-spin" })] }), (0, jsx_runtime_1.jsxs)("button", { onClick: loadGithubRepos, disabled: ghLoading, className: "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border hover:border-primary/40 disabled:opacity-50", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.RefreshCw, { className: "w-4 h-4" }), " Atualizar"] })] }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: ghSearch, onChange: (e) => setGhSearch(e.target.value), placeholder: "Buscar...", className: "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" }), (0, jsx_runtime_1.jsxs)("div", { className: "max-h-64 overflow-y-auto space-y-2", children: [ghLoading && (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Carregando reposit\u00F3rios..." }), !ghLoading && filteredRepos.length === 0 && ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Nenhum reposit\u00F3rio encontrado." })), !ghLoading && filteredRepos.map((repo) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/40 transition", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-0.5", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-medium text-sm", children: repo.fullName }), (0, jsx_runtime_1.jsxs)("span", { className: "text-xs text-muted-foreground", children: [repo.private ? "Privado" : "Público", " \u2022 Branch: ", repo.defaultBranch] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => handleGithubClone(repo), disabled: status === "loading", className: "px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50", children: "Importar" })] }, repo.id)))] })] }))] })), mode === "git" && status !== "success" && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Clone um reposit\u00F3rio via Git. Requer autentica\u00E7\u00E3o para repos privados." }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm font-medium", children: "URL Git (HTTPS ou SSH)" }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: gitUrl, onChange: (e) => setGitUrl(e.target.value), placeholder: "https://github.com/owner/repo.git", disabled: status === "loading", className: "w-full px-4 py-3 rounded-xl bg-secondary border border-border\n                             text-foreground placeholder:text-muted-foreground\n                             focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40\n                             disabled:opacity-50" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm font-medium", children: "Branch" }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: gitBranch, onChange: (e) => setGitBranch(e.target.value), placeholder: "main", disabled: status === "loading", className: "w-full px-4 py-3 rounded-xl bg-secondary border border-border\n                             text-foreground placeholder:text-muted-foreground\n                             focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40\n                             disabled:opacity-50" })] }), (0, jsx_runtime_1.jsx)("div", { className: "p-3 rounded-xl bg-amber-500/10 border border-amber-500/30", children: (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-amber-400", children: "\uD83D\uDCA1 Para reposit\u00F3rios privados, fa\u00E7a login com GitHub primeiro." }) })] })), mode === "local" && status !== "success" && ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Fa\u00E7a upload de arquivos ou informe o caminho de um projeto local." }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm font-medium", children: "Upload de Arquivos" }), (0, jsx_runtime_1.jsxs)("label", { className: `
                      flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed
                      transition-colors cursor-pointer
                      ${localFiles.length > 0
                                                        ? "border-primary/50 bg-primary/5"
                                                        : "border-border hover:border-primary/30 hover:bg-secondary/50"}
                      ${status === "loading" ? "opacity-50 cursor-not-allowed" : ""}
                    `, children: [(0, jsx_runtime_1.jsx)("input", { type: "file", multiple: true, 
                                                            // @ts-expect-error - webkitdirectory is a valid attribute for folder selection
                                                            webkitdirectory: "", onChange: handleFileChange, disabled: status === "loading", className: "hidden" }), (0, jsx_runtime_1.jsx)(lucide_react_1.FolderOpen, { className: "w-8 h-8 text-muted-foreground" }), localFiles.length > 0 ? ((0, jsx_runtime_1.jsxs)("p", { className: "text-sm text-primary font-medium", children: [localFiles.length, " arquivo(s) selecionado(s)"] })) : ((0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted-foreground", children: "Clique ou arraste arquivos/pasta aqui" }))] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsx)("div", { className: "absolute inset-0 flex items-center", children: (0, jsx_runtime_1.jsx)("div", { className: "w-full border-t border-border" }) }), (0, jsx_runtime_1.jsx)("div", { className: "relative flex justify-center text-xs uppercase", children: (0, jsx_runtime_1.jsx)("span", { className: "bg-card px-2 text-muted-foreground", children: "ou" }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-2", children: [(0, jsx_runtime_1.jsx)("label", { className: "text-sm font-medium", children: "Caminho Local" }), (0, jsx_runtime_1.jsx)("input", { type: "text", value: localPath, onChange: (e) => setLocalPath(e.target.value), placeholder: "/home/user/meu-projeto", disabled: status === "loading" || localFiles.length > 0, className: "w-full px-4 py-3 rounded-xl bg-secondary border border-border\n                             text-foreground placeholder:text-muted-foreground\n                             focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40\n                             disabled:opacity-50" })] })] }))] }), status !== "success" && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/20", children: [(0, jsx_runtime_1.jsx)("button", { onClick: handleClose, disabled: status === "loading", className: "px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors\n                         disabled:opacity-50", children: "Cancelar" }), (0, jsx_runtime_1.jsx)("button", { onClick: handleSubmit, disabled: status === "loading", className: "flex items-center gap-2 px-5 py-2 rounded-lg btn-primary text-sm font-medium\n                         disabled:opacity-50", children: status === "loading" ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Loader2, { className: "w-4 h-4 animate-spin" }), (0, jsx_runtime_1.jsx)("span", { children: "Importando..." })] })) : ((0, jsx_runtime_1.jsx)("span", { children: "Importar" })) })] }))] }) })] }));
}
