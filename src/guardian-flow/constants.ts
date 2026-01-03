/**
 * Guardian Flow - Constantes e Configurações
 * 
 * Configurações centralizadas para segurança e comportamento do sistema
 * @module guardian-flow/constants
 */

import { LOALevel, MissionDifficulty, SafetyGateType, AgentRole } from './types';

// =============================================================================
// TIMEOUTS E LIMITES
// =============================================================================

/**
 * Timeouts de segurança (em ms)
 * Valores conservadores para evitar operações travadas
 */
export const TIMEOUTS = {
  /** Timeout para classificação de intenção */
  INTENT_CLASSIFICATION: 10_000,
  
  /** Timeout para análise de blast radius */
  BLAST_RADIUS_ANALYSIS: 30_000,
  
  /** Timeout para execução no sandbox (por tentativa) */
  SANDBOX_EXECUTION: 60_000,
  
  /** Timeout total para validação determinística (10 runs) */
  DETERMINISTIC_VALIDATION: 120_000,
  
  /** Timeout para scan de segurança */
  SECURITY_SCAN: 45_000,
  
  /** Timeout para aprovação humana (LOA 2) - 5 minutos */
  HUMAN_APPROVAL_LOA2: 5 * 60_000,
  
  /** Timeout para aprovação humana (LOA 3) - 15 minutos */
  HUMAN_APPROVAL_LOA3: 15 * 60_000,
  
  /** Timeout para operações de agente individual */
  AGENT_OPERATION: 60_000,
  
  /** Timeout para rollback */
  ROLLBACK: 30_000,
  
  /** Intervalo de heartbeat para monitoramento */
  HEARTBEAT_INTERVAL: 5_000,
} as const;

/**
 * Limites de segurança
 */
export const LIMITS = {
  /** Número de runs para validação determinística */
  DETERMINISTIC_RUNS: 10,
  
  /** Consistência mínima para aprovação (%) */
  MIN_CONSISTENCY_SCORE: 100,
  
  /** Blast radius máximo por LOA */
  MAX_BLAST_RADIUS: {
    1: 10,
    2: 30,
    3: 60,
    4: 0, // Não permitido automaticamente
  } as Record<LOALevel, number>,
  
  /** Máximo de arquivos afetados por operação */
  MAX_AFFECTED_FILES: 50,
  
  /** Máximo de tentativas de retry */
  MAX_RETRIES: 3,
  
  /** Máximo de eventos no histórico (em memória) */
  MAX_EVENTS_IN_MEMORY: 1000,
  
  /** Tamanho máximo de log de sandbox */
  MAX_SANDBOX_LOG_SIZE: 100_000, // caracteres
  
  /** Máximo de agentes ativos simultaneamente */
  MAX_CONCURRENT_AGENTS: 4,
  
  /** Tamanho máximo de código para análise inline */
  MAX_INLINE_CODE_SIZE: 50_000, // caracteres
} as const;

// =============================================================================
// CLASSIFICAÇÃO DE INTENÇÕES
// =============================================================================

/**
 * Padrões de intenção e seus LOA correspondentes
 */
export const INTENT_LOA_MAPPING: Record<string, LOALevel> = {
  // LOA 1 - Baixo risco
  'format': 1,
  'lint': 1,
  'add_comment': 1,
  'update_docs': 1,
  'fix_typo': 1,
  'organize_imports': 1,
  
  // LOA 2 - Médio risco
  'fix_bug': 2,
  'refactor': 2,
  'add_test': 2,
  'optimize': 2,
  'update_dependency': 2,
  'add_logging': 2,
  'add_error_handling': 2,
  
  // LOA 3 - Alto risco
  'change_architecture': 3,
  'modify_security': 3,
  'modify_database': 3,
  'modify_auth': 3,
  'delete_code': 3,
  'change_api': 3,
  
  // LOA 4 - Crítico
  'business_logic': 4,
  'pricing_change': 4,
  'data_migration': 4,
  'compliance': 4,
};

/**
 * Keywords para detecção de risco
 */
export const RISK_KEYWORDS = {
  HIGH_RISK: [
    'delete', 'remove', 'drop', 'truncate',
    'password', 'secret', 'key', 'token',
    'migrate', 'migration',
    'auth', 'authentication', 'authorization',
    'security', 'permission', 'role',
    'payment', 'billing', 'price',
    'database', 'schema', 'table',
  ],
  MEDIUM_RISK: [
    'refactor', 'change', 'modify', 'update',
    'api', 'endpoint', 'route',
    'dependency', 'package', 'library',
    'config', 'configuration', 'env',
  ],
  LOW_RISK: [
    'format', 'lint', 'style',
    'comment', 'doc', 'readme',
    'typo', 'spelling',
    'import', 'export',
  ],
} as const;

