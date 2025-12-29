"use client"

import { X, Sparkles, ArrowRight } from "lucide-react"

interface FloatingSuggestionsProps {
  suggestions: string[]
  visible: boolean
  onSelect: (suggestion: string) => void
  onDismiss: () => void
}

export default function FloatingSuggestions({ suggestions, visible, onSelect, onDismiss }: FloatingSuggestionsProps) {
  if (!visible || suggestions.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 px-4 pb-3 animate-fade-in-up">
      <div className="max-w-3xl mx-auto">
        <div className="bg-card/90 backdrop-blur-xl border border-border rounded-xl p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Sugestoes</span>
            </div>
            <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary transition-colors">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(suggestion)}
                className="
                  flex items-center gap-2 px-3 py-2 rounded-lg
                  bg-secondary/50 border border-border
                  hover:bg-primary/10 hover:border-primary/30 hover:text-primary
                  text-sm transition-all duration-200 group
                "
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <span>{suggestion}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
