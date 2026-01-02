"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const queue_1 = require("../src/lib/queue");
const advisor_1 = require("../src/agents/advisor");
const operator_1 = require("../src/agents/operator");
const executor_1 = require("../src/agents/executor");
const reviewer_1 = require("../src/agents/reviewer");
const orchestrator_1 = require("../src/agents/orchestrator");
const quotas_1 = require("../src/lib/quotas");
const boot_1 = require("../src/lib/boot");
// Stream para resultados (feedback loop)
const RESULTS_STREAM = 'agent-results';
// Armazena orquestrações ativas para retomada após aprovação
const activeOrchestrations = new Map();
async function publishResult(taskId, result) {
    try {
        await (0, queue_1.enqueueTask)(RESULTS_STREAM, {
            taskId,
            result: JSON.stringify(result),
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        console.error('Falha ao publicar resultado:', err);
    }
}
async function handleOrchestration(data) {
    const orchestrator = (0, orchestrator_1.createOrchestrator)({
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
            var _a;
            console.log(`⏸️ Aprovação necessária para: ${task.description}`);
            publishResult(data.taskId || 'unknown', {
                type: 'approval-required',
                orchestrationId: (_a = orchestrator.getState()) === null || _a === void 0 ? void 0 : _a.id,
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
async function handleApproval(data) {
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
    (0, boot_1.logBootDiagnostics)('agent-worker');
    await (0, queue_1.ensureGroup)(stream, group).catch(() => { });
    await (0, queue_1.ensureGroup)(RESULTS_STREAM, 'results-consumers').catch(() => { });
    console.log('🚀 Agent Worker iniciado');
    console.log(`   Consumer: ${consumer}`);
    console.log(`   Stream: ${stream}`);
    console.log('   Aguardando tarefas...\n');
    while (true) {
        try {
            const res = await (0, queue_1.readGroup)(stream, group, consumer, 1, 5000);
            if (!res || !Array.isArray(res))
                continue;
            for (const [, items] of res) {
                for (const [id, pairs] of items) {
                    const data = {};
                    for (let i = 0; i < pairs.length; i += 2) {
                        const key = pairs[i];
                        const val = pairs[i + 1];
                        try {
                            data[key] = JSON.parse(val);
                        }
                        catch {
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
                                outcome = await (0, advisor_1.runAdvisor)(data);
                                break;
                            case 'operator':
                                outcome = await (0, operator_1.runOperator)(data);
                                break;
                            case 'executor':
                                outcome = await (0, executor_1.runExecutor)(data);
                                break;
                            case 'reviewer':
                                outcome = await (0, reviewer_1.runReviewer)(data);
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
                                await (0, quotas_1.consumeReservation)(data.taskId || id);
                            }
                            catch (err) {
                                console.warn('Failed to consume reservation', err);
                            }
                        }
                    }
                    catch (err) {
                        const errorMsg = err.message || String(err);
                        console.error(`❌ Tarefa falhou:`, errorMsg);
                        // Retry logic with exponential backoff
                        const { attempt } = (0, queue_1.getRetryInfo)(data);
                        const retryResult = await (0, queue_1.requeueForRetry)(stream, data, errorMsg, queue_1.DEFAULT_RETRY_CONFIG);
                        if (retryResult.requeued) {
                            console.log(`🔄 Retry ${retryResult.attempt}/${queue_1.DEFAULT_RETRY_CONFIG.maxRetries} scheduled`);
                            await publishResult(id, {
                                role: data.role,
                                error: errorMsg,
                                retry: { attempt: retryResult.attempt, nextDelayMs: retryResult.nextDelayMs },
                            });
                        }
                        else {
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
                                    await (0, quotas_1.refundReservation)(data.taskId || id);
                                }
                                catch (err) {
                                    console.warn('Failed to refund reservation', err);
                                }
                            }
                        }
                    }
                    await (0, queue_1.ack)(stream, group, id);
                }
            }
        }
        catch (err) {
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
