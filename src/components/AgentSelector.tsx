'use client';
import React, { useState } from 'react';

// LegacyAssist é o único modo principal - agente autônomo de alta performance
// O sistema roteia automaticamente para as ferramentas certas
export const PRIMARY_MODES = [
  { 
    key: 'legacyAssist', 
    label: '🛡️ LegacyAssist', 
    subtitle: 'Guardião Técnico Autônomo',
    description: 'Agente de alta performance com raciocínio estruturado, uso ativo de ferramentas e personalidade proativa. Analisa, planeja, age e corrige automaticamente.',
    agents: ['twin-builder', 'planner', 'advisor', 'operator', 'reviewer', 'executor'],
    recommended: true,
    capabilities: ['searchRAG', 'runSandbox', 'getGraph', 'analyzeCode', 'orchestrate', 'twinBuilder'],
  },
];

// Agentes especializados (disponíveis via LegacyAssist automaticamente)
export const AGENT_ROLES = [
  { 
    key: 'legacyAssist', 
    label: '🛡️ LegacyAssist — Guardião Técnico', 
    description: 'Agente autônomo: analisa → planeja → age → observa → corrige. Usa ferramentas automaticamente.',
    primary: true,
  },
  // Agentes abaixo são chamados pelo LegacyAssist conforme necessidade
  { 
    key: 'advisor', 
    label: '📊 Advisor', 
    description: 'Análise profunda de código e arquitetura (chamado automaticamente)',
    internal: true,
  },
  { 
    key: 'reviewer', 
    label: '👁️ Reviewer', 
    description: 'Revisão de código e compliance (chamado automaticamente)',
    internal: true,
  },
  { 
    key: 'operator', 
    label: '🔧 Operator', 
    description: 'Cria branches e PRs (chamado automaticamente)',
    internal: true,
  },
  { 
    key: 'executor', 
    label: '⚡ Executor', 
    description: 'Executa no sandbox (chamado automaticamente)',
    internal: true,
  },
  { 
    key: 'twin-builder', 
    label: '🧬 Twin Builder', 
    description: 'Reproduz incidentes (chamado automaticamente)',
    internal: true,
  },
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
