"use client"

import React, { useState, useRef, useEffect } from 'react'
import { 
  GitBranch, 
  ChevronDown, 
  Check, 
  Plus,
  Loader2,
  ExternalLink,
  X
} from 'lucide-react'
import { useActiveRepo, type ActiveRepo } from '@/lib/app-context'

interface RepoSelectorProps {
  onImportClick?: () => void
  onRepoSelected?: (repo: ActiveRepo) => void
  compact?: boolean
}

export default function RepoSelector({ onImportClick, onRepoSelected, compact = false }: RepoSelectorProps) {
  const { activeRepo, selectRepo, importedRepos, isLoadingRepo } = useActiveRepo()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const handleSelectRepo = async (repo: ActiveRepo) => {
    setIsOpen(false)
    await selectRepo(repo.id) // Carrega contexto automaticamente
    onRepoSelected?.(repo)
  }
  
  const handleClearRepo = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Não limpa mais, apenas fecha
    setIsOpen(false)
  }
  
  const statusColor = (status: ActiveRepo['status']) => {
    switch (status) {
      case 'ready': return 'bg-emerald-500'
      case 'indexing': return 'bg-amber-500 animate-pulse'
      case 'failed': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }
  
  const statusText = (status: ActiveRepo['status']) => {
    switch (status) {
      case 'ready': return 'Pronto'
      case 'indexing': return 'Indexando...'
      case 'failed': return 'Falhou'
      default: return status
    }
  }
  
  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoadingRepo}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-sm
            transition-all duration-200
            ${activeRepo 
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-100' 
              : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
            }
            ${isLoadingRepo ? 'opacity-70 cursor-wait' : ''}
          `}
        >
          {isLoadingRepo ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <GitBranch className="w-4 h-4" />
          )}
          <span className="max-w-[150px] truncate">
            {isLoadingRepo ? 'Carregando...' : (activeRepo?.name || 'Selecionar repo')}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <RepoDropdown 
            repos={importedRepos}
            activeRepo={activeRepo}
            onSelect={handleSelectRepo}
            onClear={handleClearRepo}
            onImport={onImportClick}
            statusColor={statusColor}
            statusText={statusText}
          />
        )}
      </div>
    )
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-3 p-3 rounded-xl
          transition-all duration-200 border
          ${activeRepo 
            ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50' 
            : 'bg-white/5 border-white/10 hover:border-white/20'
          }
        `}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${activeRepo ? 'bg-emerald-500/20' : 'bg-white/10'}`}>
            <GitBranch className={`w-5 h-5 ${activeRepo ? 'text-emerald-400' : 'text-slate-400'}`} />
          </div>
          <div className="flex flex-col items-start min-w-0">
            <span className={`text-sm font-medium truncate max-w-full ${activeRepo ? 'text-emerald-100' : 'text-slate-200'}`}>
              {activeRepo?.name || 'Nenhum repositório selecionado'}
            </span>
            {activeRepo ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className={`w-2 h-2 rounded-full ${statusColor(activeRepo.status)}`} />
                <span>{statusText(activeRepo.status)}</span>
                {activeRepo.branch && <span>• {activeRepo.branch}</span>}
              </div>
            ) : (
              <span className="text-xs text-slate-500">Clique para selecionar ou importar</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {activeRepo && (
            <button
              onClick={handleClearRepo}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
              title="Limpar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      {isOpen && (
        <RepoDropdown 
          repos={importedRepos}
          activeRepo={activeRepo}
          onSelect={handleSelectRepo}
          onClear={handleClearRepo}
          onImport={onImportClick}
          statusColor={statusColor}
          statusText={statusText}
          wide
        />
      )}
    </div>
  )
}

interface RepoDropdownProps {
  repos: ActiveRepo[]
  activeRepo: ActiveRepo | null
  onSelect: (repo: ActiveRepo) => void
  onClear: (e: React.MouseEvent) => void
  onImport?: () => void
  statusColor: (status: ActiveRepo['status']) => string
  statusText: (status: ActiveRepo['status']) => string
  wide?: boolean
}

function RepoDropdown({ 
  repos, 
  activeRepo, 
  onSelect, 
  onClear,
  onImport, 
  statusColor, 
  statusText,
  wide 
}: RepoDropdownProps) {
  return (
    <div className={`
      absolute top-full left-0 mt-2 z-50
      bg-slate-900 border border-white/10 rounded-xl shadow-2xl
      overflow-hidden
      ${wide ? 'w-full min-w-[300px]' : 'min-w-[250px]'}
    `}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10 bg-white/5">
        <p className="text-xs font-medium text-slate-400">
          {repos.length > 0 
            ? `${repos.length} repositório${repos.length > 1 ? 's' : ''} importado${repos.length > 1 ? 's' : ''}`
            : 'Nenhum repositório importado'
          }
        </p>
      </div>
      
      {/* Lista de repos */}
      <div className="max-h-[300px] overflow-y-auto">
        {repos.length === 0 ? (
          <div className="p-4 text-center">
            <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhum repositório ainda</p>
            <p className="text-xs text-slate-500 mt-1">Importe um para começar</p>
          </div>
        ) : (
          repos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => onSelect(repo)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5
                transition-colors text-left
                ${activeRepo?.id === repo.id 
                  ? 'bg-emerald-500/20' 
                  : 'hover:bg-white/5'
                }
              `}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200 truncate">
                    {repo.name}
                  </span>
                  {activeRepo?.id === repo.id && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusColor(repo.status)}`} />
                  <span className="text-xs text-slate-500">{statusText(repo.status)}</span>
                  {repo.branch && (
                    <span className="text-xs text-slate-600">• {repo.branch}</span>
                  )}
                </div>
              </div>
              
              {repo.url && (
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </button>
          ))
        )}
      </div>
      
      {/* Footer - Importar novo */}
      {onImport && (
        <div className="border-t border-white/10">
          <button
            onClick={onImport}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm
                       text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Importar novo repositório</span>
          </button>
        </div>
      )}
    </div>
  )
}
