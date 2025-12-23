/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { runPlanner, Plan, SubTask, getExecutionOrder } from './planner';
import { runAdvisor } from './advisor';
import { runOperator } from './operator';
import { runExecutor } from './executor';
import { runReviewer, ReviewResult, formatReviewForDisplay } from './reviewer';
import { buildIncidentTwin, TwinBuilderResult, IncidentAlert } from './twin-builder';
import { analyzeImpact } from '../lib/impact';
import { emitSandboxLog } from '../lib/sandbox-logs';
import { startIncidentCycle, markMitigation, recordRegression } from '../lib/metrics';
import { logEvent } from '../lib/audit';

const execFileAsync = promisify(execFile);

type SandboxConfig = {
  enabled?: boolean;
  repoPath?: string;
  command?: string;
  commands?: Array<{ name: string; command: string; notes?: string }>; // Harness commands from Twin
  runnerPath?: string;
  timeoutMs?: number;
  failMode?: 'fail' | 'warn'; // fail = abort executor; warn = log and continuar
  languageHint?: string; // opcional para escolher preset
  onLog?: (message: string) => void;
};

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'awaiting-approval';

export type TaskResult = {
  taskId: string;
  status: TaskStatus;
  agent: string;
  output: any;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
};

export type OrchestrationState = {
  id: string;
  plan: Plan;
  results: Map<string, TaskResult>;
  currentWave: number;
  status: 'planning' | 'twin-building' | 'executing' | 'awaiting-approval' | 'completed' | 'failed';
  logs: string[];
  twinResult?: TwinBuilderResult;
  createdAt: Date;
  updatedAt: Date;
};

export type ExecutionPolicy = {
  allowedAgents?: Array<'advisor' | 'operator' | 'executor' | 'reviewer' | 'advisor-impact' | 'twin-builder'>;
  requireApprovalFor?: Array<'executor' | 'operator'>;
  forbiddenKeywords?: string[];
};

export type OrchestrationCallbacks = {
  onPlanCreated?: (plan: Plan) => void;
  onTwinBuilt?: (twin: TwinBuilderResult) => void;
  onTaskStarted?: (task: SubTask) => void;
  onTaskCompleted?: (task: SubTask, result: TaskResult) => void;
  onTaskFailed?: (task: SubTask, error: string) => void;
  onWaveCompleted?: (wave: number, results: TaskResult[]) => void;
  onApprovalRequired?: (plan: Plan, pendingTask: SubTask) => void;
  onCompleted?: (state: OrchestrationState) => void;
  onLog?: (message: string) => void;
};

export class Orchestrator {
  private state: OrchestrationState | null = null;
  private callbacks: OrchestrationCallbacks;
  private approvalGranted = false;
  private taskContext: Record<string, any> = {};
  private policy: ExecutionPolicy = {};

  constructor(callbacks: OrchestrationCallbacks = {}) {
    this.callbacks = callbacks;
  }

  private log(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.state?.logs.push(logEntry);
    this.callbacks.onLog?.(logEntry);
    const taskId = (this.taskContext as any)?.taskId;
    const scope: 'sandbox' | 'audit' | 'orchestrator' = message.includes('Sandbox') ? 'sandbox' : 'orchestrator';
    emitSandboxLog({ taskId, message: logEntry, scope });
    this.taskContext?.sandbox?.onLog?.(logEntry);
    console.log(logEntry);
  }

