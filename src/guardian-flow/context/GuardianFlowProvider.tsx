/**
 * Guardian Flow - React Context Provider
 * 
 * Provider para estado global do Guardian Flow
 * @module guardian-flow/context/GuardianFlowProvider
 */

'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import {
  GuardianFlowState,
  FlowAction,
  LOALevel,
  AgentRole,
  GuardianProfile,
  Mission,
  GUARDIAN_LEVELS,
} from '../types';
import {
  STORAGE_KEYS,
  FEATURE_FLAGS,
  XP_ACTIONS,
} from '../constants';
import {
  FlowEngine,
  getFlowEngine,
  createInitialState,
} from '../engine/FlowEngine';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface GuardianFlowContextValue {
  // State
  state: GuardianFlowState;
  profile: GuardianProfile | null;
  
  // Flow Actions
  startFlow: (intent: string, context?: Record<string, unknown>) => Promise<void>;
  cancelFlow: () => void;
  approveAction: (approvedBy?: string) => Promise<void>;
  denyAction: (reason: string) => void;
  rollback: () => Promise<void>;
  reset: () => void;
  
  // Profile Actions
  addXP: (amount: number) => void;
  completeMission: (missionId: string) => void;
  
  // Utilities
  isFlowActive: boolean;
  canApprove: boolean;
  canRollback: boolean;
}

// =============================================================================
// PROFILE REDUCER
// =============================================================================

type ProfileAction =
  | { type: 'SET_PROFILE'; payload: GuardianProfile }
  | { type: 'ADD_XP'; payload: number }
  | { type: 'COMPLETE_MISSION'; payload: string }
  | { type: 'INCREMENT_ACTIONS' }
  | { type: 'INCREMENT_ROLLBACKS' };

function createInitialProfile(): GuardianProfile {
  return {
    userId: 'anonymous',
    xp: 0,
    level: 1,
    levelTitle: GUARDIAN_LEVELS[1].title,
    totalMissionsCompleted: 0,
    totalActionsExecuted: 0,
    totalRollbacks: 0,
    achievements: [],
    currentMissions: [],
    streakDays: 0,
    lastActiveAt: new Date(),
  };
}

function calculateLevel(xp: number): { level: number; title: string } {
  for (let i = 5; i >= 1; i--) {
    const levelConfig = GUARDIAN_LEVELS[i as keyof typeof GUARDIAN_LEVELS];
    if (xp >= levelConfig.minXp) {
      return { level: i, title: levelConfig.title };
    }
  }
  return { level: 1, title: GUARDIAN_LEVELS[1].title };
}

