/**
 * Guardian Flow - Safety Gates
 * 
 * Implementação dos portões de segurança para validação de ações
 * @module guardian-flow/engine/SafetyGates
 */

import {
  SafetyGateType,
  SafetyGateResult,
  SafetyCheckpoint,
  LOALevel,
  BlastRadiusAnalysis,
  DeterministicValidation,
  GuardianFlowError,
  ERROR_CODES,
} from '../types';
import {
  TIMEOUTS,
  LIMITS,
  SAFETY_GATES_BY_LOA,
  RISK_KEYWORDS,
} from '../constants';

// =============================================================================
// INTENT VALIDATION GATE
// =============================================================================

export interface IntentValidationInput {
  userIntent: string;
  detectedIntent: string;
  confidence: number;
}

/**
 * Valida se a intenção foi corretamente interpretada
 * Verifica palavras-chave de risco e confiança mínima
 */
export async function validateIntent(
  input: IntentValidationInput
): Promise<SafetyGateResult> {
  const startTime = Date.now();
  
  try {
    const { userIntent, detectedIntent, confidence } = input;
    
    // Verificar confiança mínima
    const minConfidence = 70;
    if (confidence < minConfidence) {
      return {
        gate: 'intent_validation',
        passed: false,
        confidence,
        message: `Confiança insuficiente na interpretação (${confidence}% < ${minConfidence}%)`,
        details: { userIntent, detectedIntent, minConfidence },
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
      };
    }
    
    // Verificar keywords de alto risco não detectadas
    const lowerIntent = userIntent.toLowerCase();
    const hasHighRiskKeyword = RISK_KEYWORDS.HIGH_RISK.some(
      keyword => lowerIntent.includes(keyword)
    );
    const detectedHighRisk = detectedIntent.includes('security') ||
                            detectedIntent.includes('delete') ||
                            detectedIntent.includes('database');
    
    if (hasHighRiskKeyword && !detectedHighRisk) {
      return {
        gate: 'intent_validation',
        passed: false,
        confidence: confidence * 0.5, // Reduz confiança
        message: 'Detectada keyword de alto risco não capturada pela classificação',
        details: {
          userIntent,
          detectedIntent,
          hasHighRiskKeyword,
          matchedKeywords: RISK_KEYWORDS.HIGH_RISK.filter(k => lowerIntent.includes(k)),
        },
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
      };
    }
    
    return {
      gate: 'intent_validation',
      passed: true,
      confidence,
      message: 'Intenção validada com sucesso',
      details: { userIntent, detectedIntent },
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      gate: 'intent_validation',
      passed: false,
      confidence: 0,
      message: `Erro na validação: ${error instanceof Error ? error.message : 'Unknown'}`,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// BLAST RADIUS GATE
// =============================================================================

export interface BlastRadiusInput {
  targetFiles: string[];
  codeChanges: string;
  dependencyGraph?: Map<string, string[]>;
  loaLevel: LOALevel;
}

/**
 * Calcula o raio de blast (impacto potencial) de uma mudança
 * Usa análise estática e grafo de dependências
 */
export async function calculateBlastRadius(
  input: BlastRadiusInput
): Promise<SafetyGateResult & { analysis: BlastRadiusAnalysis }> {
  const startTime = Date.now();
  
  try {
    const { targetFiles, codeChanges, dependencyGraph, loaLevel } = input;
    
    // Análise de arquivos afetados
    const affectedFiles = [...targetFiles];
    const affectedFunctions: string[] = [];
    const dependencyChain: string[] = [];
    
    // Expandir grafo de dependências
    if (dependencyGraph) {
      for (const file of targetFiles) {
        const deps = dependencyGraph.get(file) || [];
        for (const dep of deps) {
          if (!affectedFiles.includes(dep)) {
            affectedFiles.push(dep);
            dependencyChain.push(`${file} -> ${dep}`);
          }
        }
      }
    }
    
    // Extrair funções afetadas do código
    const functionRegex = /(?:function|const|let|var)\s+(\w+)\s*[=(]/g;
    let match;
    while ((match = functionRegex.exec(codeChanges)) !== null) {
      affectedFunctions.push(match[1]);
    }
    
    // Calcular fatores de risco
    const riskFactors: BlastRadiusAnalysis['riskFactors'] = [];
    
    // Fator: Número de arquivos
    const filesFactor = Math.min(affectedFiles.length / LIMITS.MAX_AFFECTED_FILES, 1) * 30;
    riskFactors.push({
      factor: 'affected_files',
      weight: filesFactor,
      description: `${affectedFiles.length} arquivo(s) afetado(s)`,
    });
    
    // Fator: Profundidade de dependência
    const depthFactor = Math.min(dependencyChain.length / 10, 1) * 20;
    riskFactors.push({
      factor: 'dependency_depth',
      weight: depthFactor,
      description: `${dependencyChain.length} dependência(s) na cadeia`,
    });
    
    // Fator: Keywords de risco no código
    const lowerCode = codeChanges.toLowerCase();
    const highRiskCount = RISK_KEYWORDS.HIGH_RISK.filter(k => lowerCode.includes(k)).length;
    const riskKeywordFactor = Math.min(highRiskCount / 5, 1) * 30;
    riskFactors.push({
      factor: 'risk_keywords',
      weight: riskKeywordFactor,
      description: `${highRiskCount} keyword(s) de alto risco detectada(s)`,
    });
    
    // Fator: Tamanho da mudança
    const sizeFactor = Math.min(codeChanges.length / 5000, 1) * 20;
    riskFactors.push({
      factor: 'change_size',
      weight: sizeFactor,
      description: `${codeChanges.length} caractere(s) de mudança`,
    });
    
    // Score total
    const score = Math.round(riskFactors.reduce((sum, f) => sum + f.weight, 0));
    
    // Determinar recomendação baseado no LOA
    const maxAllowed = LIMITS.MAX_BLAST_RADIUS[loaLevel];
    let recommendation: BlastRadiusAnalysis['recommendation'];
    
    if (score <= maxAllowed * 0.5) {
      recommendation = 'proceed';
    } else if (score <= maxAllowed) {
      recommendation = 'review';
    } else {
      recommendation = 'block';
    }
    
    const analysis: BlastRadiusAnalysis = {
      score,
      affectedFiles,
      affectedFunctions,
      affectedTests: [], // TODO: Integrar com sistema de testes
      dependencyChain,
      riskFactors,
      recommendation,
    };
    
    const passed = recommendation !== 'block';
    
    return {
      gate: 'blast_radius',
      passed,
      confidence: passed ? 100 - score : score,
      message: passed
        ? `Blast radius ${score}% está dentro do limite de ${maxAllowed}% para LOA ${loaLevel}`
        : `Blast radius ${score}% excede o limite de ${maxAllowed}% para LOA ${loaLevel}`,
      details: analysis as unknown as Record<string, unknown>,
      analysis,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const emptyAnalysis: BlastRadiusAnalysis = {
      score: 100,
      affectedFiles: [],
      affectedFunctions: [],
      affectedTests: [],
      dependencyChain: [],
      riskFactors: [],
      recommendation: 'block',
    };
    
    return {
      gate: 'blast_radius',
      passed: false,
      confidence: 0,
      message: `Erro no cálculo de blast radius: ${error instanceof Error ? error.message : 'Unknown'}`,
      analysis: emptyAnalysis,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// DETERMINISTIC VALIDATION GATE
// =============================================================================

export interface DeterministicInput {
  executor: () => Promise<{ success: boolean; output: string }>;
  runs?: number;
}

/**
 * Executa a ação N vezes para garantir comportamento determinístico
 * Todas as execuções devem produzir o mesmo resultado
 */
export async function validateDeterministic(
  input: DeterministicInput
): Promise<SafetyGateResult & { validation: DeterministicValidation }> {
  const startTime = Date.now();
  const runs = input.runs || LIMITS.DETERMINISTIC_RUNS;
  
  const validation: DeterministicValidation = {
    totalRuns: runs,
    successfulRuns: 0,
    failedRuns: 0,
    runs: [],
    isConsistent: false,
    consistencyScore: 0,
    outputHash: null,
  };
  
  try {
    const hashes = new Set<string>();
    
    for (let i = 0; i < runs; i++) {
      const runStart = Date.now();
      
      try {
        const result = await Promise.race([
          input.executor(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), TIMEOUTS.SANDBOX_EXECUTION)
          ),
        ]);
        
        // Calcular hash simples do output
        const hash = simpleHash(result.output);
        hashes.add(hash);
        
        validation.runs.push({
          runNumber: i + 1,
          success: result.success,
          output: result.output.substring(0, 1000), // Limitar tamanho
          hash,
          durationMs: Date.now() - runStart,
        });
        
        if (result.success) {
          validation.successfulRuns++;
        } else {
          validation.failedRuns++;
        }
      } catch (error) {
        validation.runs.push({
          runNumber: i + 1,
          success: false,
          output: error instanceof Error ? error.message : 'Unknown error',
          hash: 'error',
          durationMs: Date.now() - runStart,
        });
        validation.failedRuns++;
      }
    }
    
    // Verificar consistência
    validation.isConsistent = hashes.size === 1 && validation.failedRuns === 0;
    validation.consistencyScore = validation.isConsistent
      ? 100
      : Math.round((1 - (hashes.size - 1) / runs) * 100);
    validation.outputHash = validation.isConsistent ? Array.from(hashes)[0] : null;
    
    const passed = validation.isConsistent;
    
    return {
      gate: 'deterministic_check',
      passed,
      confidence: validation.consistencyScore,
      message: passed
        ? `Ação determinística: ${runs}/${runs} execuções consistentes`
        : `Ação não determinística: ${hashes.size} resultados diferentes em ${runs} execuções`,
      details: {
        successfulRuns: validation.successfulRuns,
        failedRuns: validation.failedRuns,
        uniqueHashes: hashes.size,
      },
      validation,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      gate: 'deterministic_check',
      passed: false,
      confidence: 0,
      message: `Erro na validação determinística: ${error instanceof Error ? error.message : 'Unknown'}`,
      validation,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// SECURITY SCAN GATE
// =============================================================================

export interface SecurityScanInput {
  code: string;
  language: string;
  dependencies?: string[];
}

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Executa análise de segurança estática (SAST simples)
 * Em produção, integrar com ferramentas reais como Semgrep, Snyk, etc.
 */
export async function runSecurityScan(
  input: SecurityScanInput
): Promise<SafetyGateResult & { findings: SecurityFinding[] }> {
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];
  
  try {
    const { code, language } = input;
    const lines = code.split('\n');
    
    // Padrões de segurança (simplificado)
    const securityPatterns = [
      {
        pattern: /eval\s*\(/g,
        severity: 'critical' as const,
        type: 'code_injection',
        message: 'Uso de eval() pode permitir injeção de código',
      },
      {
        pattern: /innerHTML\s*=/g,
        severity: 'high' as const,
        type: 'xss',
        message: 'Uso de innerHTML pode permitir XSS',
      },
      {
        pattern: /password\s*=\s*["'][^"']+["']/gi,
        severity: 'critical' as const,
        type: 'hardcoded_credential',
        message: 'Senha hardcoded detectada',
      },
      {
        pattern: /api[_-]?key\s*=\s*["'][^"']+["']/gi,
        severity: 'critical' as const,
        type: 'hardcoded_credential',
        message: 'API key hardcoded detectada',
      },
      {
        pattern: /secret\s*=\s*["'][^"']+["']/gi,
        severity: 'high' as const,
        type: 'hardcoded_credential',
        message: 'Secret hardcoded detectado',
      },
      {
        pattern: /console\.(log|debug|info)\(/g,
        severity: 'info' as const,
        type: 'debug_code',
        message: 'Código de debug encontrado',
      },
      {
        pattern: /TODO|FIXME|HACK|XXX/g,
        severity: 'low' as const,
        type: 'tech_debt',
        message: 'Marcador de dívida técnica encontrado',
      },
      {
        pattern: /exec\s*\(|spawn\s*\(/g,
        severity: 'high' as const,
        type: 'command_injection',
        message: 'Potencial injeção de comando',
      },
      {
        pattern: /dangerouslySetInnerHTML/g,
        severity: 'high' as const,
        type: 'xss',
        message: 'Uso de dangerouslySetInnerHTML pode permitir XSS',
      },
    ];
    
    // Verificar padrões por linha
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const { pattern, severity, type, message } of securityPatterns) {
        const matches = line.match(pattern);
        if (matches) {
          findings.push({
            severity,
            type,
            message,
            line: i + 1,
            column: line.search(pattern) + 1,
          });
        }
      }
    }
    
    // Verificar linguagem específica
    if (language === 'javascript' || language === 'typescript') {
      // Verificar imports suspeitos
      const suspiciousImports = ['child_process', 'fs', 'crypto'];
      for (const imp of suspiciousImports) {
        if (code.includes(`require('${imp}')`) || code.includes(`from '${imp}'`)) {
          findings.push({
            severity: 'medium',
            type: 'sensitive_import',
            message: `Uso de módulo sensível: ${imp}`,
          });
        }
      }
    }
    
    // Calcular score
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    
    const passed = criticalCount === 0 && highCount === 0;
    const confidence = Math.max(0, 100 - (criticalCount * 30 + highCount * 15 + mediumCount * 5));
    
    return {
      gate: 'security_scan',
      passed,
      confidence,
      message: passed
        ? findings.length === 0
          ? 'Nenhum problema de segurança detectado'
          : `${findings.length} aviso(s) de segurança (não bloqueantes)`
        : `${criticalCount + highCount} problema(s) de segurança crítico(s)/alto(s) detectado(s)`,
      details: {
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: findings.filter(f => f.severity === 'low').length,
        info: findings.filter(f => f.severity === 'info').length,
      },
      findings,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      gate: 'security_scan',
      passed: false,
      confidence: 0,
      message: `Erro no scan de segurança: ${error instanceof Error ? error.message : 'Unknown'}`,
      findings,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// HUMAN APPROVAL GATE
// =============================================================================

export interface HumanApprovalInput {
  loaLevel: LOALevel;
  reason: string;
  details: Record<string, unknown>;
  timeout?: number;
  onApprovalRequest?: (request: HumanApprovalRequest) => void;
}

export interface HumanApprovalRequest {
  id: string;
  loaLevel: LOALevel;
  reason: string;
  details: Record<string, unknown>;
  requestedAt: Date;
  expiresAt: Date;
}

/**
 * Solicita aprovação humana para ações de LOA 2+
 * Retorna imediatamente com status de "aguardando"
 */
export function requestHumanApproval(
  input: HumanApprovalInput
): { request: HumanApprovalRequest; waitForApproval: () => Promise<SafetyGateResult> } {
  const { loaLevel, reason, details, timeout, onApprovalRequest } = input;
  
  const defaultTimeout = loaLevel === 2
    ? TIMEOUTS.HUMAN_APPROVAL_LOA2
    : TIMEOUTS.HUMAN_APPROVAL_LOA3;
  
  const request: HumanApprovalRequest = {
    id: generateId(),
    loaLevel,
    reason,
    details,
    requestedAt: new Date(),
    expiresAt: new Date(Date.now() + (timeout || defaultTimeout)),
  };
  
  // Notificar UI
  onApprovalRequest?.(request);
  
  // Armazenar request para referência
  pendingApprovals.set(request.id, {
    request,
    resolve: null,
    status: 'pending',
  });
  
  const waitForApproval = (): Promise<SafetyGateResult> => {
    return new Promise((resolve) => {
      const pending = pendingApprovals.get(request.id);
      if (pending) {
        pending.resolve = resolve;
      }
      
      // Timeout automático
      setTimeout(() => {
        const current = pendingApprovals.get(request.id);
        if (current && current.status === 'pending') {
          current.status = 'timeout';
          resolve({
            gate: 'human_approval',
            passed: false,
            confidence: 0,
            message: ERROR_CODES.APPROVAL_TIMEOUT,
            details: { request },
            timestamp: new Date(),
            durationMs: Date.now() - request.requestedAt.getTime(),
          });
          pendingApprovals.delete(request.id);
        }
      }, timeout || defaultTimeout);
    });
  };
  
  return { request, waitForApproval };
}

/**
 * Aprovar uma solicitação pendente
 */
export function approveRequest(requestId: string, approvedBy: string): boolean {
  const pending = pendingApprovals.get(requestId);
  if (!pending || pending.status !== 'pending') {
    return false;
  }
  
  pending.status = 'approved';
  
  if (pending.resolve) {
    pending.resolve({
      gate: 'human_approval',
      passed: true,
      confidence: 100,
      message: `Aprovado por ${approvedBy}`,
      details: { request: pending.request, approvedBy },
      timestamp: new Date(),
      durationMs: Date.now() - pending.request.requestedAt.getTime(),
    });
  }
  
  pendingApprovals.delete(requestId);
  return true;
}

/**
 * Negar uma solicitação pendente
 */
export function denyRequest(requestId: string, deniedBy: string, reason: string): boolean {
  const pending = pendingApprovals.get(requestId);
  if (!pending || pending.status !== 'pending') {
    return false;
  }
  
  pending.status = 'denied';
  
  if (pending.resolve) {
    pending.resolve({
      gate: 'human_approval',
      passed: false,
      confidence: 0,
      message: `Negado por ${deniedBy}: ${reason}`,
      details: { request: pending.request, deniedBy, reason },
      timestamp: new Date(),
      durationMs: Date.now() - pending.request.requestedAt.getTime(),
    });
  }
  
  pendingApprovals.delete(requestId);
  return true;
}

// Armazenamento de aprovações pendentes
const pendingApprovals = new Map<
  string,
  {
    request: HumanApprovalRequest;
    resolve: ((result: SafetyGateResult) => void) | null;
    status: 'pending' | 'approved' | 'denied' | 'timeout';
  }
>();

// =============================================================================
// SAFETY CHECKPOINT
// =============================================================================

/**
 * Executa todos os gates necessários para um LOA específico
 */
export async function runSafetyCheckpoint(
  loaLevel: LOALevel,
  inputs: {
    intent?: IntentValidationInput;
    blastRadius?: BlastRadiusInput;
    deterministic?: DeterministicInput;
    security?: SecurityScanInput;
    approval?: HumanApprovalInput;
  }
): Promise<SafetyCheckpoint> {
  const gates = SAFETY_GATES_BY_LOA[loaLevel];
  const results: SafetyGateResult[] = [];
  let overallPassed = true;
  
  const checkpointId = generateId();
  
  for (const gate of gates) {
    let result: SafetyGateResult;
    
    switch (gate) {
      case 'intent_validation':
        if (inputs.intent) {
          result = await validateIntent(inputs.intent);
        } else {
          result = {
            gate,
            passed: false,
            confidence: 0,
            message: 'Input de validação de intenção não fornecido',
            timestamp: new Date(),
            durationMs: 0,
          };
        }
        break;
        
      case 'blast_radius':
        if (inputs.blastRadius) {
          const blastResult = await calculateBlastRadius(inputs.blastRadius);
          result = blastResult;
        } else {
          result = {
            gate,
            passed: true, // Skip se não fornecido
            confidence: 50,
            message: 'Análise de blast radius ignorada (input não fornecido)',
            timestamp: new Date(),
            durationMs: 0,
          };
        }
        break;
        
      case 'deterministic_check':
        if (inputs.deterministic) {
          const detResult = await validateDeterministic(inputs.deterministic);
          result = detResult;
        } else {
          result = {
            gate,
            passed: false,
            confidence: 0,
            message: 'Executor determinístico não fornecido',
            timestamp: new Date(),
            durationMs: 0,
          };
        }
        break;
        
      case 'security_scan':
        if (inputs.security) {
          const secResult = await runSecurityScan(inputs.security);
          result = secResult;
        } else {
          result = {
            gate,
            passed: true,
            confidence: 50,
            message: 'Scan de segurança ignorado (input não fornecido)',
            timestamp: new Date(),
            durationMs: 0,
          };
        }
        break;
        
      case 'human_approval':
        if (inputs.approval) {
          const { waitForApproval } = requestHumanApproval(inputs.approval);
          result = await waitForApproval();
        } else {
          result = {
            gate,
            passed: false,
            confidence: 0,
            message: 'Input de aprovação humana não fornecido',
            timestamp: new Date(),
            durationMs: 0,
          };
        }
        break;
        
      default:
        result = {
          gate,
          passed: false,
          confidence: 0,
          message: `Gate desconhecido: ${gate}`,
          timestamp: new Date(),
          durationMs: 0,
        };
    }
    
    results.push(result);
    
    if (!result.passed) {
      overallPassed = false;
      // Parar nos primeiros gates críticos
      if (gate === 'intent_validation' || gate === 'blast_radius') {
        break;
      }
    }
  }
  
  return {
    id: checkpointId,
    gates: results,
    overallPassed,
    requiredApproval: loaLevel >= 2 ? 'human' : 'auto',
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return `gf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  pendingApprovals,
  generateId,
};
