"use client"

import type React from "react"
import { useState, useRef } from "react"
import {
  Send,
  Paperclip,
  X,
  ChevronDown,
  Sparkles,
  MessageSquare,
  Zap,
  Search,
  Eye,
  Wrench,
  FileCheck,
  Loader2,
} from "lucide-react"
import { AGENT_ROLES } from "../AgentSelector"

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  uploadedFiles: File[]
  onFileUpload: (files: FileList | null) => void
  onRemoveFile: (index: number) => void
  agentRole: string
  onAgentRoleChange: (role: string) => void
  deepSearch: boolean
  onDeepSearchChange: (value: boolean) => void
  compact?: boolean
}

const roleIcons: Record<string, React.ReactNode> = {
  legacyAssist: <Sparkles className="w-4 h-4" />,
  chat: <MessageSquare className="w-4 h-4" />,
  orchestrate: <Zap className="w-4 h-4" />,
  advisor: <Search className="w-4 h-4" />,
  operator: <Wrench className="w-4 h-4" />,
  reviewer: <Eye className="w-4 h-4" />,
  executor: <FileCheck className="w-4 h-4" />,
}

export default function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  uploadedFiles,
  onFileUpload,
  onRemoveFile,
  agentRole,
  onAgentRoleChange,
  deepSearch,
  onDeepSearchChange,
  compact,
}: ChatInputProps) {
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectedRole = AGENT_ROLES.find((r) => r.key === agentRole)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit(e)
    }
  }

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    target.style.height = "auto"
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`
  }

  return (
    <div className="space-y-3">
      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          {uploadedFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                       bg-secondary border border-border text-sm group"
            >
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input */}
      <form onSubmit={onSubmit} className="relative">
        <div className="glass rounded-2xl overflow-hidden shadow-lg">
          {/* Agent selector row */}
          {!compact && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAgentMenu(!showAgentMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                           bg-secondary/50 hover:bg-secondary
                           text-sm transition-colors"
                >
                  <span className="text-primary">{roleIcons[agentRole]}</span>
                  <span className="font-medium">{selectedRole?.label.split(" — ")[0]}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showAgentMenu ? "rotate-180" : ""}`}
                  />
                </button>

                {showAgentMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAgentMenu(false)} />
                    <div
                      className="absolute top-full left-0 mt-2 w-80 p-2
                                bg-popover border border-border rounded-xl shadow-2xl z-50
                                animate-scale-in origin-top-left"
                    >
                      {AGENT_ROLES.map((role) => (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => {
                            onAgentRoleChange(role.key)
                            setShowAgentMenu(false)
                          }}
                          className={`w-full text-left px-3 py-3 rounded-lg
                                    transition-colors ${
                                      agentRole === role.key
                                        ? "bg-primary/10 border border-primary/30"
                                        : "hover:bg-secondary border border-transparent"
                                    }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={agentRole === role.key ? "text-primary" : "text-muted-foreground"}>
                              {roleIcons[role.key]}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{role.label.split(" — ")[0]}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {agentRole === "chat" && (
                <button
                  type="button"
                  onClick={() => onDeepSearchChange(!deepSearch)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-sm transition-all duration-200 ${
                              deepSearch
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "bg-secondary/50 hover:bg-secondary text-muted-foreground"
                            }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Deep Search</span>
                </button>
              )}
            </div>
          )}

          {/* Text input */}
          <div className="flex items-end gap-3 p-4">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={(e) => onFileUpload(e.target.files)}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary
                       text-muted-foreground hover:text-foreground
                       transition-colors flex-shrink-0"
              title="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleTextareaInput}
                placeholder={
                  agentRole === "legacyAssist"
                    ? "Descreva o que voce precisa, eu guio voce..."
                    : agentRole === "chat"
                      ? "Pergunte, pesquise, faca brainstorm..."
                      : "Descreva sua tarefa de seguranca..."
                }
                rows={1}
                className="w-full bg-transparent resize-none text-base
                         placeholder:text-muted-foreground
                         focus:outline-none"
                style={{
                  minHeight: "28px",
                  maxHeight: "200px",
                }}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
              className="p-2.5 rounded-xl btn-primary disabled:opacity-50
                       disabled:cursor-not-allowed disabled:shadow-none flex-shrink-0"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </form>

      {/* Compact mode: show agent badge */}
      {compact && (
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>Modo:</span>
          <button
            type="button"
            onClick={() => setShowAgentMenu(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                     bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <span className="text-primary">{roleIcons[agentRole]}</span>
            <span className="font-medium">{selectedRole?.label.split(" — ")[0]}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showAgentMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAgentMenu(false)} />
              <div
                className="fixed bottom-24 left-1/2 -translate-x-1/2 w-80 p-2
                          bg-popover border border-border rounded-xl shadow-2xl z-50
                          animate-scale-in"
              >
                {AGENT_ROLES.map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => {
                      onAgentRoleChange(role.key)
                      setShowAgentMenu(false)
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm
                              transition-colors ${
                                agentRole === role.key ? "bg-primary/10 text-primary" : "hover:bg-secondary"
                              }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={agentRole === role.key ? "text-primary" : "text-muted-foreground"}>
                        {roleIcons[role.key]}
                      </span>
                      <span className="font-medium">{role.label.split(" — ")[0]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
