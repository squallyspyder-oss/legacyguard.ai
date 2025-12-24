import React from 'react';

export const AGENT_ROLES = [
  { key: 'legacyAssist', label: '🧭 LegacyAssist — Guia Assistido', description: 'Assistente do sistema: orienta próximos passos, sugere pesquisas (web/RAG) e mostra caminhos guiados' },
  { key: 'chat', label: '💬 Chat Livre — Pesquisa/Brainstorm', description: 'Perguntas rápidas, pesquisa leve, brainstorm econômico com opção de aprofundar' },
  { key: 'orchestrate', label: '🎭 Orquestrador — Planeja e coordena agentes', description: 'Quebra tarefas complexas, coordena múltiplos agentes automaticamente' },
  { key: 'advisor', label: '🔍 Advisor — Analisa e sugere', description: 'Análise de código, sugestões de melhorias, identificação de problemas' },
  { key: 'operator', label: '🔧 Operator — Cria branch & PR', description: 'Aplica patches, cria branches, abre Pull Requests' },
  { key: 'reviewer', label: '📋 Reviewer — Revisa código', description: 'Revisão de qualidade, compliance GDPR/SOC2, segurança' },
  { key: 'executor', label: '🚀 Executor — Pode mergear', description: 'Merge de PRs (requer aprovação para operações críticas)' },
];

export default function AgentSelector({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const selected = AGENT_ROLES.find((r) => r.key === value);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Modo de Execução</p>
          <p className="text-xs text-slate-400">Escolha o agente principal para esta interação</p>
        </div>
        {selected && (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-500/30">
            {selected.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {AGENT_ROLES.map((role) => (
          <button
            key={role.key}
            type="button"
            onClick={() => onChange(role.key)}
            className={`text-left rounded-xl border transition-all px-4 py-3 shadow-sm hover:-translate-y-0.5 hover:shadow-lg
              ${value === role.key
                ? 'border-emerald-400/70 bg-emerald-500/10 text-slate-50'
                : 'border-white/5 bg-white/5 text-slate-200 hover:border-white/15'}
            `}
          >
            <p className="font-semibold text-sm">{role.label}</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{role.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