  async execute(request: string, context?: any): Promise<OrchestrationState> {
    this.log(`Iniciando orquestração para: "${request.slice(0, 100)}..."`);

    if (context) {
      this.setContext({ ...context });
      if (context.executionPolicy) {
        this.policy = context.executionPolicy as ExecutionPolicy;
      }
      const incidentId = context.incidentId || context.incident?.id;
      if (incidentId) {
        startIncidentCycle(incidentId, context.incident?.source);
        this.taskContext.incidentId = incidentId;
      }
    }

    if (this.taskContext.incidentId) {
      logEvent({
        action: 'orchestration.start',
        severity: 'info',
        message: request.slice(0, 200),
        metadata: { taskId: this.taskContext.incidentId, executionPolicy: this.policy },
      }).catch(() => undefined);
    }

    // 0. TWIN BUILDER (pré-planner) - se houver incidente
    let twinResult: TwinBuilderResult | undefined;
    const incident = context?.incident as IncidentAlert | undefined;
    const repoPath = context?.repoPath || this.taskContext.repoPath;

    if (incident && repoPath) {
      this.log('Fase 0: Twin Builder (preparando contexto de incidente)');
      try {
        twinResult = await buildIncidentTwin({
          taskId: this.taskContext.taskId || `twin-${Date.now()}`,
          incident,
          repoPath,
          sandbox: context?.sandbox,
        });

        this.log(`🔬 Twin preparado: ${twinResult.twinId} (status: ${twinResult.status})`);
        
        if (twinResult.legacyProfile) {
          this.log(`   📊 Profile: ${twinResult.legacyProfile.filesScanned} arquivos, signals: ${Object.entries(twinResult.legacyProfile.signals).filter(([,v]) => v).map(([k]) => k).join(', ') || 'nenhum'}`);
        }
        
        if (twinResult.behavior) {
          this.log(`   ⚠️ Risco: ${twinResult.behavior.risk}, comportamentos: ${twinResult.behavior.behaviors.join(', ')}`);
        }
        
        if (twinResult.harness?.commands?.length) {
          this.log(`   🔧 Harness: ${twinResult.harness.commands.length} comandos sugeridos`);
          // Enriquecer sandbox config com harness commands
          if (this.taskContext.sandbox) {
            this.taskContext.sandbox.commands = twinResult.harness.commands;
          }
        }

        if (twinResult.impactGuardrails?.warnings?.length) {
          this.log(`   🛡️ Guardrails: ${twinResult.impactGuardrails.warnings.join('; ')}`);
        }

        // Salvar no contexto para uso pelos agentes
        this.taskContext.twinResult = twinResult;
        this.callbacks.onTwinBuilt?.(twinResult);

        logEvent({
          action: 'twin.built',
          severity: 'info',
          message: `Twin ${twinResult.twinId} preparado`,
          metadata: { 
            twinId: twinResult.twinId, 
            status: twinResult.status,
            risk: twinResult.behavior?.risk,
          },
        }).catch(() => undefined);

      } catch (err: any) {
        this.log(`⚠️ Twin Builder falhou: ${err?.message || err}. Continuando sem contexto de twin.`);
      }
    }

    // 1. Planejamento (agora com contexto de twin se disponível)
    this.log('Fase 1: Planejamento');
    const plan = await runPlanner({
      request,
      context: context?.summary,
      repoInfo: context?.repoInfo,
      twinContext: twinResult, // Passa contexto do twin para o planner
    });

    this.state = {
      id: `orch-${Date.now()}`,
      plan,
      results: new Map(),
      currentWave: 0,
      status: 'planning',
      logs: [],
      twinResult,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.log(`Plano criado: ${plan.summary}`);
    this.log(`Subtarefas: ${plan.subtasks.length}, Risco: ${plan.riskLevel}, Requer aprovação: ${plan.requiresApproval}`);
    this.callbacks.onPlanCreated?.(plan);

    // 2. Execução por waves
    this.state.status = 'executing';
    const waves = getExecutionOrder(plan);
    this.log(`Waves de execução: ${waves.length}`);

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
      const wave = waves[waveIdx];
      this.state.currentWave = waveIdx;
      this.log(`\n=== Wave ${waveIdx + 1}/${waves.length} (${wave.length} tarefas) ===`);

      // Verificar se alguma tarefa desta wave requer aprovação (executor)
      const needsApproval = wave.some((t) => t.agent === 'executor') && plan.requiresApproval;

      if (needsApproval && !this.approvalGranted) {
        this.log('⏸️ Aguardando aprovação humana para executar tarefas de deploy/merge');
        this.state.status = 'awaiting-approval';
        this.callbacks.onApprovalRequired?.(plan, wave.find((t) => t.agent === 'executor')!);
        return this.state; // Pausa aqui até aprovação
      }

      // Executar tarefas em paralelo dentro da wave
      const waveResults = await Promise.all(
        wave.map((task) => this.executeTask(task))
      );

      // Verificar falhas críticas
      const failures = waveResults.filter((r) => r.status === 'failed');
      if (failures.length > 0) {
        const criticalFailure = failures.find((f) => {
          const task = wave.find((t) => t.id === f.taskId);
          return task?.priority === 'high';
        });

        if (criticalFailure) {
          this.log(`❌ Falha crítica em tarefa de alta prioridade: ${criticalFailure.taskId}`);
          this.state.status = 'failed';
          break;
        }
      }

      this.callbacks.onWaveCompleted?.(waveIdx, waveResults);
      this.log(`Wave ${waveIdx + 1} concluída`);
    }

    // 3. Finalização
    if (this.state.status !== 'failed') {
      this.state.status = 'completed';
    }
    const incidentId = this.taskContext.incidentId as string | undefined;
    if (incidentId) {
      markMitigation(incidentId, this.state.status === 'completed' ? 'mitigated' : 'failed');
      logEvent({
        action: 'orchestration.finish',
        severity: this.state.status === 'completed' ? 'info' : 'warn',
        message: `status=${this.state.status}`,
        metadata: { incidentId, waves: this.state.currentWave + 1 },
      }).catch(() => undefined);
    }
    this.state.updatedAt = new Date();
    this.log(`\n✅ Orquestração finalizada com status: ${this.state.status}`);
    this.callbacks.onCompleted?.(this.state);

    return this.state;
  }

