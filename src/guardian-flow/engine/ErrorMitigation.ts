/**
 * Guardian Flow - Error Mitigation & Safety Utilities
 * 
 * Utilitários para prevenção e mitigação de erros
 * @module guardian-flow/engine/ErrorMitigation
 */

import { GuardianFlowError, ERROR_CODES } from '../types';
import { LIMITS, TIMEOUTS, ERROR_MESSAGES } from '../constants';

// =============================================================================
// RETRY WITH EXPONENTIAL BACKOFF
// =============================================================================

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryOn?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Executa uma função com retry e backoff exponencial
 * Mitigação: Transient failures (network, rate limit)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = LIMITS.MAX_RETRIES,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    retryOn = () => true,
    onRetry,
  } = options;
  
  let lastError: unknown;
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Não fazer retry se for o último attempt ou se retryOn retornar false
      if (attempt > maxRetries || !retryOn(error)) {
        break;
      }
      
      onRetry?.(attempt, error);
      
      // Aguardar com backoff
      await sleep(delay);
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }
  
  throw lastError;
}

// =============================================================================
// TIMEOUT WRAPPER
// =============================================================================

/**
 * Executa uma função com timeout
 * Mitigação: Operações travadas
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new GuardianFlowError(errorMessage, 'TIMEOUT', true));
    }, timeoutMs);
  });
  
  return Promise.race([fn(), timeoutPromise]);
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number | null;
  isOpen: boolean;
  halfOpenAttempts: number;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxAttempts?: number;
}

/**
 * Implementa o padrão Circuit Breaker
 * Mitigação: Cascade failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    isOpen: false,
    halfOpenAttempts: 0,
  };
  
  private options: Required<CircuitBreakerOptions>;
  
  constructor(
    private name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000,
      halfOpenMaxAttempts: options.halfOpenMaxAttempts ?? 3,
    };
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Verificar se circuit está aberto
    if (this.state.isOpen) {
      const timeSinceLastFailure = Date.now() - (this.state.lastFailure || 0);
      
      if (timeSinceLastFailure < this.options.resetTimeout) {
        throw new GuardianFlowError(
          `Circuit breaker "${this.name}" is open`,
          'CIRCUIT_OPEN',
          true
        );
      }
      
      // Tentar half-open
      if (this.state.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        throw new GuardianFlowError(
          `Circuit breaker "${this.name}" is in half-open state`,
          'CIRCUIT_HALF_OPEN',
          true
        );
      }
      
      this.state.halfOpenAttempts++;
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.state = {
      failures: 0,
      lastFailure: null,
      isOpen: false,
      halfOpenAttempts: 0,
    };
  }
  
  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailure = Date.now();
    
    if (this.state.failures >= this.options.failureThreshold) {
      this.state.isOpen = true;
    }
  }
  
  getState(): CircuitBreakerState {
    return { ...this.state };
  }
  
  reset(): void {
    this.state = {
      failures: 0,
      lastFailure: null,
      isOpen: false,
      halfOpenAttempts: 0,
    };
  }
}

// =============================================================================
// INPUT SANITIZATION
// =============================================================================

/**
 * Sanitiza input de usuário
 * Mitigação: Injection attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    // Remover caracteres de controle
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Escapar HTML básico
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    // Limitar tamanho
    .substring(0, LIMITS.MAX_INLINE_CODE_SIZE);
}

/**
 * Valida e sanitiza código
 * Mitigação: Code injection
 */
