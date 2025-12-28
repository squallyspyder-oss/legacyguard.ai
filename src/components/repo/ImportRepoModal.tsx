"use client"

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react"
import { 
  X, 
  GitBranch, 
  Link, 
  Upload, 
  FolderOpen, 
  Github, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Terminal,
  RefreshCw
} from "lucide-react"
import { signIn, useSession } from "next-auth/react"

interface ImportRepoModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: (repoInfo: RepoInfo) => void
}

export interface RepoInfo {
  type: "git" | "url" | "local"
  name: string
  path?: string
  url?: string
  branch?: string
  indexed?: boolean
}

type ImportMode = "git" | "url" | "local" | "github"
type ImportStatus = "idle" | "loading" | "success" | "error"

type GithubRepo = {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
  cloneUrl: string
  owner?: string
}

export default function ImportRepoModal({ isOpen, onClose, onImportComplete }: ImportRepoModalProps) {
  const { data: session, status: sessionStatus } = useSession()
  const [mode, setMode] = useState<ImportMode>("url")
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [ghRepos, setGhRepos] = useState<GithubRepo[]>([])
  const [ghLoading, setGhLoading] = useState(false)
  const [ghSearch, setGhSearch] = useState("")
  
  // Git clone fields
  const [gitUrl, setGitUrl] = useState("")
  const [gitBranch, setGitBranch] = useState("main")
  
  // URL fields
  const [repoUrl, setRepoUrl] = useState("")
  
  // Local upload fields
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [localPath, setLocalPath] = useState("")

  if (!isOpen) return null

  const resetForm = () => {
    setStatus("idle")
    setError(null)
    setGitUrl("")
    setGitBranch("main")
    setRepoUrl("")
    setLocalFiles([])
    setLocalPath("")
    setGhRepos([])
    setGhSearch("")
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  // Parse GitHub/GitLab URL to extract owner/repo
  const parseRepoUrl = (url: string): { owner: string; repo: string; provider: string } | null => {
    const githubMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/i)
    if (githubMatch) {
      return { owner: githubMatch[1], repo: githubMatch[2], provider: "github" }
    }
    const gitlabMatch = url.match(/gitlab\.com[\/:]([^\/]+)\/([^\/\.]+)/i)
    if (gitlabMatch) {
      return { owner: gitlabMatch[1], repo: gitlabMatch[2], provider: "gitlab" }
    }
    return null
  }

  // Handle Git Clone
  const handleGitClone = async () => {
    if (!gitUrl.trim()) {
      setError("URL do repositório é obrigatória")
      return
    }

    setStatus("loading")
    setError(null)

    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          gitUrl: gitUrl.trim(),
          branch: gitBranch.trim() || "main",
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao clonar repositório")
      }

      const data = await res.json()
      setStatus("success")
      
      const parsed = parseRepoUrl(gitUrl)
      onImportComplete?.({
        type: "git",
        name: parsed?.repo || gitUrl.split("/").pop() || "repo",
        url: gitUrl,
        branch: gitBranch,
        path: data.path,
        indexed: data.indexed,
      })

      setTimeout(handleClose, 1500)
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    }
  }

  // Handle URL Import (public repo analysis)
  const handleUrlImport = async () => {
    if (!repoUrl.trim()) {
      setError("URL do repositório é obrigatória")
      return
    }

    const parsed = parseRepoUrl(repoUrl)
    if (!parsed) {
      setError("URL inválida. Use uma URL do GitHub ou GitLab.")
      return
    }

    setStatus("loading")
    setError(null)

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
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao importar repositório")
      }

      const data = await res.json()
      setStatus("success")
      
      onImportComplete?.({
        type: "url",
        name: `${parsed.owner}/${parsed.repo}`,
        url: repoUrl,
        indexed: data.indexed,
      })

      setTimeout(handleClose, 1500)
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    }
  }

  // Handle Local Upload
  const handleLocalUpload = async () => {
    if (localFiles.length === 0 && !localPath.trim()) {
      setError("Selecione arquivos ou informe o caminho local")
      return
    }

    setStatus("loading")
    setError(null)

    try {
      if (localFiles.length > 0) {
        // Upload files
        const formData = new FormData()
        formData.append("action", "upload")
        localFiles.forEach((file) => formData.append("files", file))

        const res = await fetch("/api/index", {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Erro ao fazer upload")
        }

        const data = await res.json()
        setStatus("success")
        
        onImportComplete?.({
          type: "local",
          name: localFiles[0].name.replace(/\.[^/.]+$/, "") || "upload",
          path: data.path,
          indexed: data.indexed,
        })
      } else {
        // Index local path
        const res = await fetch("/api/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "index-local",
            path: localPath.trim(),
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Erro ao indexar caminho local")
        }

        const data = await res.json()
        setStatus("success")
        
        onImportComplete?.({
          type: "local",
          name: localPath.split("/").pop() || "local",
          path: localPath,
          indexed: data.indexed,
        })
      }

      setTimeout(handleClose, 1500)
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    }
  }

  const handleSubmit = () => {
    switch (mode) {
      case "git":
        handleGitClone()
        break
      case "url":
        handleUrlImport()
        break
      case "local":
        handleLocalUpload()
        break
      case "github":
        // handled via button per repo
        break
    }
  }

  const loadGithubRepos = useCallback(async () => {
    setGhLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/github/repos")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Falha ao listar repositórios")
      }
      const data = await res.json()
      setGhRepos(data.repos || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setGhLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mode === "github" && sessionStatus === "authenticated" && ghRepos.length === 0 && !ghLoading) {
      loadGithubRepos()
    }
  }, [mode, sessionStatus, ghRepos.length, ghLoading, loadGithubRepos])

  const filteredRepos = useMemo(() => {
    if (!ghSearch.trim()) return ghRepos
    const q = ghSearch.toLowerCase()
    return ghRepos.filter((r) => r.fullName.toLowerCase().includes(q))
  }, [ghRepos, ghSearch])

  const handleGithubClone = async (repo: GithubRepo) => {
    setStatus("loading")
    setError(null)
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
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao clonar repositório do GitHub")
      }

      const data = await res.json()
      setStatus("success")

      onImportComplete?.({
        type: "git",
        name: repo.fullName,
        url: repo.htmlUrl,
        branch: repo.defaultBranch,
        path: data.path,
        indexed: data.indexed,
      })

      setTimeout(handleClose, 1500)
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setLocalFiles(Array.from(e.target.files))
    }
  }

  const modes = [
    {
      id: "github" as const,
      icon: <Github className="w-5 h-5" />, 
      label: "GitHub",
      description: "Repos conectados",
    },
    { 
      id: "url" as const, 
      icon: <Link className="w-5 h-5" />, 
      label: "URL Pública",
      description: "GitHub, GitLab público"
    },
    { 
      id: "git" as const, 
      icon: <Terminal className="w-5 h-5" />, 
      label: "Git Clone",
      description: "Clone via SSH/HTTPS"
    },
    { 
      id: "local" as const, 
      icon: <Upload className="w-5 h-5" />, 
      label: "Local",
      description: "Upload ou caminho local"
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-fade-in" 
        onClick={handleClose} 
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 animate-scale-in">
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Importar Repositório</h2>
                <p className="text-sm text-muted-foreground">Escolha como deseja importar</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Selector */}
          <div className="px-6 py-4 border-b border-border bg-secondary/20">
            <div className="grid grid-cols-3 gap-2">
              {modes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setError(null); }}
                  disabled={status === "loading"}
                  className={`
                    flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
                    ${mode === m.id 
                      ? "bg-primary/10 border-primary/50 text-primary" 
                      : "bg-card border-border hover:border-primary/30"
                    }
                    ${status === "loading" ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  {m.icon}
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Success State */}
            {status === "success" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <p className="text-lg font-semibold">Repositório importado!</p>
                <p className="text-sm text-muted-foreground">Indexação em andamento...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* URL Mode */}
            {mode === "url" && status !== "success" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Cole a URL de um repositório público do GitHub ou GitLab.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">URL do Repositório</label>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="url"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      disabled={status === "loading"}
                      className="w-full pl-11 pr-4 py-3 rounded-xl bg-secondary border border-border
                               text-foreground placeholder:text-muted-foreground
                               focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                               disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ExternalLink className="w-3 h-3" />
                  <span>Suporta GitHub e GitLab públicos</span>
                </div>
              </div>
            )}

            {/* GitHub connected mode */}
            {mode === "github" && status !== "success" && (
              <div className="space-y-4">
                {sessionStatus !== "authenticated" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Conecte-se com GitHub para listar seus repositórios e importar sem informar URL.
                    </p>
                    <button
                      onClick={() => signIn("github")}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90"
                    >
                      <Github className="w-5 h-5" />
                      <span>Conectar GitHub</span>
                    </button>
                  </div>
                )}

                {sessionStatus === "authenticated" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Github className="w-4 h-4" />
                        <span>Repositórios</span>
                        {ghLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      </div>
                      <button
                        onClick={loadGithubRepos}
                        disabled={ghLoading}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border hover:border-primary/40 disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" /> Atualizar
                      </button>
                    </div>
                    <input
                      type="text"
                      value={ghSearch}
                      onChange={(e) => setGhSearch(e.target.value)}
                      placeholder="Buscar..."
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                    />
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {ghLoading && <p className="text-sm text-muted-foreground">Carregando repositórios...</p>}
                      {!ghLoading && filteredRepos.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum repositório encontrado.</p>
                      )}
                      {!ghLoading && filteredRepos.map((repo) => (
                        <div
                          key={repo.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/40 transition"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{repo.fullName}</span>
                            <span className="text-xs text-muted-foreground">
                              {repo.private ? "Privado" : "Público"} • Branch: {repo.defaultBranch}
                            </span>
                          </div>
                          <button
                            onClick={() => handleGithubClone(repo)}
                            disabled={status === "loading"}
                            className="px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            Importar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Git Clone Mode */}
            {mode === "git" && status !== "success" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Clone um repositório via Git. Requer autenticação para repos privados.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">URL Git (HTTPS ou SSH)</label>
                  <input
                    type="text"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo.git"
                    disabled={status === "loading"}
                    className="w-full px-4 py-3 rounded-xl bg-secondary border border-border
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                             disabled:opacity-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Branch</label>
                  <input
                    type="text"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    placeholder="main"
                    disabled={status === "loading"}
                    className="w-full px-4 py-3 rounded-xl bg-secondary border border-border
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                             disabled:opacity-50"
                  />
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-400">
                    💡 Para repositórios privados, faça login com GitHub primeiro.
                  </p>
                </div>
              </div>
            )}

            {/* Local Mode */}
            {mode === "local" && status !== "success" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Faça upload de arquivos ou informe o caminho de um projeto local.
                </p>
                
                {/* File Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Upload de Arquivos</label>
                  <label
                    className={`
                      flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed
                      transition-colors cursor-pointer
                      ${localFiles.length > 0 
                        ? "border-primary/50 bg-primary/5" 
                        : "border-border hover:border-primary/30 hover:bg-secondary/50"
                      }
                      ${status === "loading" ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                  >
                    <input
                      type="file"
                      multiple
                      // @ts-expect-error - webkitdirectory is a valid attribute for folder selection
                      webkitdirectory=""
                      onChange={handleFileChange}
                      disabled={status === "loading"}
                      className="hidden"
                    />
                    <FolderOpen className="w-8 h-8 text-muted-foreground" />
                    {localFiles.length > 0 ? (
                      <p className="text-sm text-primary font-medium">
                        {localFiles.length} arquivo(s) selecionado(s)
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Clique ou arraste arquivos/pasta aqui
                      </p>
                    )}
                  </label>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>

                {/* Local Path */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Caminho Local</label>
                  <input
                    type="text"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="/home/user/meu-projeto"
                    disabled={status === "loading" || localFiles.length > 0}
                    className="w-full px-4 py-3 rounded-xl bg-secondary border border-border
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40
                             disabled:opacity-50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {status !== "success" && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/20">
              <button
                onClick={handleClose}
                disabled={status === "loading"}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors
                         disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={status === "loading"}
                className="flex items-center gap-2 px-5 py-2 rounded-lg btn-primary text-sm font-medium
                         disabled:opacity-50"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <span>Importar</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
