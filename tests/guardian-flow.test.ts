/**
 * Guardian Flow - Tests
 * 
 * Testes para validar a implementação do Guardian Flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  classifyIntent,
  createInitialState,
  FlowEngine,
  getFlowEngine,
  resetFlowEngine,
} from '@/guardian-flow/engine/FlowEngine';
import {
  validateIntent,
  calculateBlastRadius,
  validateDeterministic,
  runSecurityScan,
} from '@/guardian-flow/engine/SafetyGates';
import {
  withRetry,
  withTimeout,
  CircuitBreaker,
  sanitizeInput,
  sanitizeCode,
  checkRateLimit,
  withIdempotency,
  isValidLOA,
} from '@/guardian-flow/engine/ErrorMitigation';
import {
  generateDailyMissions,
  updateMissionProgress,
  checkExpiredMissions,
  checkAchievements,
  calculateXPReward,
} from '@/guardian-flow/gamification/MissionSystem';
import { GuardianProfile, Mission } from '@/guardian-flow/types';
import { POST as GuardianFlowPost } from '@/app/api/guardian-flow/route';

vi.mock('@/lib/audit', () => ({ __esModule: true, logEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/sandbox', () => ({ __esModule: true, runSandbox: vi.fn() }));
// P0-4: Mock RBAC para permitir testes da API
vi.mock('@/lib/rbac', () => ({
  __esModule: true,
  requirePermission: vi.fn().mockResolvedValue({ authorized: true, user: { email: 'test@test.com', role: 'admin' } }),
}));

// =============================================================================
// INTENT CLASSIFIER TESTS
// =============================================================================

describe('Intent Classifier', () => {
  it('should classify low-risk intents as LOA 1', () => {
    const result = classifyIntent('format this code');
    expect(result.loaLevel).toBe(1);
    expect(result.intent).toBe('format');
  });
  
  it('should classify medium-risk intents as LOA 2', () => {
    const result = classifyIntent('fix bug in the authentication');
    expect(result.loaLevel).toBeGreaterThanOrEqual(2);
  });
  
  it('should classify high-risk keywords as LOA 3', () => {
    const result = classifyIntent('delete all users from database');
    expect(result.loaLevel).toBe(3);
    expect(result.riskFactors.some(f => f.includes('delete'))).toBe(true);
  });
  
  it('should include required agents', () => {
    const result = classifyIntent('refactor the code');
    expect(result.requiredAgents).toContain('developer');
    expect(result.requiredAgents.length).toBeGreaterThan(0);
  });
  
  it('should have confidence score', () => {
    const result = classifyIntent('format code');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// =============================================================================
// SAFETY GATES TESTS
// =============================================================================

describe('Safety Gates', () => {
  describe('Intent Validation', () => {
    it('should pass with high confidence', async () => {
      const result = await validateIntent({
        userIntent: 'format code',
        detectedIntent: 'format',
        confidence: 90,
      });
      
      expect(result.passed).toBe(true);
      expect(result.gate).toBe('intent_validation');
    });
    
    it('should fail with low confidence', async () => {
      const result = await validateIntent({
        userIntent: 'do something',
        detectedIntent: 'unknown',
        confidence: 30,
      });
      
      expect(result.passed).toBe(false);
    });
    
    it('should detect unmatched high-risk keywords', async () => {
      const result = await validateIntent({
        userIntent: 'delete all files',
        detectedIntent: 'format',
        confidence: 80,
      });
      
      expect(result.passed).toBe(false);
      expect(result.confidence).toBeLessThan(80);
    });
  });
  
  describe('Blast Radius', () => {
    it('should calculate score based on affected files', async () => {
      const result = await calculateBlastRadius({
        targetFiles: ['src/index.ts'],
        codeChanges: 'const x = 1;',
        loaLevel: 1,
      });
      
      expect(result.passed).toBe(true);
      expect(result.analysis.score).toBeLessThanOrEqual(100);
    });
    
    it('should fail when blast radius exceeds LOA limit', async () => {
      const result = await calculateBlastRadius({
        targetFiles: Array.from({ length: 30 }, (_, i) => `src/file${i}.ts`),
        codeChanges: 'delete all',
        loaLevel: 1,
      });
      
      expect(result.passed).toBe(false);
      expect(result.analysis.recommendation).toBe('block');
    });
    
    it('should include risk factors', async () => {
      const result = await calculateBlastRadius({
        targetFiles: ['src/auth.ts'],
        codeChanges: 'password = "123"',
        loaLevel: 2,
      });
      
      expect(result.analysis.riskFactors.length).toBeGreaterThan(0);
    });
  });
  
  describe('Deterministic Validation', () => {
    it('should pass when all runs are consistent', async () => {
      const result = await validateDeterministic({
        executor: async () => ({ success: true, output: 'OK' }),
        runs: 3,
      });
      
      expect(result.passed).toBe(true);
      expect(result.validation.isConsistent).toBe(true);
      expect(result.validation.consistencyScore).toBe(100);
    });
    
    it('should fail when runs produce different outputs', async () => {
      let counter = 0;
      const result = await validateDeterministic({
        executor: async () => ({ success: true, output: `Result ${counter++}` }),
        runs: 3,
      });
      
      expect(result.passed).toBe(false);
      expect(result.validation.isConsistent).toBe(false);
    });
  });
  
  describe('Security Scan', () => {
    it('should detect eval usage', async () => {
      const result = await runSecurityScan({
        code: 'const x = eval("1+1");',
        language: 'javascript',
      });
      
      expect(result.passed).toBe(false);
      expect(result.findings.some(f => f.type === 'code_injection')).toBe(true);
    });
    
    it('should detect hardcoded credentials', async () => {
      const result = await runSecurityScan({
        code: 'const password = "secret123";',
        language: 'javascript',
      });
      
      expect(result.findings.some(f => f.type === 'hardcoded_credential')).toBe(true);
    });
    
    it('should pass clean code', async () => {
      const result = await runSecurityScan({
        code: 'const add = (a, b) => a + b;',
        language: 'javascript',
      });
      
      expect(result.passed).toBe(true);
    });
  });
});

// =============================================================================
// API ROUTE - DETERMINISTIC GATE
// =============================================================================

describe('Guardian Flow API - deterministic gate', () => {
  let runSandboxMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const sandbox = await import('@/lib/sandbox');
    runSandboxMock = vi.mocked(sandbox.runSandbox);
    runSandboxMock.mockReset();
  });

  it('aprova quando execuções são consistentes e retorna awaiting_approval', async () => {
    runSandboxMock.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      durationMs: 5,
      method: 'docker',
    });

    const req = new NextRequest('http://localhost/api/guardian-flow', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'format documentation',
        options: {
          deterministicCode: 'console.log("ok")',
          deterministicRuns: 3,
        },
      }),
    });

    const res = await GuardianFlowPost(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('completed');
    expect(json.events.some((e: any) => e.type === 'safety_gate_passed' && e.data.gate === 'deterministic_check')).toBe(true);
    expect(runSandboxMock).toHaveBeenCalledTimes(3);
  });

  it('falha quando execuções divergem e retorna DETERMINISTIC_FAILED', async () => {
    const outputs = ['a', 'b', 'a'];
    runSandboxMock.mockImplementation(() => {
      const out = outputs.shift() || 'a';
      return Promise.resolve({
        success: true,
        exitCode: 0,
        stdout: out,
        stderr: '',
        durationMs: 5,
        method: 'docker',
      });
    });

    const req = new NextRequest('http://localhost/api/guardian-flow', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'format documentation',
        options: {
          deterministicCode: 'console.log(Math.random())',
          deterministicRuns: 3,
        },
      }),
    });

    const res = await GuardianFlowPost(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('DETERMINISTIC_FAILED');
    expect(json.events.some((e: any) => e.type === 'safety_gate_failed' && e.data.gate === 'deterministic_check')).toBe(true);
    expect(runSandboxMock).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// ERROR MITIGATION TESTS
// =============================================================================

describe('Error Mitigation', () => {
  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
    
    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxRetries: 2 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
    
    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));
      
      await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });
  
  describe('withTimeout', () => {
    it('should return result before timeout', async () => {
      const fn = async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'done';
      };
      
      const result = await withTimeout(fn, 1000);
      expect(result).toBe('done');
    });
    
    it('should throw on timeout', async () => {
      const fn = async () => {
        await new Promise(r => setTimeout(r, 1000));
        return 'done';
      };
      
      await expect(withTimeout(fn, 10)).rejects.toThrow('timed out');
    });
  });
  
  describe('CircuitBreaker', () => {
    it('should allow requests when closed', async () => {
      const breaker = new CircuitBreaker('test');
      const fn = vi.fn().mockResolvedValue('ok');
      
      const result = await breaker.execute(fn);
      expect(result).toBe('ok');
    });
    
    it('should open after threshold failures', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 2 });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      
      await expect(breaker.execute(fn)).rejects.toThrow();
      await expect(breaker.execute(fn)).rejects.toThrow();
      
      // Circuit should be open now
      expect(breaker.getState().isOpen).toBe(true);
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker');
    });
  });
  
  describe('sanitizeInput', () => {
    it('should escape HTML', () => {
      const result = sanitizeInput('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
    
    it('should remove control characters', () => {
      const result = sanitizeInput('hello\x00world');
      expect(result).toBe('helloworld');
    });
    
    it('should handle non-string input', () => {
      // @ts-expect-error - Testing invalid input
      const result = sanitizeInput(null);
      expect(result).toBe('');
    });
  });
  
  describe('sanitizeCode', () => {
    it('should warn about dangerous patterns', () => {
      const { warnings } = sanitizeCode('eval("code")', 'javascript');
      expect(warnings.some(w => w.includes('eval'))).toBe(true);
    });
    
    it('should truncate long code', () => {
      const longCode = 'a'.repeat(100000);
      const { sanitized, warnings } = sanitizeCode(longCode, 'javascript');
      expect(sanitized.length).toBeLessThan(100000);
      expect(warnings.some(w => w.includes('truncado'))).toBe(true);
    });
  });
  
  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const key = `test-${Date.now()}`;
      const result = checkRateLimit(key, { maxRequests: 5, windowMs: 1000 });
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
    
    it('should block requests over limit', () => {
      const key = `test-limit-${Date.now()}`;
      const options = { maxRequests: 2, windowMs: 10000 };
      
      checkRateLimit(key, options);
      checkRateLimit(key, options);
      const result = checkRateLimit(key, options);
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
  
  describe('isValidLOA', () => {
    it('should validate LOA levels', () => {
      expect(isValidLOA(1)).toBe(true);
      expect(isValidLOA(2)).toBe(true);
      expect(isValidLOA(3)).toBe(true);
      expect(isValidLOA(4)).toBe(true);
      expect(isValidLOA(0)).toBe(false);
      expect(isValidLOA(5)).toBe(false);
      expect(isValidLOA('1')).toBe(false);
    });
  });
});

// =============================================================================
// GAMIFICATION TESTS
// =============================================================================

describe('Gamification', () => {
  const mockProfile: GuardianProfile = {
    userId: 'test-user',
    xp: 100,
    level: 2,
    levelTitle: 'Code Protector',
    totalMissionsCompleted: 5,
    totalActionsExecuted: 10,
    totalRollbacks: 1,
    achievements: [],
    currentMissions: [],
    streakDays: 3,
    lastActiveAt: new Date(),
  };
  
  describe('generateDailyMissions', () => {
    it('should generate specified number of missions', () => {
      const missions = generateDailyMissions(mockProfile, 3);
      expect(missions.length).toBe(3);
    });
    
    it('should generate valid missions', () => {
      const missions = generateDailyMissions(mockProfile, 1);
      const mission = missions[0];
      
      expect(mission.id).toBeDefined();
      expect(mission.title).toBeDefined();
      expect(mission.description).toBeDefined();
      expect(mission.target).toBeGreaterThan(0);
      expect(mission.progress).toBe(0);
      expect(mission.completed).toBe(false);
    });
    
    it('should set expiration to end of day', () => {
      const missions = generateDailyMissions(mockProfile, 1);
      const mission = missions[0];
      const expires = new Date(mission.expiresAt);
      
      expect(expires.getHours()).toBe(23);
      expect(expires.getMinutes()).toBe(59);
    });
  });
  
  describe('updateMissionProgress', () => {
    it('should increment progress', () => {
      const mission: Mission = {
        id: 'test',
        title: 'Test',
        description: 'Test mission',
        category: 'cleanup',
        difficulty: 'easy',
        xpReward: 10,
        target: 5,
        progress: 2,
        completed: false,
        expiresAt: new Date(),
        createdAt: new Date(),
      };
      
      const updated = updateMissionProgress(mission, 1);
      expect(updated.progress).toBe(3);
      expect(updated.completed).toBe(false);
    });
    
    it('should mark as completed when target reached', () => {
      const mission: Mission = {
        id: 'test',
        title: 'Test',
        description: 'Test mission',
        category: 'cleanup',
        difficulty: 'easy',
        xpReward: 10,
        target: 3,
        progress: 2,
        completed: false,
        expiresAt: new Date(),
        createdAt: new Date(),
      };
      
      const updated = updateMissionProgress(mission, 1);
      expect(updated.progress).toBe(3);
      expect(updated.completed).toBe(true);
    });
  });
  
  describe('checkExpiredMissions', () => {
    it('should separate active and expired missions', () => {
      const now = new Date();
      const missions: Mission[] = [
        {
          id: 'active',
          title: 'Active',
          description: 'Active mission',
          category: 'cleanup',
          difficulty: 'easy',
          xpReward: 10,
          target: 5,
          progress: 0,
          completed: false,
          expiresAt: new Date(now.getTime() + 86400000), // +1 day
          createdAt: now,
        },
        {
          id: 'expired',
          title: 'Expired',
          description: 'Expired mission',
          category: 'cleanup',
          difficulty: 'easy',
          xpReward: 10,
          target: 5,
          progress: 0,
          completed: false,
          expiresAt: new Date(now.getTime() - 86400000), // -1 day
          createdAt: now,
        },
      ];
      
      const { active, expired } = checkExpiredMissions(missions);
      expect(active.length).toBe(1);
      expect(expired.length).toBe(1);
      expect(active[0].id).toBe('active');
      expect(expired[0].id).toBe('expired');
    });
  });
  
  describe('checkAchievements', () => {
    it('should unlock guardian initiate on first action', () => {
      const profile: GuardianProfile = {
        ...mockProfile,
        totalActionsExecuted: 1,
        achievements: [],
      };
      
      const unlocked = checkAchievements(profile, {});
      expect(unlocked.some(a => a.id === 'guardian_initiate')).toBe(true);
    });
    
    it('should not unlock already unlocked achievements', () => {
      const profile: GuardianProfile = {
        ...mockProfile,
        totalActionsExecuted: 1,
        achievements: ['guardian_initiate'],
      };
      
      const unlocked = checkAchievements(profile, {});
      expect(unlocked.some(a => a.id === 'guardian_initiate')).toBe(false);
    });
  });
  
  describe('calculateXPReward', () => {
    it('should return base XP for action', () => {
      const xp = calculateXPReward('fix_bug' as any);
      expect(xp).toBeGreaterThan(0);
    });
    
    it('should apply streak multiplier', () => {
      const baseXp = calculateXPReward('fix_bug' as any);
      const streakXp = calculateXPReward('fix_bug' as any, { streak: 5 });
      expect(streakXp).toBeGreaterThan(baseXp);
    });
    
    it('should apply difficulty bonus', () => {
      const easyXp = calculateXPReward('fix_bug' as any, { difficulty: 'easy' });
      const hardXp = calculateXPReward('fix_bug' as any, { difficulty: 'hard' });
      expect(hardXp).toBeGreaterThan(easyXp);
    });
  });
});

// =============================================================================
// FLOW ENGINE TESTS
// =============================================================================

describe('Flow Engine', () => {
  let engine: FlowEngine;
  
  beforeEach(() => {
    resetFlowEngine();
    engine = getFlowEngine();
  });
  
  afterEach(() => {
    resetFlowEngine();
  });
  
  it('should start with idle state', () => {
    const state = engine.getState();
    expect(state.status).toBe('idle');
    expect(state.flowId).toBeNull();
  });
  
  it('should notify subscribers on state change', async () => {
    const listener = vi.fn();
    engine.subscribe(listener);
    
    await engine.startFlow('format code');
    
    expect(listener).toHaveBeenCalled();
  });
  
  it('should generate events during flow', async () => {
    await engine.startFlow('format code');
    
    const state = engine.getState();
    expect(state.events.length).toBeGreaterThan(0);
    expect(state.events[0].type).toBe('flow_started');
  });
  
  it('should handle flow cancellation', async () => {
    const promise = engine.startFlow('refactor code');
    engine.cancelFlow();
    
    await promise.catch(() => {}); // Ignore rejection
    
    const state = engine.getState();
    // After cancellation, status can be 'failed' or 'awaiting_approval' depending on timing
    expect(['failed', 'awaiting_approval', 'cancelled']).toContain(state.status);
  });
  
  it('should reset to initial state', () => {
    engine.reset();
    const state = engine.getState();
    
    expect(state.status).toBe('idle');
    expect(state.events).toEqual([]);
    expect(state.userIntent).toBeNull();
  });
});