export function sanitizeCode(code: string, language: string): {
  sanitized: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let sanitized = code;
  
  // Detectar e avisar sobre patterns perigosos
  const dangerousPatterns = [
    { pattern: /eval\s*\(/g, name: 'eval()' },
    { pattern: /exec\s*\(/g, name: 'exec()' },
    { pattern: /spawn\s*\(/g, name: 'spawn()' },
    { pattern: /child_process/g, name: 'child_process' },
    { pattern: /rm\s+-rf/g, name: 'rm -rf' },
    { pattern: /DROP\s+TABLE/gi, name: 'DROP TABLE' },
    { pattern: /DELETE\s+FROM\s+\w+\s*;/gi, name: 'DELETE without WHERE' },
    { pattern: /__proto__/g, name: '__proto__' },
    { pattern: /constructor\s*\[/g, name: 'constructor access' },
  ];
  
  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      warnings.push(`Pattern perigoso detectado: ${name}`);
    }
  }
  
  // Limitar tamanho
  if (sanitized.length > LIMITS.MAX_INLINE_CODE_SIZE) {
    sanitized = sanitized.substring(0, LIMITS.MAX_INLINE_CODE_SIZE);
    warnings.push(`Código truncado para ${LIMITS.MAX_INLINE_CODE_SIZE} caracteres`);
  }
  
  return { sanitized, warnings };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Valida estrutura de objeto
 * Mitigação: Malformed data
 */
export function validateShape<T extends Record<string, unknown>>(
  data: unknown,
  schema: { [K in keyof T]: (value: unknown) => value is T[K] }
): data is T {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  
  for (const [key, validator] of Object.entries(schema)) {
    if (!(key in obj) || !validator(obj[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Valida se valor é string não vazia
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valida se valor é número positivo
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
}

/**
 * Valida se valor é LOA válido
 */
export function isValidLOA(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

// =============================================================================
// RATE LIMITING
// =============================================================================

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

const rateLimitStates = new Map<string, RateLimitState>();

/**
 * Verifica rate limit
 * Mitigação: DoS, abuse
 */
export function checkRateLimit(key: string, options: RateLimitOptions): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const state = rateLimitStates.get(key);
  
  if (!state || now - state.windowStart > options.windowMs) {
    // Nova janela
    rateLimitStates.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: now + options.windowMs,
    };
  }
  
  if (state.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: state.windowStart + options.windowMs,
    };
  }
  
  state.count++;
  return {
    allowed: true,
    remaining: options.maxRequests - state.count,
    resetAt: state.windowStart + options.windowMs,
  };
}

// =============================================================================
// IDEMPOTENCY
// =============================================================================

const idempotencyCache = new Map<string, { result: unknown; expiresAt: number }>();

/**
 * Wrapper para operações idempotentes
 * Mitigação: Duplicate operations
 */
export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = 60000
): Promise<T> {
  // Limpar cache expirado
  const now = Date.now();
  for (const [k, v] of idempotencyCache.entries()) {
    if (v.expiresAt < now) {
      idempotencyCache.delete(k);
    }
  }
  
  // Verificar cache
  const cached = idempotencyCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result as T;
  }
  
  // Executar e cachear
  const result = await fn();
  idempotencyCache.set(key, { result, expiresAt: now + ttlMs });
  
  return result;
}

// =============================================================================
// GRACEFUL DEGRADATION
// =============================================================================

interface FallbackOptions<T> {
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
  shouldFallback?: (error: unknown) => boolean;
  onFallback?: (error: unknown) => void;
}

/**
 * Executa com fallback gracioso
 * Mitigação: Service unavailability
 */
export async function withFallback<T>(options: FallbackOptions<T>): Promise<T> {
  const {
    primary,
    fallback,
    shouldFallback = () => true,
    onFallback,
  } = options;
  
  try {
    return await primary();
  } catch (error) {
    if (!shouldFallback(error)) {
      throw error;
    }
    
    onFallback?.(error);
    return await fallback();
  }
}

// =============================================================================
// DEADLOCK PREVENTION
// =============================================================================

const activeLocks = new Map<string, { acquiredAt: number; owner: string }>();

/**
 * Adquire lock com timeout
 * Mitigação: Deadlocks
 */
export async function acquireLock(
  resource: string,
  owner: string,
  timeoutMs: number = 30000
): Promise<() => void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const existingLock = activeLocks.get(resource);
    
    if (!existingLock) {
      // Adquirir lock
      activeLocks.set(resource, { acquiredAt: Date.now(), owner });
      
      return () => {
        const lock = activeLocks.get(resource);
        if (lock?.owner === owner) {
          activeLocks.delete(resource);
        }
      };
    }
    
    // Verificar se lock expirou (stale lock)
    if (Date.now() - existingLock.acquiredAt > TIMEOUTS.SANDBOX_EXECUTION) {
      // Lock stale, remover e tentar novamente
      activeLocks.delete(resource);
      continue;
    }
    
    // Aguardar e tentar novamente
    await sleep(100);
  }
  
  throw new GuardianFlowError(
    `Timeout ao adquirir lock para "${resource}"`,
    'LOCK_TIMEOUT',
    true
  );
}

// =============================================================================
// ERROR BOUNDARY WRAPPER
// =============================================================================

/**
 * Wrapper seguro para execução de código
 * Mitigação: Unhandled exceptions
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  context: string
): Promise<{ success: true; result: T } | { success: false; error: GuardianFlowError }> {
  try {
    const result = await fn();
    return { success: true, result };
  } catch (error) {
    console.error(`[SafeExecute] Error in ${context}:`, error);
    
    if (error instanceof GuardianFlowError) {
      return { success: false, error };
    }
    
    return {
      success: false,
      error: new GuardianFlowError(
        error instanceof Error ? error.message : 'Unknown error',
        'EXECUTION_ERROR',
        true,
        { context, originalError: error }
      ),
    };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  sleep,
};