// =============================================================================
// SAFETY GATES
// =============================================================================

/**
 * Configuração de gates por LOA
 */
export const SAFETY_GATES_BY_LOA: Record<LOALevel, SafetyGateType[]> = {
  1: ['intent_validation', 'deterministic_check'],
  2: ['intent_validation', 'blast_radius', 'deterministic_check', 'security_scan', 'human_approval'],
  3: ['intent_validation', 'blast_radius', 'deterministic_check', 'security_scan', 'human_approval'],
  4: ['intent_validation', 'blast_radius', 'deterministic_check', 'security_scan', 'human_approval'],
};

/**
 * Mensagens de gate para UI
 */
export const SAFETY_GATE_MESSAGES: Record<SafetyGateType, { title: string; description: string }> = {
  intent_validation: {
    title: 'Validação de Intenção',
    description: 'Verificando se a intenção foi corretamente interpretada',
  },
  blast_radius: {
    title: 'Análise de Impacto',
    description: 'Calculando o raio de blast potencial usando o Gêmeo Digital',
  },
  deterministic_check: {
    title: 'Validação Determinística',
    description: 'Executando 10x no sandbox para garantir consistência',
  },
  security_scan: {
    title: 'Scan de Segurança',
    description: 'Analisando código com SAST/SCA',
  },
  human_approval: {
    title: 'Aprovação Humana',
    description: 'Aguardando aprovação explícita do desenvolvedor',
  },
};

// =============================================================================
// AGENTES
// =============================================================================

/**
 * Ordem de execução padrão dos agentes
 */
export const AGENT_EXECUTION_ORDER: AgentRole[] = [
  'orchestrator',
  'architect',
  'developer',
  'qa',
  'security',
  'reviewer',
  'documenter',
];

/**
 * Agentes requeridos por tipo de operação
 */
export const REQUIRED_AGENTS: Record<string, AgentRole[]> = {
  'format': ['developer'],
  'lint': ['developer'],
  'add_comment': ['documenter'],
  'fix_bug': ['developer', 'qa'],
  'refactor': ['architect', 'developer', 'reviewer'],
  'add_test': ['qa', 'developer'],
  'modify_security': ['security', 'architect', 'developer', 'reviewer'],
  'change_architecture': ['architect', 'developer', 'qa', 'security', 'reviewer'],
  'default': ['orchestrator', 'developer', 'qa'],
};

// =============================================================================
// GAMIFICAÇÃO
// =============================================================================

/**
 * XP por dificuldade de missão
 */
export const XP_REWARDS: Record<MissionDifficulty, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
  legendary: 100,
};

/**
 * XP por ação do sistema
 */
export const XP_ACTIONS = {
  FLOW_COMPLETED: 5,
  FLOW_COMPLETED_NO_ROLLBACK: 10,
  SAFETY_GATE_PASSED: 2,
  FIRST_FLOW_OF_DAY: 15,
  STREAK_BONUS: 25,
  ZERO_VULNERABILITIES: 20,
  DOCUMENTATION_ADDED: 5,
  TEST_ADDED: 10,
} as const;

/**
 * Conquistas disponíveis
 */
export const ACHIEVEMENTS = {
  GUARDIAN_INITIATE: {
    id: 'guardian_initiate',
    title: 'Guardian Initiate',
    description: 'Completou seu primeiro fluxo Guardian',
    emoji: '🛡️',
    xpReward: 50,
    target: 1,
  },
  DEBT_SLAYER: {
    id: 'debt_slayer',
    title: 'Debt Slayer',
    description: 'Eliminou 100 code smells',
    emoji: '⚔️',
    xpReward: 200,
    target: 100,
  },
  TWIN_MASTER: {
    id: 'twin_master',
    title: 'Twin Master',
    description: 'Executou 10 simulações bem-sucedidas',
    emoji: '🔬',
    xpReward: 100,
    target: 10,
  },
  FORTRESS_BUILDER: {
    id: 'fortress_builder',
    title: 'Fortress Builder',
    description: '0 vulnerabilidades por 30 dias',
    emoji: '🏰',
    xpReward: 500,
    target: 30,
  },
  LEGACY_WHISPERER: {
    id: 'legacy_whisperer',
    title: 'Legacy Whisperer',
    description: 'Documentou 50 regras ocultas',
    emoji: '🌟',
    xpReward: 300,
    target: 50,
  },
  PERFECT_STREAK: {
    id: 'perfect_streak',
    title: 'Perfect Streak',
    description: '7 dias consecutivos sem rollbacks',
    emoji: '🔥',
    xpReward: 150,
    target: 7,
  },
  SANDBOX_SAGE: {
    id: 'sandbox_sage',
    title: 'Sandbox Sage',
    description: '100 execuções determinísticas bem-sucedidas',
    emoji: '🧙',
    xpReward: 250,
    target: 100,
  },
  ZERO_BLAST: {
    id: 'zero_blast',
    title: 'Zero Blast Radius',
    description: '50 operações com blast radius < 5',
    emoji: '🎯',
    xpReward: 200,
    target: 50,
  },
} as const;

