'use client';
import React, { useState } from 'react';

// Modos principais simplificados - o sistema faz roteamento automático
export const PRIMARY_MODES = [
  { 
    key: 'legacyAssist', 
    label: '🧭 LegacyAssist', 
    subtitle: 'Reproduzir e Corrigir Incidentes',
    description: 'O Twin Builder cria réplica digital do incidente, coordena análise e correção automaticamente.',
    agents: ['twin-builder', 'planner', 'advisor', 'operator', 'reviewer', 'executor'],
    recommended: true,
  },
  { 
    key: 'chat', 
    label: '💬 Chat', 
    subtitle: 'Pesquisa e Brainstorm',
    description: 'Perguntas rápidas, pesquisa leve. Detecta automaticamente quando você precisa de ação.',
    agents: ['chat'],
    recommended: false,
  },
  { 
    key: 'orchestrate', 
    label: '🎭 Orquestrador', 
    subtitle: 'Tarefas Complexas',
    description: 'Para tarefas que precisam de múltiplos agentes coordenados sem ser um incidente específico.',
    agents: ['planner', 'advisor', 'operator', 'reviewer', 'executor'],
    recommended: false,
  },
];

// Agentes individuais (modo avançado)
export const AGENT_ROLES = [
  { key: 'legacyAssist', label: '🧭 LegacyAssist — Guia Assistido', description: 'Assistente do sistema: orienta próximos passos, sugere pesquisas (web/RAG) e mostra caminhos guiados' },
  { key: 'chat', label: '💬 Chat Livre — Pesquisa/Brainstorm', description: 'Perguntas rápidas, pesquisa leve, brainstorm econômico com opção de aprofundar' },
  { key: 'orchestrate', label: '🎭 Orquestrador — Planeja e coordena agentes', description: 'Quebra tarefas complexas, coordena múltiplos agentes automaticamente' },
  { key: 'advisor', label: '🔍 Advisor — Analisa e sugere', description: 'Análise de código, sugestões de melhorias, identificação de problemas' },
  { key: 'operator', label: '🔧 Operator — Cria branch & PR', description: 'Aplica patches, cria branches, abre Pull Requests' },
  { key: 'reviewer', label: '📋 Reviewer — Revisa código', description: 'Revisão de qualidade, compliance GDPR/SOC2, segurança' },
  { key: 'executor', label: '🚀 Executor — Pode mergear', description: 'Merge de PRs (requer aprovação para operações críticas)' },
];

interface AgentSelectorProps {
  value?: string;
  onChange: (v: string) => void;
  showAdvanced?: boolean;
}

export default function AgentSelector({ value, onChange, showAdvanced: initialShowAdvanced = false }: AgentSelectorProps) {
  const [showAdvanced, setShowAdvanced] = useState(initialShowAdvanced);
  const selected = AGENT_ROLES.find((r) => r.key === value);
  // Used to check if current selection is in primary modes
  const _primarySelected = PRIMARY_MODES.find((m) => m.key === value);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">Como posso ajudar?</p>
          <p className="text-xs text-slate-400">O sistema escolhe os agentes automaticamente</p>
        </div>
        {selected && (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-500/30">
            {selected.label.split('—')[0].trim()}
          </span>
        )}
      </div>

      {/* Modos Principais */}
      <div className="grid grid-cols-1 gap-3">
        {PRIMARY_MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => onChange(mode.key)}
            className={`text-left rounded-xl border transition-all px-4 py-4 shadow-sm hover:-translate-y-0.5 hover:shadow-lg relative
              ${value === mode.key
                ? 'border-emerald-400/70 bg-emerald-500/10 text-slate-50'
                : 'border-white/5 bg-white/5 text-slate-200 hover:border-white/15'}
            `}
          >
            {mode.recommended && (
              <span className="absolute -top-2 right-3 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Recomendado
              </span>
            )}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="font-semibold text-base">{mode.label}</p>
                <p className="text-sm text-emerald-300/80 font-medium">{mode.subtitle}</p>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{mode.description}</p>
              </div>
            </div>
            {value === mode.key && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Agentes envolvidos</p>
                <p className="text-xs text-slate-400">{mode.agents.join(' → ')}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Toggle Avançado */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors self-start flex items-center gap-1"
      >
        <span>{showAdvanced ? '▼' : '▶'}</span>
        <span>Seleção manual de agentes</span>
      </button>

      {/* Agentes Individuais (Avançado) */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
          {AGENT_ROLES.filter(r => !PRIMARY_MODES.some(m => m.key === r.key)).map((role) => (
            <button
              key={role.key}
              type="button"
              onClick={() => onChange(role.key)}
              className={`text-left rounded-lg border transition-all px-3 py-2 text-xs
                ${value === role.key
                  ? 'border-emerald-400/50 bg-emerald-500/10 text-slate-50'
                  : 'border-white/5 bg-white/5 text-slate-300 hover:border-white/15'}
              `}
            >
              <p className="font-medium">{role.label.split('—')[0].trim()}</p>
              <p className="text-slate-500 mt-0.5">{role.description.slice(0, 50)}...</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
