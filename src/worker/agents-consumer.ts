import { ensureGroup, readGroup, ack, enqueueTask, getRedis } from '../lib/queue';
import { buildIncidentTwin } from '../agents/twin-builder';
import { Orchestrator, OrchestrationState } from '../agents/orchestrator';
import { emitSandboxLog } from '../lib/sandbox-logs';
import { logEvent, recordAuditEvidence, requirePersistentAudit } from '../lib/audit';
import { publishOrchestrationEvent } from '../lib/pubsub';

const STREAM = 'agents';
const GROUP = 'agents-consumers';
const CONSUMER = `consumer-${process.pid}`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Prefixo para persistência de estado de orquestração
const ORCH_STATE_PREFIX = 'legacyguard:orch:state:';
const ORCH_INSTANCE_PREFIX = 'legacyguard:orch:instance:';
const ORCH_STATE_TTL = 3600 * 24; // 24 horas

// Lock distribuído para aprovação
const APPROVAL_LOCK_PREFIX = 'legacyguard:approval:lock:';
const APPROVAL_LOCK_TTL = 60; // 60 segundos

// Graceful shutdown
let isShuttingDown = false;
let activeJobs = 0;

function info(msg: string) {
  console.log(`[worker] ${msg}`);
}

// Lock distribuído para evitar race condition em aprovações
async function acquireApprovalLock(taskId: string): Promise<boolean> {
  const redis = getRedis();
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!redis) {
    if (isProduction) {
      // CVE-LG-004 / P2: Em produção, NÃO permitir fallback - fail-closed
      throw new Error(
        '[Lock] ERRO CRÍTICO: Redis obrigatório para lock distribuído em produção. ' +
        'Não é seguro prosseguir sem coordenação entre workers. ' +
        'Configure REDIS_URL ou REDIS_TLS_URL.'
      );
    }
    // Em desenvolvimento, permitir com warning
    console.warn('[worker] ⚠️ Redis não disponível para lock distribuído (dev mode - NÃO USE EM PRODUÇÃO)');
    return true;
  }
  
  const lockKey = `${APPROVAL_LOCK_PREFIX}${taskId}`;
  // SET NX EX - só seta se não existir, com TTL
  const result = await redis.set(lockKey, CONSUMER, 'EX', APPROVAL_LOCK_TTL, 'NX');
  return result === 'OK';
}

async function releaseApprovalLock(taskId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  
  const lockKey = `${APPROVAL_LOCK_PREFIX}${taskId}`;
  // Só libera se for o mesmo consumer que adquiriu
  const currentHolder = await redis.get(lockKey);
  if (currentHolder === CONSUMER) {
    await redis.del(lockKey);
  }
}

// Validar que actor está presente para operações críticas
function validateActor(actor: string | undefined, operation: string): string {
  if (!actor || actor === 'unknown' || actor.trim() === '') {
    throw new Error(`Actor obrigatório para operação '${operation}'. Rejeição por segurança.`);
  }
  return actor;
}

