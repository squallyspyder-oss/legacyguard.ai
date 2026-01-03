/**
 * Guardian Flow - Tipos e Interfaces
 * 
 * Sistema de "Vibe Coding" para sistemas legados com segurança determinística
 * @module guardian-flow/types
 */

// =============================================================================
// NÍVEIS DE AUTOMAÇÃO (LOA)
// =============================================================================

/**
 * Level of Automation - Define quanto controle humano é necessário
 * LOA 1: Automático (baixo risco)
 * LOA 2: Requer revisão (médio risco)
 * LOA 3: Requer comando (alto risco)
 * LOA 4: Apenas manual (crítico)
 */
export type LOALevel = 1 | 2 | 3 | 4;

export interface LOAConfig {
  level: LOALevel;
  autoApproveTimeout?: number; // ms - só para LOA 1
  requiresExplicitApproval: boolean;
  requiresSecurityScan: boolean;
  requiresDeterministicValidation: boolean;
  maxBlastRadius: number; // 0-100
  description: string;
}

export const LOA_CONFIGS: Record<LOALevel, LOAConfig> = {
  1: {
    level: 1,
    autoApproveTimeout: 5000,
    requiresExplicitApproval: false,
    requiresSecurityScan: false,
    requiresDeterministicValidation: true,
    maxBlastRadius: 10,
    description: 'Automático - Ações de baixo risco (formatação, lint, docs)',
  },
  2: {
    level: 2,
    requiresExplicitApproval: true,
    requiresSecurityScan: true,
    requiresDeterministicValidation: true,
    maxBlastRadius: 30,
    description: 'Revisão - Ações de médio risco (refatoração, bug fixes)',
  },
  3: {
    level: 3,
    requiresExplicitApproval: true,
    requiresSecurityScan: true,
    requiresDeterministicValidation: true,
    maxBlastRadius: 60,
    description: 'Comando - Ações de alto risco (arquitetura, segurança)',
  },
  4: {
    level: 4,
    requiresExplicitApproval: true,
    requiresSecurityScan: true,
    requiresDeterministicValidation: true,
    maxBlastRadius: 0, // Não permitido automaticamente
    description: 'Manual - Decisões críticas de negócio',
  },
};

// =============================================================================
// AGENTES DO GUARDIAN FLOW
// =============================================================================

export type AgentRole = 
  | 'architect'   // 🏛️ Decisões de arquitetura
  | 'developer'   // 👷 Implementação
  | 'qa'          // 🧪 Qualidade e testes
  | 'security'    // 🔒 Segurança
  | 'reviewer'    // 👀 Revisão de código
  | 'documenter'  // 📝 Documentação
  | 'orchestrator'; // 🎯 Coordenador

export interface AgentState {
  role: AgentRole;
  status: 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error';
  currentTask?: string;
  progress: number; // 0-100
  emoji: string;
  color: string;
  lastUpdate: Date;
}

export const AGENT_METADATA: Record<AgentRole, Pick<AgentState, 'emoji' | 'color'>> = {
  architect: { emoji: '🏛️', color: '#8B5CF6' },
  developer: { emoji: '👷', color: '#3B82F6' },
  qa: { emoji: '🧪', color: '#10B981' },
  security: { emoji: '🔒', color: '#EF4444' },
  reviewer: { emoji: '👀', color: '#F59E0B' },
  documenter: { emoji: '📝', color: '#6366F1' },
  orchestrator: { emoji: '🎯', color: '#EC4899' },
};

// =============================================================================
// SAFETY GATES (PORTÕES DE SEGURANÇA)
// =============================================================================

export type SafetyGateType =
  | 'intent_validation'      // Validar intenção
  | 'blast_radius'           // Calcular impacto
  | 'deterministic_check'    // Validação 10x
  | 'security_scan'          // SAST/SCA
  | 'human_approval';        // Aprovação humana

export interface SafetyGateResult {
  gate: SafetyGateType;
  passed: boolean;
  confidence: number; // 0-100
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  durationMs: number;
}

export interface SafetyCheckpoint {
  id: string;
  gates: SafetyGateResult[];
  overallPassed: boolean;
  requiredApproval?: 'auto' | 'human';
  approvedBy?: string;
  approvedAt?: Date;
}

// =============================================================================
// FLOW EVENTS (EVENTOS DO FLUXO)
// =============================================================================

export type FlowEventType =
  | 'flow_started'
  | 'intent_detected'
  | 'loa_classified'
  | 'agent_assigned'
  | 'agent_progress'
  | 'agent_completed'
  | 'safety_gate_started'
  | 'safety_gate_passed'
  | 'safety_gate_failed'
  | 'sandbox_created'
  | 'sandbox_executed'
  | 'sandbox_destroyed'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'action_executed'
  | 'action_rolled_back'
  | 'flow_completed'
  | 'flow_failed';

export interface FlowEvent {
  id: string;
  type: FlowEventType;
  timestamp: Date;
  data: Record<string, unknown>;
  agentRole?: AgentRole;
  safetyGate?: SafetyGateType;
}

// =============================================================================
// GUARDIAN FLOW STATE
// =============================================================================

export type FlowStatus = 
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'executing'
  | 'validating'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type RiskPulse = 'green' | 'yellow' | 'orange' | 'red';

export interface GuardianFlowState {
  // Status
  flowId: string | null;
  status: FlowStatus;
  riskPulse: RiskPulse;
  
  // Contexto
  userIntent: string | null;
  detectedIntent: string | null;
  loaLevel: LOALevel | null;
  
  // Agentes
  agents: Record<AgentRole, AgentState>;
  activeAgents: AgentRole[];
  