  private async executeTask(task: SubTask): Promise<TaskResult> {
    this.log(`▶️ Iniciando: [${task.agent}] ${task.description}`);
    this.callbacks.onTaskStarted?.(task);
    const incidentId = this.taskContext.incidentId as string | undefined;

    if (this.policy.allowedAgents && !this.policy.allowedAgents.includes(task.agent as any)) {
      const msg = `Agente ${task.agent} bloqueado pela policy`;
      this.log(msg);
      return {
        taskId: task.id,
        status: 'failed',
        agent: task.agent,
        output: null,
        error: msg,
        startedAt: new Date(),
        completedAt: new Date(),
      };
    }

    const result: TaskResult = {
      taskId: task.id,
      status: 'running',
      agent: task.agent,
      output: null,
      startedAt: new Date(),
    };

    const descLower = (task.description || '').toLowerCase();
    const forbiddenHit = this.policy.forbiddenKeywords?.find((k) => descLower.includes(k.toLowerCase()));
    if (forbiddenHit) {
      const msg = `Tarefa bloqueada por guardrail (keyword: ${forbiddenHit})`;
      this.log(msg);
      result.status = 'failed';
      result.error = msg;
      result.completedAt = new Date();
      this.state?.results.set(task.id, result);
      return result;
    }

    try {
      // Coletar contexto de tarefas anteriores (dependências)
      const depContext: any = {};
      for (const depId of task.dependencies) {
        const depResult = this.state?.results.get(depId);
        if (depResult?.output) {
          depContext[depId] = depResult.output;
        }
      }

      // Executar agente apropriado
      switch (task.agent) {
        case 'advisor':
          result.output = await runAdvisor({
            ...this.taskContext,
            query: task.description,
            dependencyContext: depContext,
          });
          break;

        case 'reviewer':
          // Pegar patch do operator se disponível
          const operatorResult = Object.values(depContext).find((d: unknown) => (d as Record<string, unknown>)?.role === 'operator') as Record<string, unknown> | undefined;
          result.output = await runReviewer({
            patch: operatorResult?.patch as string | undefined,
            context: task.description,
            strictMode: task.priority === 'high',
          });

          const review = result.output as ReviewResult;
          if (!review.approved) {
            this.log(`⚠️ Reviewer reprovou: ${review.summary}`);
            if (incidentId) recordRegression(incidentId, 'Reviewer reprovou a entrega');
          }
          break;

        case 'operator': {
          await this.runSandboxIfEnabled(task);
          result.output = await runOperator({
            ...this.taskContext,
            action: task.description,
            dependencyContext: depContext,
          });
          break;
        }

        case 'executor': {
          if (this.taskContext.safeMode) {
            throw new Error('Safe mode habilitado: executor bloqueado');
          }
          await this.runSandboxIfEnabled(task);
          result.output = await runExecutor({
            ...this.taskContext,
            action: task.description,
            dependencyContext: depContext,
          });
          break;
        }

        case 'advisor-impact':
          // Tarefa especial de impacto
          if (!this.taskContext.repoPath) {
            throw new Error('repoPath não definido para análise de impacto');
          }
          result.output = await analyzeImpact(this.taskContext.repoPath, task.description || 'refatoração');
          break;

        default:
          throw new Error(`Agente desconhecido: ${task.agent}`);
      }

      result.status = 'completed';
      result.completedAt = new Date();
      this.log(`✅ Concluído: [${task.agent}] ${task.id}`);
      this.callbacks.onTaskCompleted?.(task, result);
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message || String(error);
      result.completedAt = new Date();
      this.log(`❌ Falha: [${task.agent}] ${task.id} - ${result.error}`);
      if (incidentId && (task.agent === 'executor' || task.agent === 'operator')) {
        recordRegression(incidentId, `Falha em ${task.agent}: ${result.error}`);
      }
      this.callbacks.onTaskFailed?.(task, result.error || 'Erro desconhecido');
    }

    this.state?.results.set(task.id, result);
    return result;
  }

