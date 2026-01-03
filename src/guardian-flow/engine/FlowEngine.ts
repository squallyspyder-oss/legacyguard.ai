/**
 * Guardian Flow - Flow Engine
 * 
 * Motor principal de orquestração do Guardian Flow
 * Gerencia o ciclo de vida completo de uma ação segura
 * @module guardian-flow/engine/FlowEngine
 */

import {
  GuardianFlowState,
  FlowStatus,
  FlowEvent,
  FlowEventType,
  FlowAction,
  LOALevel,
  AgentRole,
  AgentState,
  RiskPulse,
  SafetyCheckpoint,
  GuardianFlowError,
  ERROR_CODES,
  AGENT_METADATA,
} from '../types';
import {
  LIMITS,
  TIMEOUTS,
  INTENT_LOA_MAPPING,
  RISK_KEYWORDS,
  REQUIRED_AGENTS,
  FEATURE_FLAGS,
  COLORS,
} from '../constants';
import {
  runSafetyCheckpoint,
  validateIntent,
  calculateBlastRadius,
  validateDeterministic,
  runSecurityScan,
  requestHumanApproval,
  approveRequest,
  denyRequest,
} from './SafetyGates';

// =============================================================================
// INITIAL STATE
// =============================================================================

function createInitialAgentState(role: AgentRole): AgentState {
  return {
    role,
    status: 'idle',
    progress: 0,
    emoji: AGENT_METADATA[role].emoji,
    color: AGENT_METADATA[role].color,
    lastUpdate: new Date(),
  };
}

export function createInitialState(): GuardianFlowState {
  return {
    flowId: null,
    status: 'idle',
    riskPulse: 'green',
    
    userIntent: null,
    detectedIntent: null,
    loaLevel: null,
    
    agents: {
      architect: createInitialAgentState('architect'),
      developer: createInitialAgentState('developer'),
      qa: createInitialAgentState('qa'),
      security: createInitialAgentState('security'),
      reviewer: createInitialAgentState('reviewer'),
      documenter: createInitialAgentState('documenter'),
      orchestrator: createInitialAgentState('orchestrator'),
    },
    activeAgents: [],
    
    events: [],
    currentPhase: 'idle',
    
    safetyCheckpoint: null,
    pendingApproval: null,
    
    sandboxId: null,
    sandboxLogs: [],
    
    result: null,
    
    startedAt: null,
    completedAt: null,
    durationMs: 0,
  };
}

// =============================================================================
// INTENT CLASSIFIER
// =============================================================================

export interface ClassifiedIntent {
  intent: string;
  confidence: number;
  loaLevel: LOALevel;
  requiredAgents: AgentRole[];
  riskFactors: string[];
}

/**
 * Classifica a intenção do usuário e determina LOA
 */
export function classifyIntent(userIntent: string): ClassifiedIntent {
  const lowerIntent = userIntent.toLowerCase();
  
  // Detectar intenção baseado em keywords
  let detectedIntent = 'unknown';
  let confidence = 50;
  let loaLevel: LOALevel = 2; // Default médio
  const riskFactors: string[] = [];
  
  // Mapear keywords para intenções
  for (const [intent, loa] of Object.entries(INTENT_LOA_MAPPING)) {
    if (lowerIntent.includes(intent.replace('_', ' '))) {
      detectedIntent = intent;
      loaLevel = loa as LOALevel;
      confidence = 80;
      break;
    }
  }
  
  // Verificar keywords de risco para ajustar LOA
  for (const keyword of RISK_KEYWORDS.HIGH_RISK) {
    if (lowerIntent.includes(keyword)) {
      riskFactors.push(`high_risk_keyword:${keyword}`);
      if (loaLevel < 3) {
        loaLevel = 3;
        confidence = Math.max(confidence - 10, 50);
      }
    }
  }
  
  for (const keyword of RISK_KEYWORDS.MEDIUM_RISK) {
    if (lowerIntent.includes(keyword) && !riskFactors.some(f => f.includes(keyword))) {
      riskFactors.push(`medium_risk_keyword:${keyword}`);
      if (loaLevel < 2) {
        loaLevel = 2;
      }
    }
  }
  
  // Determinar agentes necessários
  const requiredAgents = REQUIRED_AGENTS[detectedIntent] || REQUIRED_AGENTS['default'];
  
  // Adicionar agentes baseado em risco
  if (loaLevel >= 3 && !requiredAgents.includes('security')) {
    requiredAgents.push('security');
  }
  if (loaLevel >= 2 && !requiredAgents.includes('reviewer')) {
    requiredAgents.push('reviewer');
  }
  
  return {
    intent: detectedIntent,
    confidence,
    loaLevel,
    requiredAgents: [...new Set(requiredAgents)],
    riskFactors,
  };
}