  // Timeline
  events: FlowEvent[];
  currentPhase: string;
  
  // Segurança
  safetyCheckpoint: SafetyCheckpoint | null;
  pendingApproval: {
    required: boolean;
    reason: string;
    expiresAt: Date | null;
  } | null;
  
  // Sandbox
  sandboxId: string | null;
  sandboxLogs: string[];
  
  // Resultado
  result: {
    success: boolean;
    output?: string;
    error?: string;
    rollbackAvailable: boolean;
  } | null;
  
  // Métricas
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number;
}

// =============================================================================
// BLAST RADIUS (ANÁLISE DE IMPACTO)
// =============================================================================

export interface BlastRadiusAnalysis {
  score: number; // 0-100
  affectedFiles: string[];
  affectedFunctions: string[];
  affectedTests: string[];
  dependencyChain: string[];
  riskFactors: {
    factor: string;
    weight: number;
    description: string;
  }[];
  recommendation: 'proceed' | 'review' | 'block';
}

// =============================================================================
// DETERMINISTIC VALIDATION
// =============================================================================

export interface DeterministicRun {
  runNumber: number;
  success: boolean;
  output: string;
  hash: string;
  durationMs: number;
}

export interface DeterministicValidation {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  runs: DeterministicRun[];
  isConsistent: boolean;
  consistencyScore: number; // 0-100
  outputHash: string | null;
}

// =============================================================================
// GAMIFICATION
// =============================================================================

export type MissionCategory = 
  | 'cleanup'     // Limpeza de código
  | 'security'    // Segurança
  | 'docs'        // Documentação
  | 'tests'       // Testes
  | 'refactor';   // Refatoração

export type MissionDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  difficulty: MissionDifficulty;
  xpReward: number;
  target: number;
  progress: number;
  completed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  emoji: string;
  xpReward: number;
  unlockedAt?: Date;
  progress?: number;
  target?: number;
}

export type GuardianLevel = 1 | 2 | 3 | 4 | 5;

export interface GuardianProfile {
  userId: string;
  xp: number;
  level: GuardianLevel;
  levelTitle: string;
  totalMissionsCompleted: number;
  totalActionsExecuted: number;
  totalRollbacks: number;
  achievements: string[];
  currentMissions: Mission[];
  streakDays: number;
  lastActiveAt: Date;
}

export const GUARDIAN_LEVELS: Record<GuardianLevel, { title: string; minXp: number; maxXp: number }> = {
  1: { title: 'Guardian Initiate', minXp: 0, maxXp: 100 },
  2: { title: 'Code Protector', minXp: 100, maxXp: 500 },
  3: { title: 'System Steward', minXp: 500, maxXp: 1500 },
  4: { title: 'Legacy Master', minXp: 1500, maxXp: 5000 },
  5: { title: 'Agentic Architect', minXp: 5000, maxXp: Infinity },
};

// =============================================================================
// CODE HEALTH
// =============================================================================

export interface CodeHealthMetrics {
  testCoverage: number;
  securityScore: number;
  maintainabilityIndex: number;
  documentationScore: number;
  technicalDebtRatio: number;
  overallScore: number;
}

// =============================================================================
// FLOW ACTIONS
// =============================================================================

export type FlowAction =
  | { type: 'START_FLOW'; payload: { intent: string; context?: Record<string, unknown> } }
  | { type: 'CANCEL_FLOW' }
  | { type: 'APPROVE_ACTION'; payload: { checkpointId: string } }
  | { type: 'DENY_ACTION'; payload: { checkpointId: string; reason: string } }
  | { type: 'ROLLBACK' }
  | { type: 'RETRY' }
  | { type: 'UPDATE_LOA'; payload: { level: LOALevel } }
  | { type: 'AGENT_UPDATE'; payload: { role: AgentRole; state: Partial<AgentState> } }
  | { type: 'ADD_EVENT'; payload: FlowEvent }
  | { type: 'SAFETY_GATE_RESULT'; payload: SafetyGateResult }
  | { type: 'SANDBOX_LOG'; payload: { message: string } }
  | { type: 'FLOW_COMPLETED'; payload: { success: boolean; output?: string; error?: string } }
  | { type: 'RESET_FLOW' };

// =============================================================================
// API TYPES
// =============================================================================

export interface GuardianFlowRequest {
  intent: string;
  context?: {
    repositoryPath?: string;
    filePath?: string;
    selectedCode?: string;
    threadId?: string;
  };
  options?: {
    maxLOA?: LOALevel;
    skipSafetyGates?: SafetyGateType[];
    dryRun?: boolean;
  };
}

export interface GuardianFlowResponse {
  flowId: string;
  status: FlowStatus;
  events: FlowEvent[];
  result?: {
    success: boolean;
    output?: string;
    changes?: {
      file: string;
      diff: string;
    }[];
    rollbackId?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class GuardianFlowError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GuardianFlowError';
  }
}

export const ERROR_CODES = {
  INTENT_UNCLEAR: 'INTENT_UNCLEAR',
  LOA_EXCEEDED: 'LOA_EXCEEDED',
  BLAST_RADIUS_EXCEEDED: 'BLAST_RADIUS_EXCEEDED',
  DETERMINISTIC_FAILED: 'DETERMINISTIC_FAILED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  APPROVAL_TIMEOUT: 'APPROVAL_TIMEOUT',
  APPROVAL_DENIED: 'APPROVAL_DENIED',
  SANDBOX_FAILED: 'SANDBOX_FAILED',
  AGENT_FAILED: 'AGENT_FAILED',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