  grantApproval() {
    this.approvalGranted = true;
    this.log('✅ Aprovação concedida pelo usuário');
  }

  async resumeAfterApproval(): Promise<OrchestrationState | null> {
    if (!this.state || this.state.status !== 'awaiting-approval') {
      return null;
    }

    this.grantApproval();
    this.state.status = 'executing';

    // Continuar execução das waves restantes
    const waves = getExecutionOrder(this.state.plan);

    for (let waveIdx = this.state.currentWave; waveIdx < waves.length; waveIdx++) {
      const wave = waves[waveIdx];
      this.state.currentWave = waveIdx;
      this.log(`\n=== Wave ${waveIdx + 1}/${waves.length} (retomando) ===`);

      const waveResults = await Promise.all(
        wave.map((task) => {
          // Pular tarefas já executadas
          if (this.state?.results.has(task.id)) {
            return this.state.results.get(task.id)!;
          }
          return this.executeTask(task);
        })
      );

      this.callbacks.onWaveCompleted?.(waveIdx, waveResults);
    }

    this.state.status = 'completed';
    this.state.updatedAt = new Date();
    this.callbacks.onCompleted?.(this.state);

    return this.state;
  }

  setContext(context: Record<string, any>) {
    this.taskContext = { ...this.taskContext, ...context };
  }

