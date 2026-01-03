/**
 * Guardian Flow - API Route
 * 
 * API para executar fluxos Guardian
 * @route /api/guardian-flow
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
} from '@/guardian-flow';
import { logEvent } from '@/lib/audit';

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
  
  return true;
}

// =============================================================================
// POST /api/guardian-flow
// =============================================================================

export async function POST(request: NextRequest) {
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
    
    // 2. Verificar LOA máximo permitido
    if (options?.maxLOA && classification.loaLevel > options.maxLOA) {
      const response: GuardianFlowResponse = {
        flowId,
        status: 'failed',
        events: [
          createEvent('flow_started', { intent }),
          createEvent('loa_classified', { 
            level: classification.loaLevel,
            requiredAgents: classification.requiredAgents,
          }),
          createEvent('flow_failed', { reason: 'LOA_EXCEEDED' }),
        ],
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
      const response: GuardianFlowResponse = {
        flowId,
        status: 'failed',
        events: [
          createEvent('flow_started', { intent }),
          createEvent('safety_gate_failed', { 
            gate: 'intent_validation', 
            message: intentValidation.message,
          }),
          createEvent('flow_failed', { reason: 'INTENT_UNCLEAR' }),
        ],
        error: {
          code: ERROR_CODES.INTENT_UNCLEAR,
          message: intentValidation.message,
          details: intentValidation.details,
        },
      };
      return NextResponse.json(response, { status: 400 });
    }
    
    // 4. Se LOA >= 2, retornar para aprovação
    if (classification.loaLevel >= 2) {
      const response: GuardianFlowResponse = {
        flowId,
        status: 'awaiting_approval',
        events: [
          createEvent('flow_started', { intent }),
          createEvent('intent_detected', { 
            intent: classification.intent, 
            confidence: classification.confidence,
          }),
          createEvent('loa_classified', { 
            level: classification.loaLevel,
            requiredAgents: classification.requiredAgents,
          }),
          createEvent('safety_gate_passed', { gate: 'intent_validation' }),
          createEvent('approval_requested', {
            loaLevel: classification.loaLevel,
            reason: `Ação de LOA ${classification.loaLevel} requer aprovação humana`,
            agents: classification.requiredAgents,
          }),
        ],
      };
      return NextResponse.json(response, { status: 200 });
    }
    
    // 5. LOA 1: Executar automaticamente (dry run por padrão)
    const events: FlowEvent[] = [
      createEvent('flow_started', { intent }),
      createEvent('intent_detected', { 
        intent: classification.intent, 
        confidence: classification.confidence,
      }),
      createEvent('loa_classified', { 
        level: classification.loaLevel,
        requiredAgents: classification.requiredAgents,
      }),
      createEvent('safety_gate_passed', { gate: 'intent_validation' }),
    ];
    
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
        success: true, 
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
        dryRun: options?.dryRun ?? true,
      },
    }).catch(console.error);
    
    const response: GuardianFlowResponse = {
      flowId,
      status: 'completed',
      events,
      result: {
        success: true,
        output: options?.dryRun
          ? 'Dry run concluído. Nenhuma mudança aplicada.'
          : 'Ação executada com sucesso.',
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
