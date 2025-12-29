"use client"

import { signIn } from "next-auth/react"
import { X, Github, Mail, KeyRound, Sparkles } from "lucide-react"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  mode?: "login" | "signup"
}

export default function AuthModal({ isOpen, onClose, mode = "login" }: AuthModalProps) {
  if (!isOpen) return null

  const isSignup = mode === "signup"

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-fade-in" 
        onClick={onClose} 
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 animate-scale-in">
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative px-6 pt-8 pb-6 text-center border-b border-border bg-linear-to-b from-primary/5 to-transparent">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            
            <h2 className="text-2xl font-bold">
              {isSignup ? "Criar conta" : "Bem-vindo de volta"}
            </h2>
            <p className="text-muted-foreground mt-2">
              {isSignup 
                ? "Comece a proteger seu código legado" 
                : "Entre para continuar usando o LegacyGuard"
              }
            </p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* GitHub OAuth */}
            <button
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl
                       bg-[#24292e] hover:bg-[#2d3339] text-white font-medium
                       transition-colors duration-200"
            >
              <Github className="w-5 h-5" />
              <span>Continuar com GitHub</span>
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            {/* Email option (placeholder) */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl
                       bg-secondary border border-border text-muted-foreground
                       opacity-50 cursor-not-allowed"
            >
              <Mail className="w-5 h-5" />
              <span>Continuar com Email (em breve)</span>
            </button>

            {/* SSO option (placeholder) */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl
                       bg-secondary border border-border text-muted-foreground
                       opacity-50 cursor-not-allowed"
            >
              <KeyRound className="w-5 h-5" />
              <span>SSO Corporativo (em breve)</span>
            </button>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-secondary/30 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Ao continuar, você concorda com nossos{" "}
              <a href="#" className="text-primary hover:underline">Termos de Uso</a>
              {" "}e{" "}
              <a href="#" className="text-primary hover:underline">Política de Privacidade</a>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