function profileReducer(state: GuardianProfile, action: ProfileAction): GuardianProfile {
  switch (action.type) {
    case 'SET_PROFILE':
      return action.payload;
      
    case 'ADD_XP': {
      const newXp = state.xp + action.payload;
      const { level, title } = calculateLevel(newXp);
      return {
        ...state,
        xp: newXp,
        level: level as GuardianProfile['level'],
        levelTitle: title,
        lastActiveAt: new Date(),
      };
    }
    
    case 'COMPLETE_MISSION': {
      const mission = state.currentMissions.find(m => m.id === action.payload);
      if (!mission) return state;
      
      return {
        ...state,
        totalMissionsCompleted: state.totalMissionsCompleted + 1,
        currentMissions: state.currentMissions.filter(m => m.id !== action.payload),
        lastActiveAt: new Date(),
      };
    }
    
    case 'INCREMENT_ACTIONS':
      return {
        ...state,
        totalActionsExecuted: state.totalActionsExecuted + 1,
        lastActiveAt: new Date(),
      };
      
    case 'INCREMENT_ROLLBACKS':
      return {
        ...state,
        totalRollbacks: state.totalRollbacks + 1,
        lastActiveAt: new Date(),
      };
      
    default:
      return state;
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

const GuardianFlowContext = createContext<GuardianFlowContextValue | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

interface GuardianFlowProviderProps {
  children: ReactNode;
}

export function GuardianFlowProvider({ children }: GuardianFlowProviderProps) {
  // Engine instance
  const engineRef = useRef<FlowEngine | null>(null);
  
  // Flow state
  const [flowState, setFlowState] = React.useState<GuardianFlowState>(createInitialState);
  
  // Profile state
  const [profile, dispatchProfile] = useReducer(profileReducer, null, () => {
    // Load from storage on init
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.GUARDIAN_PROFILE);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            ...createInitialProfile(),
            ...parsed,
            lastActiveAt: new Date(parsed.lastActiveAt),
          };
        }
      } catch {
        // Ignore parse errors
      }
    }
    return createInitialProfile();
  });
  
  // Initialize engine
  useEffect(() => {
    engineRef.current = getFlowEngine();
    
    // Subscribe to state changes
    const unsubscribe = engineRef.current.subscribe((newState) => {
      setFlowState(newState);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Persist profile
  useEffect(() => {
    if (typeof window !== 'undefined' && profile) {
      localStorage.setItem(STORAGE_KEYS.GUARDIAN_PROFILE, JSON.stringify(profile));
    }
  }, [profile]);
  
  // ==========================================================================
  // FLOW ACTIONS
  // ==========================================================================
  
  const startFlow = useCallback(async (intent: string, context?: Record<string, unknown>) => {
    if (!engineRef.current) return;
    
    await engineRef.current.startFlow(intent, context);
  }, []);
  
  const cancelFlow = useCallback(() => {
    if (!engineRef.current) return;
    
    engineRef.current.cancelFlow();
  }, []);
  
  const approveAction = useCallback(async (approvedBy: string = 'user') => {
    if (!engineRef.current) return;
    
    await engineRef.current.approveAction(approvedBy);
    
    // Add XP for completing action
    dispatchProfile({ type: 'ADD_XP', payload: XP_ACTIONS.FLOW_COMPLETED });
    dispatchProfile({ type: 'INCREMENT_ACTIONS' });
  }, []);
  
  const denyAction = useCallback((reason: string) => {
    if (!engineRef.current) return;
    
    engineRef.current.denyAction('user', reason);
  }, []);
  
  const rollback = useCallback(async () => {
    if (!engineRef.current) return;
    
    await engineRef.current.rollback();
    dispatchProfile({ type: 'INCREMENT_ROLLBACKS' });
  }, []);
  
  const reset = useCallback(() => {
    if (!engineRef.current) return;
    
    engineRef.current.reset();
  }, []);
  
  // ==========================================================================
  // PROFILE ACTIONS
  // ==========================================================================
  
  const addXP = useCallback((amount: number) => {
    dispatchProfile({ type: 'ADD_XP', payload: amount });
  }, []);
  
  const completeMission = useCallback((missionId: string) => {
    dispatchProfile({ type: 'COMPLETE_MISSION', payload: missionId });
  }, []);
  
  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================
  
  const isFlowActive = flowState.status !== 'idle' &&
                       flowState.status !== 'completed' &&
                       flowState.status !== 'failed' &&
                       flowState.status !== 'rolled_back';
  
  const canApprove = flowState.status === 'awaiting_approval';
  
  const canRollback = flowState.result?.rollbackAvailable ?? false;
  
  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================
  
  const value: GuardianFlowContextValue = {
    state: flowState,
    profile,
    startFlow,
    cancelFlow,
    approveAction,
    denyAction,
    rollback,
    reset,
    addXP,
    completeMission,
    isFlowActive,
    canApprove,
    canRollback,
  };
  
  return (
    <GuardianFlowContext.Provider value={value}>
      {children}
    </GuardianFlowContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useGuardianFlow(): GuardianFlowContextValue {
  const context = useContext(GuardianFlowContext);
  
  if (!context) {
    throw new Error('useGuardianFlow must be used within GuardianFlowProvider');
  }
  
  return context;
}

// =============================================================================
// SELECTORS (para performance)
// =============================================================================

export function useFlowStatus() {
  const { state } = useGuardianFlow();
  return state.status;
}

export function useRiskPulse() {
  const { state } = useGuardianFlow();
  return state.riskPulse;
}

export function useActiveAgents() {
  const { state } = useGuardianFlow();
  return state.activeAgents;
}

export function useFlowEvents() {
  const { state } = useGuardianFlow();
  return state.events;
}

export function useGuardianProfile() {
  const { profile } = useGuardianFlow();
  return profile;
}
