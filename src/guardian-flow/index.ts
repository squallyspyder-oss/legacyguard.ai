/**
 * Guardian Flow - Public API Exports
 * 
 * Módulo principal do Guardian Flow
 * @module guardian-flow
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // LOA
  LOALevel,
  LOAConfig,
  
  // Agents
  AgentRole,
  AgentState,
  
  // Safety
  SafetyGateType,
  SafetyGateResult,
  SafetyCheckpoint,
  
  // Flow
  FlowEventType,
  FlowEvent,
  FlowStatus,
  RiskPulse,
  GuardianFlowState,
  FlowAction,
  
  // Analysis
  BlastRadiusAnalysis,
  DeterministicValidation,
  DeterministicRun,
  
  // Gamification
  MissionCategory,
  MissionDifficulty,
  Mission,
  Achievement,
  GuardianLevel,
  GuardianProfile,
  
  // Health
  CodeHealthMetrics,
  
  // API
  GuardianFlowRequest,
  GuardianFlowResponse,
  
  // Errors
  ErrorCode,
} from './types';

export {
  LOA_CONFIGS,
  AGENT_METADATA,
  GUARDIAN_LEVELS,
  GuardianFlowError,
  ERROR_CODES,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

export {
  TIMEOUTS,
  LIMITS,
  INTENT_LOA_MAPPING,
  RISK_KEYWORDS,
  SAFETY_GATES_BY_LOA,
  SAFETY_GATE_MESSAGES,
  AGENT_EXECUTION_ORDER,
  REQUIRED_AGENTS,
  XP_REWARDS,
  XP_ACTIONS,
  ACHIEVEMENTS,
  HEALTH_SCORE_WEIGHTS,
  RISK_PULSE_THRESHOLDS,
  COLORS,
  ANIMATIONS,
  ERROR_MESSAGES,
  FEATURE_FLAGS,
  STORAGE_KEYS,
} from './constants';

// =============================================================================
// ENGINE
// =============================================================================

export {
  FlowEngine,
  getFlowEngine,
  resetFlowEngine,
  createInitialState,
  classifyIntent,
  calculateRiskPulse,
} from './engine/FlowEngine';

export type { ClassifiedIntent } from './engine/FlowEngine';

// =============================================================================
// SAFETY GATES
// =============================================================================

export {
  validateIntent,
  calculateBlastRadius,
  validateDeterministic,
  runSecurityScan,
  requestHumanApproval,
  approveRequest,
  denyRequest,
  runSafetyCheckpoint,
} from './engine/SafetyGates';

export type {
  IntentValidationInput,
  BlastRadiusInput,
  DeterministicInput,
  SecurityScanInput,
  SecurityFinding,
  HumanApprovalInput,
  HumanApprovalRequest,
} from './engine/SafetyGates';

// =============================================================================
// CONTEXT & HOOKS
// =============================================================================

export {
  GuardianFlowProvider,
  useGuardianFlow,
  useFlowStatus,
  useRiskPulse,
  useActiveAgents,
  useFlowEvents,
  useGuardianProfile,
} from './context/GuardianFlowProvider';

// =============================================================================
// COMPONENTS
// =============================================================================

export {
  GuardianFlowPanel,
  GuardianFlowCompact,
} from './components/GuardianFlowPanel';

// =============================================================================
// GAMIFICATION
// =============================================================================

export {
  generateDailyMissions,
  updateMissionProgress,
  checkExpiredMissions,
  checkAchievements,
  getAchievementProgress,
  calculateXPReward,
  calculateLeaderboard,
} from './gamification/MissionSystem';

export type { LeaderboardEntry } from './gamification/MissionSystem';