// =============================================================================
// RISK PULSE CALCULATOR
// =============================================================================

/**
 * Calcula o pulse de risco atual
 */
export function calculateRiskPulse(state: GuardianFlowState): RiskPulse {
  const activeOperations = state.activeAgents.length;
  const hasPendingApproval = state.pendingApproval?.required || false;
  const hasFailedGates = state.safetyCheckpoint?.gates.some(g => !g.passed) || false;
  
  if (hasFailedGates || state.status === 'failed') {
    return 'red';
  }
  
  if (hasPendingApproval) {
    return 'orange';
  }
  
  if (activeOperations > 0 || state.status === 'executing' || state.status === 'validating') {
    return 'yellow';
  }
  
  return 'green';
}

// =============================================================================
// FLOW ENGINE
// =============================================================================

export class FlowEngine {
  private state: GuardianFlowState;
  private listeners: Set<(state: GuardianFlowState) => void>;
  private abortController: AbortController | null;
  
  constructor(initialState?: Partial<GuardianFlowState>) {
    this.state = { ...createInitialState(), ...initialState };
    this.listeners = new Set();
    this.abortController = null;
  }
  
  // ---------------------------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------------------------
  
  getState(): GuardianFlowState {
    return { ...this.state };
  }
  
  subscribe(listener: (state: GuardianFlowState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private setState(updates: Partial<GuardianFlowState>): void {
    this.state = {
      ...this.state,
      ...updates,
      riskPulse: calculateRiskPulse({ ...this.state, ...updates }),
    };
    
    // Atualizar duração se em andamento
    if (this.state.startedAt && !this.state.completedAt) {
      this.state.durationMs = Date.now() - this.state.startedAt.getTime();
    }
    
    // Notificar listeners
    this.listeners.forEach(listener => listener(this.getState()));
  }
  
  private addEvent(type: FlowEventType, data: Record<string, unknown> = {}): void {
    const event: FlowEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      timestamp: new Date(),
      data,
    };
    
    const events = [...this.state.events, event];
    
    // Limitar eventos em memória
    if (events.length > LIMITS.MAX_EVENTS_IN_MEMORY) {
      events.shift();
    }
    
    this.setState({ events });
  }
  
  // ---------------------------------------------------------------------------
  // AGENT MANAGEMENT
  // ---------------------------------------------------------------------------
  
  private updateAgent(role: AgentRole, updates: Partial<AgentState>): void {
    const agents = {
      ...this.state.agents,
      [role]: {
        ...this.state.agents[role],
        ...updates,
        lastUpdate: new Date(),
      },
    };
    
    // Atualizar lista de agentes ativos
    const activeAgents = Object.entries(agents)
      .filter(([_, state]) => state.status === 'working' || state.status === 'thinking')
      .map(([role]) => role as AgentRole);
    
    this.setState({ agents, activeAgents });
    
    this.addEvent('agent_progress', {
      role,
      ...updates,
    });
  }
  
  private activateAgents(roles: AgentRole[]): void {
    for (const role of roles) {
      this.updateAgent(role, { status: 'thinking', progress: 0 });
    }
  }
  
  private deactivateAllAgents(): void {
    const agents = { ...this.state.agents };
    for (const role of Object.keys(agents) as AgentRole[]) {
      agents[role] = {
        ...agents[role],
        status: 'idle',
        progress: 0,
        currentTask: undefined,
        lastUpdate: new Date(),
      };
    }
    this.setState({ agents, activeAgents: [] });
  }
  
  // ---------------------------------------------------------------------------
  // SANDBOX MANAGEMENT
  // ---------------------------------------------------------------------------
  
  private addSandboxLog(message: string): void {
    const logs = [...this.state.sandboxLogs, `[${new Date().toISOString()}] ${message}`];
    
    // Limitar tamanho de logs
    const totalSize = logs.join('\n').length;
    if (totalSize > LIMITS.MAX_SANDBOX_LOG_SIZE) {
      logs.shift();
    }
    
    this.setState({ sandboxLogs: logs });
  }
  
  // ---------------------------------------------------------------------------
  // FLOW LIFECYCLE
  // ---------------------------------------------------------------------------
  
  /**
   * Inicia um novo fluxo Guardian
   */
  async startFlow(userIntent: string, context?: Record<string, unknown>): Promise<void> {
    // Validar estado
    if (this.state.status !== 'idle' && this.state.status !== 'completed' && this.state.status !== 'failed') {
      throw new GuardianFlowError(
        'Já existe um fluxo em andamento',
        'FLOW_IN_PROGRESS',
        false
      );
    }
    
    // Reset state
    this.setState({
      ...createInitialState(),
      flowId: `flow_${Date.now()}`,
      status: 'analyzing',
      userIntent,
      startedAt: new Date(),
    });
    
    this.abortController = new AbortController();
    
    this.addEvent('flow_started', { userIntent, context });
    
    try {
      // Fase 1: Classificar intenção
      this.setState({ currentPhase: 'Classificando intenção...' });
      this.updateAgent('orchestrator', { status: 'working', currentTask: 'Analisando intenção' });
      
      const classified = classifyIntent(userIntent);
      
      this.setState({
        detectedIntent: classified.intent,
        loaLevel: classified.loaLevel,
      });
      
      this.addEvent('intent_detected', {
        intent: classified.intent,
        confidence: classified.confidence,
        loaLevel: classified.loaLevel,
      });
      
      this.addEvent('loa_classified', {
        level: classified.loaLevel,
        requiredAgents: classified.requiredAgents,
      });
      
      // Fase 2: Validação de intenção
      this.setState({ currentPhase: 'Validando interpretação...' });
      
      const intentValidation = await validateIntent({
        userIntent,
        detectedIntent: classified.intent,
        confidence: classified.confidence,
      });
      
      this.addEvent('safety_gate_started', { gate: 'intent_validation' });
      
      if (!intentValidation.passed) {
        this.addEvent('safety_gate_failed', {
          gate: 'intent_validation',
          message: intentValidation.message,
        });
        
        this.setState({
          status: 'failed',
          result: {
            success: false,
            error: intentValidation.message,
            rollbackAvailable: false,
          },
          completedAt: new Date(),
        });
        
        this.deactivateAllAgents();
        this.addEvent('flow_failed', { reason: 'intent_validation' });
        return;
      }
      
      this.addEvent('safety_gate_passed', { gate: 'intent_validation' });
      
      // Fase 3: Ativar agentes
      this.setState({
        status: 'planning',
        currentPhase: 'Ativando agentes...',
      });
      
      this.activateAgents(classified.requiredAgents);
      
      for (const role of classified.requiredAgents) {
        this.addEvent('agent_assigned', { role, task: classified.intent });
      }
      
      // Fase 4: Verificar LOA e aprovação
      if (classified.loaLevel >= 2) {
        this.setState({
          status: 'awaiting_approval',
          currentPhase: 'Aguardando aprovação...',
          pendingApproval: {
            required: true,
            reason: `Ação de LOA ${classified.loaLevel} requer aprovação humana`,
            expiresAt: new Date(Date.now() + TIMEOUTS.HUMAN_APPROVAL_LOA2),
          },
        });
        
        this.addEvent('approval_requested', {
          loaLevel: classified.loaLevel,
          reason: classified.riskFactors,
        });
        
        // Aguardar aprovação externa (via approveAction/denyAction)
        return;
      }
      
      // LOA 1: Prosseguir automaticamente
      await this.executeFlow(context);
      
    } catch (error) {
      this.handleError(error);
    }
  }
  
  /**
   * Continua execução após aprovação
   */
  async approveAction(approvedBy: string): Promise<void> {
    if (this.state.status !== 'awaiting_approval') {
      throw new GuardianFlowError(
        'Nenhuma ação aguardando aprovação',
        'NO_PENDING_APPROVAL',
        false
      );
    }
    
    this.addEvent('approval_granted', { approvedBy });
    
    this.setState({
      pendingApproval: null,
      safetyCheckpoint: this.state.safetyCheckpoint
        ? {
            ...this.state.safetyCheckpoint,
            approvedBy,
            approvedAt: new Date(),
          }
        : null,
    });
    
    await this.executeFlow();
  }
  
  /**
   * Nega uma ação pendente
   */
  denyAction(deniedBy: string, reason: string): void {
    if (this.state.status !== 'awaiting_approval') {
      throw new GuardianFlowError(
        'Nenhuma ação aguardando aprovação',
        'NO_PENDING_APPROVAL',
        false
      );
    }
    
    this.addEvent('approval_denied', { deniedBy, reason });
    
    this.setState({
      status: 'failed',
      pendingApproval: null,
      result: {
        success: false,
        error: `Negado por ${deniedBy}: ${reason}`,
        rollbackAvailable: false,
      },
      completedAt: new Date(),
    });
    
    this.deactivateAllAgents();
    this.addEvent('flow_failed', { reason: 'approval_denied' });
  }
  
  /**
   * Executa o fluxo principal
   */
  private async executeFlow(context?: Record<string, unknown>): Promise<void> {
    this.setState({
      status: 'executing',
      currentPhase: 'Executando ação...',
    });
    
    try {
      // Simular trabalho dos agentes
      for (const role of this.state.activeAgents) {
        this.updateAgent(role, { status: 'working', progress: 0 });
        
        // Simular progresso
        for (let i = 0; i <= 100; i += 20) {
          await this.delay(200);
          this.updateAgent(role, { progress: i });
        }
        
        this.updateAgent(role, { status: 'done', progress: 100 });
        this.addEvent('agent_completed', { role });
      }
      
      // Fase de validação
      this.setState({
        status: 'validating',
        currentPhase: 'Validando resultado...',
      });
      
      // Simular validação determinística
      this.addEvent('sandbox_created', { id: `sandbox_${Date.now()}` });
      this.addSandboxLog('Sandbox criado');
      this.addSandboxLog('Executando validação 10x...');
      
      for (let i = 1; i <= 10; i++) {
        await this.delay(100);
        this.addSandboxLog(`Run ${i}/10: OK`);
      }
      
      this.addEvent('sandbox_executed', { runs: 10, consistent: true });
      this.addSandboxLog('Todas as execuções consistentes');
      this.addEvent('sandbox_destroyed', {});
      
      // Sucesso!
      this.setState({
        status: 'completed',
        currentPhase: 'Concluído',
        result: {
          success: true,
          output: 'Ação executada com sucesso',
          rollbackAvailable: true,
        },
        completedAt: new Date(),
      });
      
      this.addEvent('action_executed', { success: true });
      this.addEvent('flow_completed', { success: true });
      
      this.deactivateAllAgents();
      
    } catch (error) {
      this.handleError(error);
    }
  }
  
  /**
   * Cancela o fluxo atual
   */
  cancelFlow(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.setState({
      status: 'failed',
      result: {
        success: false,
        error: 'Fluxo cancelado pelo usuário',
        rollbackAvailable: false,
      },
      completedAt: new Date(),
    });
    
    this.deactivateAllAgents();
    this.addEvent('flow_failed', { reason: 'cancelled' });
  }
  
  /**
   * Faz rollback da última ação
   */
  async rollback(): Promise<void> {
    if (!this.state.result?.rollbackAvailable) {
      throw new GuardianFlowError(
        'Rollback não disponível',
        'ROLLBACK_UNAVAILABLE',
        false
      );
    }
    
    this.setState({
      status: 'executing',
      currentPhase: 'Revertendo mudanças...',
    });
    
    this.updateAgent('orchestrator', { status: 'working', currentTask: 'Rollback' });
    
    await this.delay(1000);
    
    this.setState({
      status: 'rolled_back',
      result: {
        ...this.state.result,
        rollbackAvailable: false,
      },
      completedAt: new Date(),
    });
    
    this.addEvent('action_rolled_back', {});
    this.deactivateAllAgents();
  }
  
  /**
   * Reseta o engine para estado inicial
   */
  reset(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.setState(createInitialState());
  }
  
  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  
  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    const code = error instanceof GuardianFlowError ? error.code : 'UNKNOWN';
    
    this.setState({
      status: 'failed',
      result: {
        success: false,
        error: message,
        rollbackAvailable: false,
      },
      completedAt: new Date(),
    });
    
    this.deactivateAllAgents();
    this.addEvent('flow_failed', { reason: code, message });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let engineInstance: FlowEngine | null = null;

export function getFlowEngine(): FlowEngine {
  if (!engineInstance) {
    engineInstance = new FlowEngine();
  }
  return engineInstance;
}

export function resetFlowEngine(): void {
  if (engineInstance) {
    engineInstance.reset();
  }
  engineInstance = null;
}