  private async runSandboxIfEnabled(task: SubTask) {
    const sandbox = this.taskContext.sandbox as SandboxConfig | undefined;
    if (!sandbox?.enabled) return;

    const repoPath = sandbox.repoPath || this.taskContext.repoPath;
    if (!repoPath) {
      this.log('Sandbox habilitado, mas repoPath não foi fornecido; etapa pulada');
      return;
    }

    // Em Windows sem WSL, o runner bash não funciona; falha ou apenas alerta conforme failMode
    const isWindows = process.platform === 'win32' && !process.env.WSL_DISTRO_NAME;
    if (isWindows) {
      const msg = 'Sandbox requer WSL/Docker; em Windows puro o runner bash não está disponível.';
      this.log(msg);
      if ((sandbox.failMode || 'fail') === 'fail') throw new Error(msg);
      return;
    }

    const repoPathForRunner = this.toDockerPath(repoPath);
    const runnerPath = sandbox.runnerPath || path.join(process.cwd(), 'scripts', 'runner_sandbox.sh');
    const command = sandbox.command || this.autoDetectSandboxCommand(repoPath, sandbox.languageHint);
    const timeoutMs = sandbox.timeoutMs ?? 15 * 60 * 1000;
    const failMode = sandbox.failMode || 'fail';

    if (!fs.existsSync(runnerPath)) {
      const msg = `Runner sandbox não encontrado em ${runnerPath}`;
      this.log(msg);
      if (failMode === 'fail') throw new Error(msg);
      return;
    }

    this.log(`🔒 Sandbox: executando comando opcional (${command}) antes de [${task.agent}]`);

    try {
      const { stdout, stderr } = await execFileAsync('bash', [runnerPath, repoPathForRunner, command], {
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
      });
      if (stdout) this.log(`Sandbox stdout: ${stdout.slice(0, 2000)}`);
      if (stderr) this.log(`Sandbox stderr: ${stderr.slice(0, 2000)}`);
      this.log('Sandbox finalizado com sucesso');
    } catch (err: any) {
      const stderr = err?.stderr?.toString?.() || err?.message || String(err);
      this.log(`Sandbox falhou (${failMode}): ${stderr}`);
      if (failMode === 'fail') {
        throw new Error(`Sandbox falhou: ${stderr}`);
      }
      // warn mode: continuar mesmo com falha
    }
  }

  private toDockerPath(inputPath: string): string {
    if (process.platform !== 'win32') return inputPath;
    const match = inputPath.match(/^[A-Za-z]:\\/);
    if (!match) return inputPath;
    const drive = inputPath[0].toLowerCase();
    const rest = inputPath.slice(2).replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }

  private autoDetectSandboxCommand(repoPath: string, languageHint?: string): string {
    // Presets por linguagem e detecção simples do workspace
    const presetByLang: Record<string, string> = {
      javascript: 'npm test',
      typescript: 'npm test',
      node: 'npm test',
      python: 'pytest',
      go: 'go test ./...',
      rust: 'cargo test',
    };

    if (languageHint && presetByLang[languageHint]) return presetByLang[languageHint];

    try {
      const has = (file: string) => fs.existsSync(path.join(repoPath, file));
      if (has('pnpm-lock.yaml')) return 'pnpm test';
      if (has('yarn.lock')) return 'yarn test';
      if (has('package.json')) return 'npm test';
      if (has('requirements.txt')) return 'pytest';
      if (has('go.mod')) return 'go test ./...';
      if (has('Cargo.toml')) return 'cargo test';
    } catch {
      // fallback silencioso
    }

    return 'npm test';
  }

  getState(): OrchestrationState | null {
    return this.state;
  }

  formatResultsForDisplay(): string {
    if (!this.state) return 'Nenhuma orquestração em andamento';

    const lines: string[] = [];
    lines.push(`## 🎭 Orquestração: ${this.state.id}`);
    lines.push(`**Status:** ${this.state.status}`);
    lines.push(`**Plano:** ${this.state.plan.summary}`);
    lines.push(`**Risco:** ${this.state.plan.riskLevel}`);
    lines.push('');

    lines.push('### 📋 Resultados por Tarefa');
    for (const [taskId, result] of this.state.results) {
      const task = this.state.plan.subtasks.find((t) => t.id === taskId);
      const icon = result.status === 'completed' ? '✅' : result.status === 'failed' ? '❌' : '⏳';
      lines.push(`${icon} **[${result.agent}]** ${task?.description || taskId}`);

      if (result.agent === 'reviewer' && result.output) {
        lines.push(formatReviewForDisplay(result.output));
      }
    }

    return lines.join('\n');
  }
}

// Factory function para criar orquestrador com callbacks padrão
export function createOrchestrator(callbacks?: OrchestrationCallbacks): Orchestrator {
  return new Orchestrator(callbacks);
}
