import { ensureGroup, readGroup, ack, enqueueTask, getRedis } from '../lib/queue';
import { buildIncidentTwin } from '../agents/twin-builder';
import { Orchestrator, OrchestrationState } from '../agents/orchestrator';
import { emitSandboxLog } from '../lib/sandbox-logs';
import { logEvent, recordAuditEvidence } from '../lib/audit';

const STREAM = 'agents';
const GROUP = 'agents-consumers';
const CONSUMER = `consumer-${process.pid}`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Prefixo para persistência de estado de orquestração
const ORCH_STATE_PREFIX = 'legacyguard:orch:state:';
const ORCH_INSTANCE_PREFIX = 'legacyguard:orch:instance:';
const ORCH_STATE_TTL = 3600 * 24; // 24 horas

function info(msg: string) {
  console.log(`[worker] ${msg}`);
}

// Persistir estado de orquestração no Redis
async function saveOrchestrationState(taskId: string, state: OrchestrationState): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[worker] Redis não disponível para persistir estado');
    return;
  }
  
  // Serializar estado (Map não serializa diretamente)
  const serializable = {
    ...state,
    results: Array.from(state.results.entries()),
  };
  
  await redis.setex(
    `${ORCH_STATE_PREFIX}${taskId}`,
    ORCH_STATE_TTL,
    JSON.stringify(serializable)
  );
  info(`Estado de orquestração ${taskId} salvo`);
}

// Recuperar estado de orquestração do Redis
async function loadOrchestrationState(taskId: string): Promise<OrchestrationState | null> {
  const redis = getRedis();
  if (!redis) return null;
  
  const data = await redis.get(`${ORCH_STATE_PREFIX}${taskId}`);
  if (!data) return null;
  
  try {
    const parsed = JSON.parse(data);
    // Reconstruir Map
    parsed.results = new Map(parsed.results);
    // Reconstruir Dates
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);
    return parsed as OrchestrationState;
  } catch (err) {
    console.error('[worker] Erro ao parsear estado:', err);
    return null;
  }
}