// =============================================================================
// MÉTRICAS DE SAÚDE
// =============================================================================

/**
 * Pesos para cálculo do Code Health Score
 */
export const HEALTH_SCORE_WEIGHTS = {
  testCoverage: 0.25,
  securityScore: 0.25,
  maintainabilityIndex: 0.20,
  documentationScore: 0.15,
  technicalDebtRatio: 0.15,
} as const;

/**
 * Thresholds para Risk Pulse
 */
export const RISK_PULSE_THRESHOLDS = {
  GREEN: { maxActiveOperations: 0, maxPendingApprovals: 0 },
  YELLOW: { maxActiveOperations: 2, maxPendingApprovals: 1 },
  ORANGE: { maxActiveOperations: 3, maxPendingApprovals: 2 },
  // Acima = RED
} as const;

// =============================================================================
// UI/UX
// =============================================================================

/**
 * Cores do tema
 */
export const COLORS = {
  LOA: {
    1: '#22C55E', // Verde
    2: '#EAB308', // Amarelo
    3: '#F97316', // Laranja
    4: '#EF4444', // Vermelho
  },
  RISK_PULSE: {
    green: '#22C55E',
    yellow: '#EAB308',
    orange: '#F97316',
    red: '#EF4444',
  },
  AGENT: {
    architect: '#8B5CF6',
    developer: '#3B82F6',
    qa: '#10B981',
    security: '#EF4444',
    reviewer: '#F59E0B',
    documenter: '#6366F1',
    orchestrator: '#EC4899',
  },
} as const;

/**
 * Animações padrão
 */
export const ANIMATIONS = {
  AGENT_PULSE_DURATION: 2000, // ms
  EVENT_FADE_IN: 300, // ms
  PROGRESS_UPDATE: 100, // ms
  RISK_PULSE_INTERVAL: 1000, // ms
} as const;

// =============================================================================
// MENSAGENS DE ERRO
// =============================================================================

export const ERROR_MESSAGES = {
  INTENT_UNCLEAR: 'Não foi possível interpretar a intenção. Por favor, seja mais específico.',
  LOA_EXCEEDED: 'Esta ação requer um nível de automação maior que o permitido.',
  BLAST_RADIUS_EXCEEDED: 'O impacto potencial desta ação excede o limite de segurança.',
  DETERMINISTIC_FAILED: 'A ação não produziu resultados consistentes após 10 tentativas.',
  SECURITY_VIOLATION: 'Foram detectadas vulnerabilidades de segurança.',
  APPROVAL_TIMEOUT: 'O tempo para aprovação expirou. A ação foi cancelada por segurança.',
  APPROVAL_DENIED: 'A ação foi negada pelo usuário.',
  SANDBOX_FAILED: 'Erro na execução do sandbox.',
  AGENT_FAILED: 'Um agente falhou durante a execução.',
  ROLLBACK_FAILED: 'Erro ao reverter as mudanças.',
} as const;

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export const FEATURE_FLAGS = {
  /** Habilitar gamificação */
  GAMIFICATION_ENABLED: true,
  
  /** Habilitar simulador de Gêmeo Digital */
  TWIN_SIMULATOR_ENABLED: true,
  
  /** Habilitar sandbox real (vs mock) */
  REAL_SANDBOX_ENABLED: process.env.NODE_ENV === 'production',
  
  /** Habilitar auto-aprovação para LOA 1 */
  AUTO_APPROVE_LOA1: true,
  
  /** Habilitar visualização de agentes em tempo real */
  AGENT_VISUALIZATION_ENABLED: true,
  
  /** Modo debug (logs detalhados) */
  DEBUG_MODE: process.env.NODE_ENV === 'development',
} as const;

// =============================================================================
// STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  GUARDIAN_PROFILE: 'guardian_flow_profile',
  FLOW_HISTORY: 'guardian_flow_history',
  PREFERENCES: 'guardian_flow_preferences',
  ACHIEVEMENTS: 'guardian_flow_achievements',
  CURRENT_MISSIONS: 'guardian_flow_missions',
} as const;
