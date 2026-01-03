/**
 * Guardian Flow - Main Panel Component
 * 
 * Painel principal com visualização do fluxo Guardian
 * @module guardian-flow/components/GuardianFlowPanel
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useGuardianFlow, useFlowStatus, useRiskPulse, useActiveAgents } from '../context/GuardianFlowProvider';
import { FlowStatus, RiskPulse, AgentRole, FlowEvent, LOALevel, LOA_CONFIGS, AGENT_METADATA } from '../types';
import { COLORS, SAFETY_GATE_MESSAGES } from '../constants';

// =============================================================================
// RISK PULSE INDICATOR
// =============================================================================

interface RiskPulseIndicatorProps {
  pulse: RiskPulse;
  size?: 'sm' | 'md' | 'lg';
}

function RiskPulseIndicator({ pulse, size = 'md' }: RiskPulseIndicatorProps) {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };
  
  const pulseLabels: Record<RiskPulse, string> = {
    green: 'Sistema estável',
    yellow: 'Operação em andamento',
    orange: 'Aguardando aprovação',
    red: 'Atenção necessária',
  };
  
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} rounded-full animate-pulse`}
        style={{ backgroundColor: COLORS.RISK_PULSE[pulse] }}
        title={pulseLabels[pulse]}
      />
      <span className="text-sm text-gray-400">{pulseLabels[pulse]}</span>
    </div>
  );
}

// =============================================================================
// LOA BADGE
// =============================================================================

interface LOABadgeProps {
  level: LOALevel | null;
}

function LOABadge({ level }: LOABadgeProps) {
  if (!level) return null;
  
  const config = LOA_CONFIGS[level];
  
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `${COLORS.LOA[level]}20`,
        color: COLORS.LOA[level],
        border: `1px solid ${COLORS.LOA[level]}40`,
      }}
    >
      <span>LOA {level}</span>
      <span className="opacity-70">•</span>
      <span className="opacity-90">{config.description.split(' - ')[0]}</span>
    </div>
  );
}

// =============================================================================
// AGENT AVATAR
// =============================================================================

interface AgentAvatarProps {
  role: AgentRole;
  status: 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error';
  progress?: number;
  size?: 'sm' | 'md' | 'lg';
}

function AgentAvatar({ role, status, progress = 0, size = 'md' }: AgentAvatarProps) {
  const meta = AGENT_METADATA[role];
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-xl',
    lg: 'w-16 h-16 text-2xl',
  };
  
  const isActive = status === 'thinking' || status === 'working';
  
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={`
          ${sizeClasses[size]} rounded-full flex items-center justify-center
          transition-all duration-300
          ${isActive ? 'animate-pulse ring-2 ring-offset-2 ring-offset-gray-900' : ''}
          ${status === 'done' ? 'opacity-100' : status === 'idle' ? 'opacity-40' : 'opacity-80'}
        `}
        style={{
          backgroundColor: `${meta.color}20`,
          borderColor: meta.color,
          borderWidth: 2,
        }}
      >
        <span>{meta.emoji}</span>
      </div>
      
      {/* Progress ring */}
      {isActive && progress > 0 && (
        <svg
          className="absolute inset-0 -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={meta.color}
            strokeWidth="4"
            strokeDasharray={`${progress * 2.83} 283`}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
      )}
      
      {/* Status indicator */}
      <div
        className={`
          absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900
          ${status === 'done' ? 'bg-green-500' : ''}
          ${status === 'error' ? 'bg-red-500' : ''}
          ${status === 'thinking' ? 'bg-yellow-500 animate-pulse' : ''}
          ${status === 'working' ? 'bg-blue-500 animate-pulse' : ''}
          ${status === 'idle' || status === 'waiting' ? 'bg-gray-500' : ''}
        `}
      />
      
      <span className="mt-1 text-xs text-gray-400 capitalize">{role}</span>
    </div>
  );
}

// =============================================================================
// AGENT ORCHESTRA
// =============================================================================