async function processMessage(message: any) {
  const fields = message[1];
  const data: Record<string, any> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const val = fields[i + 1];
    try {
      data[key] = JSON.parse(val);
    } catch {
      data[key] = val;
    }
  }

  const role = data.role;
  const taskId = data.taskId || 'unknown';

  switch (role) {
    case 'orchestrate': {
      info(`Processando orquestração ${taskId}`);
      emitSandboxLog({ taskId, message: '[worker] Iniciando orquestração', scope: 'orchestrator' });
      
      // Criar Orchestrator com callbacks para emitir eventos
      const orchestrator = new Orchestrator({
        onPlanCreated: (plan) => {
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] Plano criado: ${plan.summary} (risco: ${plan.riskLevel})`,
            scope: 'orchestrator'
          });
          // Emitir para SSE
          enqueueTask('agent-results', {
            taskId,
            role: 'orchestrate',
            type: 'plan-created',
            plan,
          }).catch(() => {});
        },
        onTwinBuilt: (twin) => {
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] Twin construído: ${twin.twinId}`,
            scope: 'orchestrator'
          });
          enqueueTask('agent-results', {
            taskId,
            role: 'orchestrate',
            type: 'twin-built',
            twin,
          }).catch(() => {});
        },
        onTaskStarted: (task) => {
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] Task iniciada: [${task.agent}] ${task.description}`,
            scope: 'orchestrator'
          });
        },
        onTaskCompleted: (task, result) => {
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] Task concluída: ${task.id} (${result.status})`,
            scope: 'orchestrator'
          });
          enqueueTask('agent-results', {
            taskId,
            role: 'orchestrate',
            type: 'task-completed',
            task,
            result,
          }).catch(() => {});
        },
        onApprovalRequired: async (plan, pendingTask) => {
          info(`Orquestração ${taskId} aguardando aprovação`);
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] ⏸️ AGUARDANDO APROVAÇÃO HUMANA - Risco: ${plan.riskLevel}`,
            scope: 'orchestrator'
          });
          
          // Notificar via SSE que aprovação é necessária
          await enqueueTask('agent-results', {
            taskId,
            role: 'orchestrate',
            type: 'approval-required',
            plan,
            pendingTask,
            riskLevel: plan.riskLevel,
          });
          
          // Registrar no audit
          await logEvent({
            action: 'approval.required',
            severity: 'warn',
            message: `Aprovação requerida para ${taskId}`,
            metadata: { taskId, riskLevel: plan.riskLevel, pendingAgent: pendingTask.agent },
          });
        },
        onCompleted: async (state) => {
          info(`Orquestração ${taskId} finalizada: ${state.status}`);
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] ✅ Orquestração finalizada: ${state.status}`,
            scope: 'orchestrator'
          });
          
          await enqueueTask('agent-results', {
            taskId,
            role: 'orchestrate',
            type: 'completed',
            status: state.status,
            plan: state.plan,
            resultsCount: state.results.size,
          });
          
          // Limpar estado persistido após conclusão
          const redis = getRedis();
          if (redis) {
            await redis.del(`${ORCH_STATE_PREFIX}${taskId}`);
            await redis.del(`${ORCH_INSTANCE_PREFIX}${taskId}`);
          }
        },
        onLog: (message) => {
          emitSandboxLog({ taskId, message, scope: 'orchestrator' });
        },
      });
      
      try {
        // Executar orquestração
        const state = await orchestrator.execute(data.request, data.context);
        
        // Se pausou para aprovação, salvar estado
        if (state.status === 'awaiting-approval') {
          await saveOrchestrationState(taskId, state);
          info(`Estado salvo para ${taskId} - aguardando aprovação`);
        }
      } catch (err: any) {
        console.error(`[worker] Erro na orquestração ${taskId}:`, err);
        emitSandboxLog({ 
          taskId, 
          message: `[orchestrator] ❌ Erro: ${err?.message || err}`,
          scope: 'orchestrator'
        });
        
        await enqueueTask('agent-results', {
          taskId,
          role: 'orchestrate',
          type: 'error',
          error: err?.message || String(err),
        });
        
        await logEvent({
          action: 'orchestration.error',
          severity: 'error',
          message: err?.message || String(err),
          metadata: { taskId },
        });
      }
      break;
    }
    
    case 'approve': {
      info(`Processando aprovação para ${data.orchestrationId}`);
      const orchTaskId = data.orchestrationId;
      
      // Carregar estado salvo
      const savedState = await loadOrchestrationState(orchTaskId);
      if (!savedState) {
        const errorMsg = `Estado de orquestração não encontrado para ${orchTaskId}`;
        info(errorMsg);
        await enqueueTask('agent-results', {
          taskId,
          role: 'approve',
          type: 'error',
          error: errorMsg,
        });
        break;
      }
      
      if (savedState.status !== 'awaiting-approval') {
        const errorMsg = `Orquestração ${orchTaskId} não está aguardando aprovação (status: ${savedState.status})`;
        info(errorMsg);
        await enqueueTask('agent-results', {
          taskId,
          role: 'approve',
          type: 'error',
          error: errorMsg,
        });
        break;
      }
      
      // Registrar aprovação como evidência auditável
      const approvalActor = data.actor || data.userId || 'unknown';
      await recordAuditEvidence({
        actor: approvalActor,
        approval: {
          decision: 'approved',
          actor: approvalActor,
          reason: data.reason || 'Aprovação via API',
          timestamp: new Date().toISOString(),
        },
        message: `Aprovação concedida para orquestração ${orchTaskId}`,
        scope: 'orchestrator',
      });
      
      // Criar novo orchestrator e restaurar estado
      const orchestrator = new Orchestrator({
        onLog: (message) => {
          emitSandboxLog({ taskId: orchTaskId, message, scope: 'orchestrator' });
        },
        onCompleted: async (state) => {
          await enqueueTask('agent-results', {
            taskId: orchTaskId,
            role: 'orchestrate',
            type: 'completed',
            status: state.status,
          });
        },
      });
      
      // Injetar estado restaurado (isso requer modificação no Orchestrator)
      // Por ora, notificar que aprovação foi registrada mas re-execução precisa de melhoria
      emitSandboxLog({ 
        taskId: orchTaskId, 
        message: `[orchestrator] ✅ Aprovação registrada por ${approvalActor}`,
        scope: 'orchestrator'
      });
      
      await enqueueTask('agent-results', {
        taskId,
        role: 'approve',
        type: 'approved',
        orchestrationId: orchTaskId,
        approvedBy: approvalActor,
      });
      
      // TODO: Implementar resumeAfterApproval com estado restaurado
      // Isso requer refatorar Orchestrator para aceitar estado externo
      info(`Aprovação registrada para ${orchTaskId} - TECH DEBT: resume não implementado`);
      break;
    }

    case 'twin-builder': {
      info(`Processando twin-builder ${taskId}`);
      const result = await buildIncidentTwin({
        taskId,
        incident: data.incident,
        repoPath: data.repoPath || process.cwd(),
        sandbox: data.sandbox,
      });

      await enqueueTask('agent-results', {
        taskId,
        role,
        type: 'twin-built',
        result,
      });
      break;
    }
    
    default:
      info(`Role não suportado: ${role}`);
      await enqueueTask('agent-results', {
        taskId,
        role,
        type: 'error',
        error: `Role não suportado: ${role}`,
      });
  }
}

export async function startAgentsConsumer() {
  await ensureGroup(STREAM, GROUP);
  info('Iniciando consumer de agents...');

  // Loop simples; em produção, considerar graceful shutdown e backoff
  // Infinite loop is intentional for consumer process
  while (true) {
    const res = await readGroup(STREAM, GROUP, CONSUMER, 10, 5000);
    if (!res) continue;

    for (const [, messages] of res as [string, [string, string[]][]][]) {
      for (const msg of messages) {
        const id = msg[0];
        const fields = msg[1];
        // Parse taskId from fields array (key-value pairs)
        const taskIdIndex = fields.indexOf('taskId');
        const taskId = taskIdIndex >= 0 ? fields[taskIdIndex + 1] : 'unknown';
        const roleIndex = fields.indexOf('role');
        const role = roleIndex >= 0 ? fields[roleIndex + 1] : 'unknown';
        
        let attempts = 0;
        // retry simples em memória
        while (attempts < MAX_RETRIES) {
          try {
            await processMessage(msg);
            break;
          } catch (err: any) {
            attempts += 1;
            emitSandboxLog({ taskId, message: `[worker] erro (tentativa ${attempts}): ${err?.message || err}` });
            console.error('Erro ao processar mensagem', err);
            if (attempts >= MAX_RETRIES) {
              await enqueueTask('agent-results', {
                taskId,
                role,
                type: 'error',
                error: err?.message || String(err),
              });
              break;
            }
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempts));
          }
        }
        await ack(STREAM, GROUP, id);
      }
    }
  }
}

// Permite rodar standalone via ts-node / node -r ts-node/register
if (require.main === module) {
  startAgentsConsumer().catch((err) => {
    console.error('Fatal no consumer', err);
    process.exit(1);
  });
}
