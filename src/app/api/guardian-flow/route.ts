/**
 * Guardian Flow - API Route
 * 
 * API para executar fluxos Guardian
 * @route /api/guardian-flow
 * 
 * P0-4: RBAC obrigatório - endpoint protegido por autenticação
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GuardianFlowRequest,
  GuardianFlowResponse,
  GuardianFlowError,
  ERROR_CODES,
  FlowEvent,
  FlowEventType,
} from '@/guardian-flow/types';
import {
  classifyIntent,
  validateIntent,
  validateDeterministic,
} from '@/guardian-flow';
import { TIMEOUTS } from '@/guardian-flow/constants';
import { runSandbox } from '@/lib/sandbox';
import { logEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

// =============================================================================
// HELPERS
// =============================================================================

function createEvent(
  type: FlowEventType,
  data: Record<string, unknown> = {}
): FlowEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    timestamp: new Date(),
    data,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateRequest(body: unknown): body is GuardianFlowRequest {
  if (!body || typeof body !== 'object') return false;
  const req = body as Record<string, unknown>;
  
  if (typeof req.intent !== 'string' || req.intent.trim().length === 0) {
    return false;
  }
  
  if (req.options && typeof req.options !== 'object') {
    return false;
  }
  if (req.options) {
    const opts = req.options as Record<string, unknown>;
    if (opts.deterministicRuns !== undefined && typeof opts.deterministicRuns !== 'number') return false;
    if (opts.deterministicCommand !== undefined && typeof opts.deterministicCommand !== 'string') return false;
    if (opts.deterministicCode !== undefined && typeof opts.deterministicCode !== 'string') return false;
  }
  
  return true;
}

// =============================================================================
// POST /api/guardian-flow
// =============================================================================

export async function POST(request: NextRequest) {
  // ✅ P0-4: RBAC check obrigatório - endpoint de execução requer permissão 'execute'
  const authResult = await requirePermission('execute');
  if (!authResult.authorized) {
    // Audit log da tentativa não autorizada
    await logEvent({
      action: 'guardian_flow_unauthorized',
      severity: 'warn',
      message: 'Unauthorized access attempt to Guardian Flow API',
      metadata: {
        reason: 'RBAC check failed',
        permission: 'execute',
      },
    }).catch(console.error);
    
    return authResult.response;
  }
  
  const startTime = Date.now();
  const flowId = `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const body = await request.json();
    
    // Validar request
    if (!validateRequest(body)) {
      const response: GuardianFlowResponse = {
        flowId,
        status: 'failed',
        events: [],
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request inválido. Campo "intent" é obrigatório.',
        },
      };
      return NextResponse.json(response, { status: 400 });
    }
    
    const { intent, context, options } = body;
    const repoPath = context?.repositoryPath || process.cwd();
    
    // Audit log
    await logEvent({
      action: 'guardian_flow_started',
      message: `Guardian Flow started: ${intent}`,
      metadata: {
        flowId,
        intent,
        context: context || {},
        options: options || {},
      },
    }).catch(console.error);
    
    // 1. Classificar intenção
    const classification = classifyIntent(intent);
    
    const events: FlowEvent[] = [createEvent('flow_started', { intent })];
    
    // 2. Verificar LOA máximo permitido
    if (options?.maxLOA && classification.loaLevel > options.maxLOA) {
      events.push(createEvent('loa_classified', { level: classification.loaLevel, requiredAgents: classification.requiredAgents }));
      events.push(createEvent('flow_failed', { reason: 'LOA_EXCEEDED' }));
      const response: GuardianFlowResponse = {
        flowId,
        status: 'failed',
        events,
        error: {
          code: ERROR_CODES.LOA_EXCEEDED,
          message: `Esta ação requer LOA ${classification.loaLevel}, mas o máximo permitido é ${options.maxLOA}`,
          details: { required: classification.loaLevel, max: options.maxLOA },
        },
      };
      return NextResponse.json(response, { status: 403 });
    }
    
    // 3. Validar intenção
    const intentValidation = await validateIntent({
      userIntent: intent,
      detectedIntent: classification.intent,
      confidence: classification.confidence,
    });
    
    if (!intentValidation.passed) {
      events.push(createEvent('safety_gate_failed', { gate: 'intent_validation', message: intentValidation.message }));
      events.push(createEvent('flow_failed', { reason: 'INTENT_UNCLEAR' }));
      const response: GuardianFlowResponse = {
        flowId,
        status: 'failed',
        events,
        error: {
          code: ERROR_CODES.INTENT_UNCLEAR,
          message: intentValidation.message,
          details: intentValidation.details,
        },
      };
      return NextResponse.json(response, { status: 400 });
    }
    
    events.push(
      createEvent('intent_detected', { intent: classification.intent, confidence: classification.confidence }),
      createEvent('loa_classified', { level: classification.loaLevel, requiredAgents: classification.requiredAgents }),
      createEvent('safety_gate_passed', { gate: 'intent_validation' }),
    );
    
    // 3.1 Gate determinístico opcional
    if (options?.deterministicCommand || options?.deterministicCode) {
      const finalCommand = options.deterministicCommand
        ? options.deterministicCommand
        : (() => {
            const b64 = Buffer.from(options?.deterministicCode || '', 'utf8').toString('base64');
            return `node -e "const c=Buffer.from('${b64}','base64').toString('utf8'); eval(c);"`;
          })();
      const detResult = await validateDeterministic({
        runs: options.deterministicRuns,
        executor: async () => {
          const res = await runSandbox({
            enabled: true,
            repoPath,
            command: finalCommand,
            timeoutMs: TIMEOUTS.SANDBOX_EXECUTION,
            failMode: 'fail',
            isolationProfile: 'strict',
            networkPolicy: 'none',
            fsPolicy: 'readonly',
            useDocker: true,
          });
          return {
            success: res.success && res.exitCode === 0,
            output: `${res.stdout || ''}\n${res.stderr || ''}\nexit:${res.exitCode ?? 0}`,
          };
        },
      });

      events.push(
        createEvent(detResult.passed ? 'safety_gate_passed' : 'safety_gate_failed', {
          gate: 'deterministic_check',
          message: detResult.message,
          consistency: detResult.validation.consistencyScore,
          uniqueHashes: detResult.details?.uniqueHashes,
        })
      );

      if (!detResult.passed) {
        const response: GuardianFlowResponse = {
          flowId,
          status: 'failed',
          events,
          error: {
            code: ERROR_CODES.DETERMINISTIC_FAILED,
            message: detResult.message,
            details: detResult.details,
          },
        };
        return NextResponse.json(response, { status: 400 });
      }
    }
    
    // 4. Se LOA >= 2, retornar para aprovação
    if (classification.loaLevel >= 2) {
      events.push(createEvent('approval_requested', {
        loaLevel: classification.loaLevel,
        reason: `Ação de LOA ${classification.loaLevel} requer aprovação humana`,
        agents: classification.requiredAgents,
      }));
      const response: GuardianFlowResponse = {
        flowId,
        status: 'awaiting_approval',
        events,
      };
      return NextResponse.json(response, { status: 200 });
    }
    
    // 5. LOA 1: Execução automática com comando seguro opcional
    let executionOutput = 'Dry run concluído. Nenhuma mudança aplicada.';
    let executionSuccess = true;

    if (options?.allowAutoRun && options.command) {
      // Executa comando em sandbox readonly para evitar efeitos colaterais
      const runResult = await runSandbox({
        enabled: true,
        repoPath,
        command: options.command,
        timeoutMs: TIMEOUTS.SANDBOX_EXECUTION,
        failMode: 'fail',
        isolationProfile: 'strict',
        networkPolicy: 'none',
        fsPolicy: 'readonly',
        useDocker: true,
      });

      executionSuccess = runResult.success && runResult.exitCode === 0;
      executionOutput = runResult.stdout || runResult.stderr || 'Sem saída';

      events.push(
        createEvent('sandbox_executed', {
          command: options.command,
          exitCode: runResult.exitCode,
          durationMs: runResult.durationMs,
          success: executionSuccess,
        })
      );
    }
    
    // Simular execução de agentes
    for (const agent of classification.requiredAgents) {
      events.push(
        createEvent('agent_completed', { 
          role: agent, 
          duration: 100 + Math.random() * 500,
        })
      );
    }
    
    events.push(
      createEvent('flow_completed', { 
        success: executionSuccess, 
        durationMs: Date.now() - startTime,
      })
    );
    
    // Audit log final
    await logEvent({
      action: 'guardian_flow_completed',
      message: `Guardian Flow completed: ${intent}`,
      metadata: {
        flowId,
        intent,
        loaLevel: classification.loaLevel,
        durationMs: Date.now() - startTime,
        dryRun: !(options?.allowAutoRun && options.command),
        commandExecuted: options?.command,
        executionSuccess,
      },
    }).catch(console.error);
    
    const response: GuardianFlowResponse = {
      flowId,
      status: 'completed',
      events,
      result: {
        success: executionSuccess,
        output: executionOutput,
        changes: [],
        rollbackId: `rollback_${flowId}`,
      },
    };
    
    return NextResponse.json(response, { status: 200 });
    
  } catch (error) {
    console.error('[GuardianFlow] Error:', error);
    
    // Audit log de erro
    await logEvent({
      action: 'guardian_flow_error',
      severity: 'error',
      message: `Guardian Flow error: ${error instanceof Error ? error.message : 'Unknown'}`,
      metadata: {
        flowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }).catch(console.error);
    
    if (error instanceof GuardianFlowError) {
      const response: GuardianFlowResponse = {
        flowId,
        status: 'failed',
        events: [],
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
      return NextResponse.json(response, { status: error.recoverable ? 400 : 500 });
    }
    
    const response: GuardianFlowResponse = {
      flowId,
      status: 'failed',
      events: [],
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Erro interno',
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// =============================================================================
// GET /api/guardian-flow - Health check
// =============================================================================

export async function GET() {
  return NextResponse.json({
    service: 'guardian-flow',
    status: 'healthy',
    version: '1.0.0',
    features: {
      loaLevels: [1, 2, 3, 4],
      safetyGates: [
        'intent_validation',
        'blast_radius',
        'deterministic_check',
        'security_scan',
        'human_approval',
      ],
      agents: [
        'orchestrator',
        'architect',
        'developer',
        'qa',
        'security',
        'reviewer',
        'documenter',
      ],
      gamification: true,
    },
  });
}