function AgentOrchestra() {
  const { state } = useGuardianFlow();
  const agents = state.agents;
  
  const orderedRoles: AgentRole[] = [
    'orchestrator',
    'architect',
    'developer',
    'qa',
    'security',
    'reviewer',
    'documenter',
  ];
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
        <span>🎭</span>
        <span>Orquestra de Agentes</span>
      </h3>
      
      <div className="flex justify-center items-end gap-4 flex-wrap">
        {orderedRoles.map((role) => {
          const agent = agents[role];
          return (
            <AgentAvatar
              key={role}
              role={role}
              status={agent.status}
              progress={agent.progress}
            />
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// FLOW TIMELINE
// =============================================================================

function FlowTimeline() {
  const { state } = useGuardianFlow();
  const events = state.events.slice(-10).reverse();
  
  const getEventIcon = (type: FlowEvent['type']): string => {
    const icons: Record<string, string> = {
      flow_started: '🚀',
      intent_detected: '🎯',
      loa_classified: '📊',
      agent_assigned: '👤',
      agent_progress: '⚙️',
      agent_completed: '✅',
      safety_gate_started: '🔒',
      safety_gate_passed: '✓',
      safety_gate_failed: '✗',
      sandbox_created: '📦',
      sandbox_executed: '▶️',
      sandbox_destroyed: '🗑️',
      approval_requested: '⏳',
      approval_granted: '👍',
      approval_denied: '👎',
      action_executed: '⚡',
      action_rolled_back: '↩️',
      flow_completed: '🎉',
      flow_failed: '❌',
    };
    return icons[type] || '•';
  };
  
  const getEventColor = (type: FlowEvent['type']): string => {
    if (type.includes('failed') || type.includes('denied')) return 'text-red-400';
    if (type.includes('completed') || type.includes('passed') || type.includes('granted')) return 'text-green-400';
    if (type.includes('started') || type.includes('progress')) return 'text-blue-400';
    if (type.includes('approval') || type.includes('requested')) return 'text-yellow-400';
    return 'text-gray-400';
  };
  
  if (events.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">📜 Timeline</h3>
        <p className="text-gray-500 text-sm text-center py-4">
          Nenhum evento ainda
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">📜 Timeline</h3>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-2 text-sm animate-fadeIn"
          >
            <span className="flex-shrink-0">{getEventIcon(event.type)}</span>
            <span className={getEventColor(event.type)}>
              {event.type.replace(/_/g, ' ')}
            </span>
            <span className="text-gray-600 text-xs ml-auto">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// APPROVAL DIALOG
// =============================================================================

interface ApprovalDialogProps {
  onApprove: () => void;
  onDeny: (reason: string) => void;
}

function ApprovalDialog({ onApprove, onDeny }: ApprovalDialogProps) {
  const { state } = useGuardianFlow();
  const [denyReason, setDenyReason] = useState('');
  const [showDenyInput, setShowDenyInput] = useState(false);
  
  if (!state.pendingApproval?.required) return null;
  
  const timeLeft = state.pendingApproval.expiresAt
    ? Math.max(0, Math.floor((new Date(state.pendingApproval.expiresAt).getTime() - Date.now()) / 1000))
    : 0;
  
  return (
    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1">
          <h3 className="font-medium text-orange-300">Aprovação Necessária</h3>
          <p className="text-sm text-gray-400 mt-1">
            {state.pendingApproval.reason}
          </p>
          
          {state.detectedIntent && (
            <div className="mt-2 p-2 bg-gray-800 rounded text-sm">
              <span className="text-gray-500">Ação detectada:</span>{' '}
              <span className="text-white">{state.detectedIntent}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
            <span>⏱️ Expira em {timeLeft}s</span>
          </div>
          
          {!showDenyInput ? (
            <div className="flex gap-2 mt-4">
              <button
                onClick={onApprove}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
              >
                ✓ Aprovar
              </button>
              <button
                onClick={() => setShowDenyInput(true)}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded-lg font-medium transition-colors"
              >
                ✗ Negar
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <input
                type="text"
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="Motivo da negação..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onDeny(denyReason || 'Não especificado');
                    setShowDenyInput(false);
                    setDenyReason('');
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
                >
                  Confirmar Negação
                </button>
                <button
                  onClick={() => {
                    setShowDenyInput(false);
                    setDenyReason('');
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SANDBOX VIEWER
// =============================================================================

function SandboxViewer() {
  const { state } = useGuardianFlow();
  
  if (state.sandboxLogs.length === 0) return null;
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
        <span>📦</span>
        <span>Sandbox Logs</span>
      </h3>
      
      <div className="font-mono text-xs bg-black/50 rounded p-3 max-h-40 overflow-y-auto">
        {state.sandboxLogs.map((log, i) => (
          <div key={i} className="text-green-400 whitespace-pre-wrap">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// RESULT PANEL
// =============================================================================

function ResultPanel() {
  const { state, rollback, reset, canRollback } = useGuardianFlow();
  
  if (!state.result) return null;
  
  const isSuccess = state.result.success;
  
  return (
    <div
      className={`rounded-lg p-4 border ${
        isSuccess
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{isSuccess ? '🎉' : '❌'}</span>
        <div className="flex-1">
          <h3 className={`font-medium ${isSuccess ? 'text-green-300' : 'text-red-300'}`}>
            {isSuccess ? 'Ação Concluída' : 'Ação Falhou'}
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {state.result.output || state.result.error}
          </p>
          
          <div className="flex gap-2 mt-4">
            {canRollback && (
              <button
                onClick={rollback}
                className="px-4 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-600/30 rounded-lg font-medium transition-colors"
              >
                ↩️ Rollback
              </button>
            )}
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Novo Fluxo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FLOW INPUT
// =============================================================================

interface FlowInputProps {
  onSubmit: (intent: string) => void;
  disabled?: boolean;
}

function FlowInput({ onSubmit, disabled }: FlowInputProps) {
  const [intent, setIntent] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (intent.trim() && !disabled) {
      onSubmit(intent.trim());
      setIntent('');
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        placeholder="Descreva a ação que deseja executar..."
        disabled={disabled}
        className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !intent.trim()}
        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
      >
        🚀 Iniciar
      </button>
    </form>
  );
}

// =============================================================================
// MAIN PANEL
// =============================================================================

export function GuardianFlowPanel() {
  const {
    state,
    profile,
    startFlow,
    cancelFlow,
    approveAction,
    denyAction,
    isFlowActive,
    canApprove,
  } = useGuardianFlow();
  
  const handleStartFlow = async (intent: string) => {
    try {
      await startFlow(intent);
    } catch (error) {
      console.error('Erro ao iniciar fluxo:', error);
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <h2 className="font-semibold">Guardian Flow</h2>
            <p className="text-xs text-gray-500">{state.currentPhase}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <RiskPulseIndicator pulse={state.riskPulse} />
          <LOABadge level={state.loaLevel} />
          
          {isFlowActive && (
            <button
              onClick={cancelFlow}
              className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input */}
        <FlowInput onSubmit={handleStartFlow} disabled={isFlowActive} />
        
        {/* Intent Display */}
        {state.userIntent && (
          <div className="bg-gray-800/50 rounded-lg p-3">
            <span className="text-sm text-gray-500">Intenção:</span>
            <p className="text-white mt-1">{state.userIntent}</p>
          </div>
        )}
        
        {/* Approval Dialog */}
        {canApprove && (
          <ApprovalDialog
            onApprove={() => approveAction()}
            onDeny={denyAction}
          />
        )}
        
        {/* Agent Orchestra */}
        <AgentOrchestra />
        
        {/* Timeline */}
        <FlowTimeline />
        
        {/* Sandbox Viewer */}
        <SandboxViewer />
        
        {/* Result */}
        <ResultPanel />
      </div>
      
      {/* Footer - Profile */}
      {profile && (
        <div className="p-4 border-t border-gray-800 bg-gray-800/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-lg">
                🛡️
              </div>
              <div>
                <div className="font-medium">{profile.levelTitle}</div>
                <div className="text-xs text-gray-500">
                  Level {profile.level} • {profile.xp} XP
                </div>
              </div>
            </div>
            
            <div className="text-right text-sm">
              <div className="text-gray-400">
                {profile.totalActionsExecuted} ações • {profile.totalRollbacks} rollbacks
              </div>
              <div className="text-gray-500">
                🔥 {profile.streakDays} dias de streak
              </div>
            </div>
          </div>
          
          {/* XP Progress */}
          <div className="mt-3">
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-500"
                style={{
                  width: `${Math.min(100, (profile.xp / 100) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// COMPACT VERSION
// =============================================================================

export function GuardianFlowCompact() {
  const { state, isFlowActive, canApprove, approveAction, denyAction } = useGuardianFlow();
  
  if (!isFlowActive && !state.result) return null;
  
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gray-800 border-b border-gray-700">
        <RiskPulseIndicator pulse={state.riskPulse} size="sm" />
        <span className="text-sm font-medium flex-1">{state.currentPhase}</span>
        <LOABadge level={state.loaLevel} />
      </div>
      
      {/* Active Agents */}
      {state.activeAgents.length > 0 && (
        <div className="flex gap-2 p-3 border-b border-gray-800">
          {state.activeAgents.map((role) => (
            <AgentAvatar
              key={role}
              role={role}
              status={state.agents[role].status}
              progress={state.agents[role].progress}
              size="sm"
            />
          ))}
        </div>
      )}
      
      {/* Approval Buttons */}
      {canApprove && (
        <div className="flex gap-2 p-3">
          <button
            onClick={() => approveAction()}
            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors"
          >
            ✓ Aprovar
          </button>
          <button
            onClick={() => denyAction('Negado')}
            className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded text-sm font-medium transition-colors"
          >
            ✗ Negar
          </button>
        </div>
      )}
      
      {/* Result */}
      {state.result && (
        <div className={`p-3 ${state.result.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <span className="text-sm">
            {state.result.success ? '✓ Concluído' : '✗ Falhou'}
          </span>
        </div>
      )}
    </div>
  );
}
