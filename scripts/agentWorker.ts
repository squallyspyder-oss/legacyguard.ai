import {
  ensureGroup,
  readGroup,
  ack,
  enqueueTask,
  requeueForRetry,
  getRetryInfo,
  DEFAULT_RETRY_CONFIG,
} from '../src/lib/queue';
import { runAdvisor } from '../src/agents/advisor';
import { runOperator } from '../src/agents/operator';
import { runExecutor } from '../src/agents/executor';
import { runReviewer } from '../src/agents/reviewer';
import { createOrchestrator } from '../src/agents/orchestrator';
import { consumeReservation, refundReservation } from '../src/lib/quotas';
import { logBootDiagnostics } from '../src/lib/boot';

// Stream para resultados (feedback loop)
const RESULTS_STREAM = 'agent-results';

// Armazena orquestrações ativas para retomada após aprovação
const activeOrchestrations = new Map<string, ReturnType<typeof createOrchestrator>>();

async function publishResult(taskId: string, result: any) {
  try {
    await enqueueTask(RESULTS_STREAM, {
      taskId,
      result: JSON.stringify(result),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Falha ao publicar resultado:', err);
  }
}

async function handleOrchestration(data: any) {
  const orchestrator = createOrchestrator({
    onLog: (msg) => console.log(`[ORCH] ${msg}`),
    onPlanCreated: (plan) => {
      console.log(`📋 Plano criado: ${plan.subtasks.length} subtarefas`);
      publishResult(data.taskId || 'unknown', { type: 'plan', plan });
    },
    onTaskCompleted: (task, result) => {
      publishResult(task.id, { type: 'task-complete', task, result });
    },
    onTaskFailed: (task, error) => {
      publishResult(task.id, { type: 'task-failed', task, error });
    },
    onApprovalRequired: (plan, task) => {
      console.log(`⏸️ Aprovação necessária para: ${task.description}`);
      publishResult(data.taskId || 'unknown', {
        type: 'approval-required',
        orchestrationId: orchestrator.getState()?.id,
        task,
      });
    },
    onCompleted: (state) => {
      publishResult(data.taskId || 'unknown', {
        type: 'orchestration-complete',
        state: {
          id: state.id,
          status: state.status,
          results: Array.from(state.results.entries()),
        },
      });
    },
  });

  // Setar contexto se fornecido
  if (data.context) {
    orchestrator.setContext(data.context);
  }

  const state = await orchestrator.execute(data.request, data.context);

  // Se aguardando aprovação, armazenar para retomada
  if (state.status === 'awaiting-approval') {
    activeOrchestrations.set(state.id, orchestrator);
  }

  return state;
}

async function handleApproval(data: any) {
  const orchestrationId = data.orchestrationId;
  const orchestrator = activeOrchestrations.get(orchestrationId);

  if (!orchestrator) {
    return { error: 'Orquestração não encontrada ou expirada' };
  }

  console.log(`✅ Aprovação recebida para: ${orchestrationId}`);
  const state = await orchestrator.resumeAfterApproval();
  activeOrchestrations.delete(orchestrationId);

  return state;
}

async function main() {
  const stream = 'agents';
  const group = 'legacyguard-workers';
  const consumer = `worker-${process.pid}`;

  logBootDiagnostics('agent-worker');
  await ensureGroup(stream, group).catch(() => {});
  await ensureGroup(RESULTS_STREAM, 'results-consumers').catch(() => {});

  console.log('🚀 Agent Worker iniciado');
  console.log(`   Consumer: ${consumer}`);
  console.log(`   Stream: ${stream}`);
  console.log('   Aguardando tarefas...\n');

  while (true) {
        try {
      const res = await readGroup(stream, group, consumer, 1, 5000) as [string, [string, string[]][]][] | null;
      if (!res || !Array.isArray(res)) continue;

      for (const [, items] of res as Array<[string, Array<[string, string[]]>]>) {
        for (const [id, pairs] of items) {
          const data: any = {};
          for (let i = 0; i < pairs.length; i += 2) {
            const key = pairs[i];
            const val = pairs[i + 1];
            try {
              data[key] = JSON.parse(val);
            } catch {
              data[key] = val;
            }
          }

          console.log(`\n📥 Tarefa recebida: ${id}`);
          console.log(`   Role: ${data.role}`);

          let outcome;
          const startTime = Date.now();

          try {
            switch (data.role) {
              case 'orchestrate':
                // Modo orquestrado: Planner + Agentes coordenados
                outcome = await handleOrchestration(data);
                break;

              case 'approve':
                // Aprovar orquestração pendente
                outcome = await handleApproval(data);
                break;

              case 'advisor':
                outcome = await runAdvisor(data);
                break;

              case 'operator':
                outcome = await runOperator(data);
                break;

              case 'executor':
                outcome = await runExecutor(data);
                break;

              case 'reviewer':
                outcome = await runReviewer(data);
                break;

              default:
                outcome = { error: `Role desconhecida: ${data.role}` };
            }

            const elapsed = Date.now() - startTime;
            console.log(`✅ Tarefa concluída em ${elapsed}ms`);

            // Publicar resultado
            await publishResult(id, { role: data.role, outcome, elapsed });

            // If this was an orchestration, mark reservation consumed
            if (data.role === 'orchestrate') {
              try {
                await consumeReservation(data.taskId || id);
              } catch (err) {
                console.warn('Failed to consume reservation', err);
              }
            }
          } catch (err: any) {
            const errorMsg = err.message || String(err);
            console.error(`❌ Tarefa falhou:`, errorMsg);

            // Retry logic with exponential backoff
            const { attempt } = getRetryInfo(data);
            const retryResult = await requeueForRetry(stream, data, errorMsg, DEFAULT_RETRY_CONFIG);

            if (retryResult.requeued) {
              console.log(`🔄 Retry ${retryResult.attempt}/${DEFAULT_RETRY_CONFIG.maxRetries} scheduled`);
              await publishResult(id, {
                role: data.role,
                error: errorMsg,
                retry: { attempt: retryResult.attempt, nextDelayMs: retryResult.nextDelayMs },
              });
            } else {
              console.error(`💀 Task moved to DLQ after ${retryResult.attempt} attempts`);
              await publishResult(id, {
                role: data.role,
                error: errorMsg,
                dlq: true,
                finalAttempt: retryResult.attempt,
              });
              // If orchestration moved to DLQ, refund reservation
              if (data.role === 'orchestrate') {
                try {
                  await refundReservation(data.taskId || id);
                } catch (err) {
                  console.warn('Failed to refund reservation', err);
                }
              }
            }
          }

          await ack(stream, group, id);
        }
      }
    } catch (err) {
      console.error('Erro no loop do worker:', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Worker crashed:', e);
    process.exit(1);
  });
}
