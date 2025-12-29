"use client"

import type React from "react"
import type { Message } from "./ChatContainer"
import { User, Bot, AlertTriangle, FileCode, TestTube, Sparkles, Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react"
import { useState } from "react"

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  onSwitchAgent?: (agent: string, prompt?: string) => void
}

export default function MessageList({ messages, isLoading, onSwitchAgent }: MessageListProps) {
  return (
    <div className="space-y-6">
      {messages.map((msg, i) => (
        <MessageBubble key={msg.id} message={msg} index={i} onSwitchAgent={onSwitchAgent} />
      ))}

      {isLoading && (
        <div className="flex gap-4 animate-fade-in-up">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 pt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
              <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, index, onSwitchAgent }: { message: Message; index: number; onSwitchAgent?: (agent: string, prompt?: string) => void }) {
  const isUser = message.role === "user"
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Handler para links especiais de troca de agente
  const handleLinkClick = (href: string) => {
    if (href === '#switch-orchestrate') {
      onSwitchAgent?.('orchestrate', message.suggestOrchestrateText)
    }
  }

  return (
    <div className="flex gap-4 animate-fade-in-up group" style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}>
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          isUser ? "bg-secondary" : "bg-primary/15"
        }`}
      >
        {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5 text-primary" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{isUser ? "Voce" : "LegacyGuard"}</span>
          {message.agentRole && message.agentRole !== "chat" && !isUser && (
            <span className="badge badge-primary text-[10px]">
              <Sparkles className="w-3 h-3 mr-1" />
              {message.agentRole}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Message content */}
        <div className={`rounded-2xl px-4 py-3 ${isUser ? "message-user" : "message-assistant"}`}>
          <div className="prose prose-sm prose-invert max-w-none prose-dark">
            <FormattedContent content={message.content} onLinkClick={handleLinkClick} />
          </div>
        </div>

        {/* Actions */}
        {!isUser && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Copiar"
            >
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Util"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Nao util"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Patches */}
        {message.patches && message.patches.length > 0 && (
          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <FileCode className="w-4 h-4" />
              <span>Patches disponiveis ({message.patches.length})</span>
            </div>
            {message.patches.map((patch, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-card border border-border card-interactive">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-primary">{patch.file}</span>
                  <div className="flex gap-2">
                    <button className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors font-medium">
                      Ver diff
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded-lg btn-primary font-medium">Aplicar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tests */}
        {message.tests && message.tests.length > 0 && (
          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
              <TestTube className="w-4 h-4" />
              <span>Testes gerados ({message.tests.length})</span>
            </div>
            {message.tests.map((test, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-card border border-border card-interactive">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono">{test.file}</span>
                  <button className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-medium">
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Twin Builder offer */}
        {message.twinOffer && (
          <div className="flex gap-2 mt-4">
            <button className="text-sm px-4 py-2.5 rounded-xl btn-primary font-medium">Acionar Twin Builder</button>
            <button className="text-sm px-4 py-2.5 rounded-xl btn-secondary font-medium">Agora nao</button>
          </div>
        )}

        {/* Approval required */}
        {message.approvalRequired && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">Aprovacao necessaria</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">Esta acao requer sua aprovacao antes de prosseguir.</p>
            <button className="text-sm px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors font-medium">
              Aprovar e continuar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FormattedContent({ content, onLinkClick }: { content: string; onLinkClick?: (href: string) => void }) {
  const lines = content.split("\n")

  return (
    <>
      {lines.map((line, i) => {
        // Headers
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">
              {line.slice(3)}
            </h2>
          )
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold text-foreground my-2">
              {line.slice(2, -2)}
            </p>
          )
        }

        // List items
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <li key={i} className="ml-4 my-1">
              {formatInlineText(line.slice(2), onLinkClick)}
            </li>
          )
        }

        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          return (
            <li key={i} className="ml-4 my-1 list-decimal">
              {formatInlineText(line.replace(/^\d+\.\s/, ""), onLinkClick)}
            </li>
          )
        }

        // Empty line
        if (!line.trim()) {
          return <br key={i} />
        }

        return <p key={i}>{formatInlineText(line, onLinkClick)}</p>
      })}
    </>
  )
}

function formatInlineText(text: string, onLinkClick?: (href: string) => void) {
  // Links markdown [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const boldRegex = /\*\*(.*?)\*\*/g
  
  // Primeiro, processa links
  if (linkRegex.test(text)) {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    linkRegex.lastIndex = 0
    
    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`t-${lastIndex}`}>{formatBoldText(text.slice(lastIndex, match.index))}</span>)
      }
      const linkText = match[1]
      const href = match[2]
      
      if (href.startsWith('#switch-')) {
        parts.push(
          <button
            key={`l-${match.index}`}
            onClick={() => onLinkClick?.(href)}
            className="text-primary hover:underline font-medium cursor-pointer"
          >
            {linkText}
          </button>
        )
      } else {
        parts.push(
          <a key={`l-${match.index}`} href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {linkText}
          </a>
        )
      }
      lastIndex = match.index + match[0].length
    }
    
    if (lastIndex < text.length) {
      parts.push(<span key={`t-${lastIndex}`}>{formatBoldText(text.slice(lastIndex))}</span>)
    }
    
    return <>{parts}</>
  }
  
  return formatBoldText(text)
}

function formatBoldText(text: string) {
  // Bold text
  if (text.includes("**")) {
    const parts = text.split(/\*\*(.*?)\*\*/g)
    return (
      <>
        {parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="font-semibold text-foreground">
              {part}
            </strong>
          ) : (
            <span key={j}>{part}</span>
          ),
        )}
      </>
    )
  }
  return text
}