// Persistir estado de orquestração no Redis
async function saveOrchestrationState(taskId: string, state: OrchestrationState): Promise<void> {
  const redis = getRedis();
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!redis) {
    if (isProduction) {
      // Em produção, falhar se não conseguir persistir estado
      throw new Error(
        '[State] ERRO: Redis obrigatório para persistir estado de orquestração em produção. ' +
        'Estados perdidos podem causar inconsistências após reinício do worker. ' +
        'Configure REDIS_URL ou REDIS_TLS_URL.'
      );
    }
    console.warn('[worker] ⚠️ Redis não disponível para persistir estado (dev mode)');
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
          // Pub/Sub para notificação real-time cross-worker
          publishOrchestrationEvent(taskId, 'plan-created', { plan });
          // Queue para SSE legacy
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
          publishOrchestrationEvent(taskId, 'twin-built', { twinId: twin.twinId });
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
          publishOrchestrationEvent(taskId, 'task-started', { 
            taskSubId: task.id, 
            agent: task.agent, 
            description: task.description 
          });
        },
        onTaskCompleted: (task, result) => {
          emitSandboxLog({ 
            taskId, 
            message: `[orchestrator] Task concluída: ${task.id} (${result.status})`,
            scope: 'orchestrator'
          });
          publishOrchestrationEvent(taskId, 'task-completed', { 
            taskSubId: task.id, 
            status: result.status 
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
          
          // Pub/Sub para notificação real-time (CRÍTICO para UI)
          await publishOrchestrationEvent(taskId, 'approval-required', {
            riskLevel: plan.riskLevel,
            pendingAgent: pendingTask.agent,
            pendingTaskId: pendingTask.id,
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
          
          // Pub/Sub para notificação final
          await publishOrchestrationEvent(taskId, 'completed', {
            status: state.status,
            resultsCount: state.results.size,
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
          // Notificar via Pub/Sub que estado foi salvo
          await publishOrchestrationEvent(taskId, 'state-updated', {
            status: 'awaiting-approval',
          });
          info(`Estado salvo para ${taskId} - aguardando aprovação`);
        }
      } catch (err: any) {
        console.error(`[worker] Erro na orquestração ${taskId}:`, err);
        emitSandboxLog({ 
          taskId, 
          message: `[orchestrator] ❌ Erro: ${err?.message || err}`,
          scope: 'orchestrator'
        });
        
        // Pub/Sub para erro
        await publishOrchestrationEvent(taskId, 'failed', {
          error: err?.message || String(err),
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
      
      // Validar actor antes de qualquer operação
      let approvalActor: string;
      try {
        approvalActor = validateActor(data.actor || data.userId, 'approval');
      } catch (err: any) {
        info(`Aprovação rejeitada: ${err.message}`);
        await publishOrchestrationEvent(orchTaskId, 'failed', { error: err.message });
        await enqueueTask('agent-results', {
          taskId,
          role: 'approve',
          type: 'error',
          error: err.message,
        });
        break;
      }
      
      // Adquirir lock distribuído para evitar race condition
      const lockAcquired = await acquireApprovalLock(orchTaskId);
      if (!lockAcquired) {
        const errorMsg = `Aprovação para ${orchTaskId} já está sendo processada por outro worker`;
        info(errorMsg);
        await publishOrchestrationEvent(orchTaskId, 'failed', { error: errorMsg });
        await enqueueTask('agent-results', {
          taskId,
          role: 'approve',
          type: 'error',
          error: errorMsg,
        });
        break;
      }
      
      try {
      // Carregar estado salvo
      const savedState = await loadOrchestrationState(orchTaskId);
      if (!savedState) {
        const errorMsg = `Estado de orquestração não encontrado para ${orchTaskId}`;
        info(errorMsg);
        await publishOrchestrationEvent(orchTaskId, 'failed', { error: errorMsg });
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
        await publishOrchestrationEvent(orchTaskId, 'failed', { error: errorMsg });
        await enqueueTask('agent-results', {
          taskId,
          role: 'approve',
          type: 'error',
          error: errorMsg,
        });
        await releaseApprovalLock(orchTaskId);
        break;
      }
      
      // approvalActor já validado acima
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
      
      // Publicar evento de aprovação
      await publishOrchestrationEvent(orchTaskId, 'approval-granted', {
        actor: approvalActor,
      });
      
      emitSandboxLog({ 
        taskId: orchTaskId, 
        message: `[orchestrator] ✅ Aprovação registrada por ${approvalActor}`,
        scope: 'orchestrator'
      });
      
      // Criar novo orchestrator com callbacks para este worker
      const orchestrator = new Orchestrator({
        onTaskStarted: (task) => {
          emitSandboxLog({ 
            taskId: orchTaskId, 
            message: `[orchestrator] Task iniciada: [${task.agent}] ${task.description}`,
            scope: 'orchestrator'
          });
          publishOrchestrationEvent(orchTaskId, 'task-started', { 
            taskSubId: task.id, 
            agent: task.agent 
          });
        },
        onTaskCompleted: (task, result) => {
          emitSandboxLog({ 
            taskId: orchTaskId, 
            message: `[orchestrator] Task concluída: ${task.id} (${result.status})`,
            scope: 'orchestrator'
          });
          publishOrchestrationEvent(orchTaskId, 'task-completed', { 
            taskSubId: task.id, 
            status: result.status 
          });
          enqueueTask('agent-results', {
            taskId: orchTaskId,
            role: 'orchestrate',
            type: 'task-completed',
            task,
            result,
          }).catch(() => {});
        },
        onWaveCompleted: (wave, results) => {
          emitSandboxLog({ 
            taskId: orchTaskId, 
            message: `[orchestrator] Wave ${wave + 1} concluída (${results.length} tasks)`,
            scope: 'orchestrator'
          });
        },
        onCompleted: async (state) => {
          info(`Orquestração ${orchTaskId} finalizada após aprovação: ${state.status}`);
          emitSandboxLog({ 
            taskId: orchTaskId, 
            message: `[orchestrator] ✅ Orquestração finalizada: ${state.status}`,
            scope: 'orchestrator'
          });
          
          await publishOrchestrationEvent(orchTaskId, 'completed', {
            status: state.status,
            resultsCount: state.results.size,
          });
          
          await enqueueTask('agent-results', {
            taskId: orchTaskId,
            role: 'orchestrate',
            type: 'completed',
            status: state.status,
          });
          
          // Limpar estado após conclusão
          const redis = getRedis();
          if (redis) {
            await redis.del(`${ORCH_STATE_PREFIX}${orchTaskId}`);
            await redis.del(`${ORCH_INSTANCE_PREFIX}${orchTaskId}`);
          }
        },
        onLog: (message) => {
          emitSandboxLog({ taskId: orchTaskId, message, scope: 'orchestrator' });
        },
      });
      
      // Restaurar estado salvo no Orchestrator
      try {
        orchestrator.restoreFromState(savedState, data.context);
        
        // Publicar que execução está sendo retomada
        await publishOrchestrationEvent(orchTaskId, 'execution-resumed', {
          fromWave: savedState.currentWave,
          actor: approvalActor,
        });
        
        // Retomar execução
        const finalState = await orchestrator.resumeAfterApproval();
        
        if (!finalState) {
          throw new Error('Falha ao retomar execução - estado nulo retornado');
        }
        
        info(`Orquestração ${orchTaskId} retomada com sucesso`);
      } catch (err: any) {
        const errorMsg = `Erro ao retomar orquestração: ${err?.message || err}`;
        console.error(`[worker] ${errorMsg}`);
        
        await publishOrchestrationEvent(orchTaskId, 'failed', { error: errorMsg });
        
        await enqueueTask('agent-results', {
          taskId,
          role: 'approve',
          type: 'error',
          error: errorMsg,
        });
        
        await logEvent({
          action: 'orchestration.resume.error',
          severity: 'error',
          message: errorMsg,
          metadata: { taskId: orchTaskId, approvalActor },
        });
      }
      
      await enqueueTask('agent-results', {
        taskId,
        role: 'approve',
        type: 'approved',
        orchestrationId: orchTaskId,
        approvedBy: approvalActor,
      });
      
      } finally {
        // Sempre liberar lock ao final
        await releaseApprovalLock(orchTaskId);
      }
      
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
  // Forçar auditoria persistente em produção
  requirePersistentAudit();
  
  await ensureGroup(STREAM, GROUP);
  info('Iniciando consumer de agents...');

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    info(`Recebido ${signal}, iniciando shutdown graceful...`);
    isShuttingDown = true;
    
    // Aguardar jobs ativos finalizarem (máx 30s)
    const maxWait = 30000;
    const start = Date.now();
    while (activeJobs > 0 && Date.now() - start < maxWait) {
      info(`Aguardando ${activeJobs} job(s) ativo(s)...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    
    if (activeJobs > 0) {
      info(`Forçando shutdown com ${activeJobs} job(s) ainda ativos`);
    } else {
      info('Shutdown graceful concluído');
    }
    
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Loop com verificação de shutdown
  while (!isShuttingDown) {
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
        activeJobs++;
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
        activeJobs--;
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
