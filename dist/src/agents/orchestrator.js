"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
exports.createOrchestrator = createOrchestrator;
/* eslint-disable @typescript-eslint/no-explicit-any */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const planner_1 = require("./planner");
const advisor_1 = require("./advisor");
const operator_1 = require("./operator");
const executor_1 = require("./executor");
const reviewer_1 = require("./reviewer");
const twin_builder_1 = require("./twin-builder");
const impact_1 = require("../lib/impact");
const sandbox_logs_1 = require("../lib/sandbox-logs");
const metrics_1 = require("../lib/metrics");
const audit_1 = require("../lib/audit");
const sandbox_1 = require("../lib/sandbox");
class Orchestrator {
    constructor(callbacks = {}) {
        this.state = null;
        this.approvalGranted = false;
        this.taskContext = {};
        this.policy = {};
        this.callbacks = callbacks;
        console.log('[agent] Agent initialized');
    }
    log(message) {
        var _a, _b, _c, _d, _e, _f, _g;
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        (_a = this.state) === null || _a === void 0 ? void 0 : _a.logs.push(logEntry);
        (_c = (_b = this.callbacks).onLog) === null || _c === void 0 ? void 0 : _c.call(_b, logEntry);
        const taskId = (_d = this.taskContext) === null || _d === void 0 ? void 0 : _d.taskId;
        const scope = message.includes('Sandbox') ? 'sandbox' : 'orchestrator';
        (0, sandbox_logs_1.emitSandboxLog)({ taskId, message: logEntry, scope });
        (_g = (_f = (_e = this.taskContext) === null || _e === void 0 ? void 0 : _e.sandbox) === null || _f === void 0 ? void 0 : _f.onLog) === null || _g === void 0 ? void 0 : _g.call(_f, logEntry);
        console.log(logEntry);
    }
    async execute(request, context) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        this.log(`Iniciando orquestração para: "${request.slice(0, 100)}..."`);
        this.log('analysis started');
        if (context) {
            this.setContext({ ...context });
            if (context.executionPolicy) {
                this.policy = context.executionPolicy;
            }
            const incidentId = context.incidentId || ((_a = context.incident) === null || _a === void 0 ? void 0 : _a.id);
            if (incidentId) {
                (0, metrics_1.startIncidentCycle)(incidentId, (_b = context.incident) === null || _b === void 0 ? void 0 : _b.source);
                this.taskContext.incidentId = incidentId;
            }
        }
        if (this.taskContext.incidentId) {
            (0, audit_1.logEvent)({
                action: 'orchestration.start',
                severity: 'info',
                message: request.slice(0, 200),
                metadata: { taskId: this.taskContext.incidentId, executionPolicy: this.policy },
            }).catch(() => undefined);
        }
        // 0. TWIN BUILDER (pré-planner) - se houver incidente
        let twinResult;
        const incident = context === null || context === void 0 ? void 0 : context.incident;
        const repoPath = (context === null || context === void 0 ? void 0 : context.repoPath) || this.taskContext.repoPath;
        if (repoPath)
            this.taskContext.repoPath = repoPath;
        if (incident && repoPath) {
            this.log('Fase 0: Twin Builder (preparando contexto de incidente)');
            try {
                twinResult = await (0, twin_builder_1.buildIncidentTwin)({
                    taskId: this.taskContext.taskId || `twin-${Date.now()}`,
                    incident,
                    repoPath,
                    sandbox: context === null || context === void 0 ? void 0 : context.sandbox,
                });
                this.log(`🔬 Twin preparado: ${twinResult.twinId} (status: ${twinResult.status})`);
                if (twinResult.legacyProfile) {
                    this.log(`   📊 Profile: ${twinResult.legacyProfile.filesScanned} arquivos, signals: ${Object.entries(twinResult.legacyProfile.signals).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nenhum'}`);
                }
                if (twinResult.behavior) {
                    this.log(`   ⚠️ Risco: ${twinResult.behavior.risk}, comportamentos: ${twinResult.behavior.behaviors.join(', ')}`);
                }
                if ((_d = (_c = twinResult.harness) === null || _c === void 0 ? void 0 : _c.commands) === null || _d === void 0 ? void 0 : _d.length) {
                    this.log(`   🔧 Harness: ${twinResult.harness.commands.length} comandos sugeridos`);
                    // Enriquecer sandbox config com harness commands
                    if (this.taskContext.sandbox) {
                        this.taskContext.sandbox.commands = twinResult.harness.commands.map(c => c.command);
                        this.taskContext.sandbox.harnessCommands = {
                            run: twinResult.harness.commands.map(c => c.command),
                        };
                    }
                }
                if ((_f = (_e = twinResult.impactGuardrails) === null || _e === void 0 ? void 0 : _e.warnings) === null || _f === void 0 ? void 0 : _f.length) {
                    this.log(`   🛡️ Guardrails: ${twinResult.impactGuardrails.warnings.join('; ')}`);
                }
                // Salvar no contexto para uso pelos agentes
                this.taskContext.twinResult = twinResult;
                (_h = (_g = this.callbacks).onTwinBuilt) === null || _h === void 0 ? void 0 : _h.call(_g, twinResult);
                (0, audit_1.logEvent)({
                    action: 'twin.built',
                    severity: 'info',
                    message: `Twin ${twinResult.twinId} preparado`,
                    metadata: {
                        twinId: twinResult.twinId,
                        status: twinResult.status,
                        risk: (_j = twinResult.behavior) === null || _j === void 0 ? void 0 : _j.risk,
                    },
                }).catch(() => undefined);
            }
            catch (err) {
                this.log(`⚠️ Twin Builder falhou: ${(err === null || err === void 0 ? void 0 : err.message) || err}. Continuando sem contexto de twin.`);
            }
        }
        // 1. Planejamento (agora com contexto de twin se disponível)
        this.log('Fase 1: Planejamento');
        const plan = await (0, planner_1.runPlanner)({
            request,
            context: context === null || context === void 0 ? void 0 : context.summary,
            repoInfo: context === null || context === void 0 ? void 0 : context.repoInfo,
        });
        // Guardrail adicional: se risco vier alto/crítico, exigir aprovação mesmo que o planner não marque
        if ((plan.riskLevel === 'high' || plan.riskLevel === 'critical') && !plan.requiresApproval) {
            plan.requiresApproval = true;
            this.log('⚠️ Risco alto/crítico detectado: aprovação obrigatória forçada');
        }
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
        (_l = (_k = this.callbacks).onPlanCreated) === null || _l === void 0 ? void 0 : _l.call(_k, plan);
        // 2. Execução por waves
        this.state.status = 'executing';
        const waves = (0, planner_1.getExecutionOrder)(plan);
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
                (_o = (_m = this.callbacks).onApprovalRequired) === null || _o === void 0 ? void 0 : _o.call(_m, plan, wave.find((t) => t.agent === 'executor'));
                return this.state; // Pausa aqui até aprovação
            }
            // Executar tarefas em paralelo dentro da wave
            const waveResults = await Promise.all(wave.map((task) => this.executeTask(task)));
            // Verificar falhas críticas
            const failures = waveResults.filter((r) => r.status === 'failed');
            if (failures.length > 0) {
                const criticalFailure = failures.find((f) => {
                    const task = wave.find((t) => t.id === f.taskId);
                    return (task === null || task === void 0 ? void 0 : task.priority) === 'high';
                });
                if (criticalFailure) {
                    this.log(`❌ Falha crítica em tarefa de alta prioridade: ${criticalFailure.taskId}`);
                    this.state.status = 'failed';
                    break;
                }
            }
            (_q = (_p = this.callbacks).onWaveCompleted) === null || _q === void 0 ? void 0 : _q.call(_p, waveIdx, waveResults);
            this.log(`Wave ${waveIdx + 1} concluída`);
        }
        // 3. Finalização
        if (this.state.status !== 'failed') {
            this.state.status = 'completed';
        }
        // Stream tail: report risk level and last known rollback plan
        const rollbackPlan = this.getRollbackPlan();
        const rollbackPreview = rollbackPlan ? (rollbackPlan.length > 220 ? `${rollbackPlan.slice(0, 220)}...` : rollbackPlan) : 'não informado';
        this.log(`📊 Resumo final: risco=${this.state.plan.riskLevel}; rollback=${rollbackPreview}`);
        const incidentId = this.taskContext.incidentId;
        if (incidentId) {
            (0, metrics_1.markMitigation)(incidentId, this.state.status === 'completed' ? 'mitigated' : 'failed');
            (0, audit_1.logEvent)({
                action: 'orchestration.finish',
                severity: this.state.status === 'completed' ? 'info' : 'warn',
                message: `status=${this.state.status}`,
                metadata: { incidentId, waves: this.state.currentWave + 1 },
            }).catch(() => undefined);
        }
        this.state.updatedAt = new Date();
        this.log(`\n✅ Orquestração finalizada com status: ${this.state.status}`);
        (_s = (_r = this.callbacks).onCompleted) === null || _s === void 0 ? void 0 : _s.call(_r, this.state);
        return this.state;
    }
    async executeTask(task) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.log(`▶️ Iniciando: [${task.agent}] ${task.description}`);
        (_b = (_a = this.callbacks).onTaskStarted) === null || _b === void 0 ? void 0 : _b.call(_a, task);
        const incidentId = this.taskContext.incidentId;
        if (this.policy.allowedAgents && !this.policy.allowedAgents.includes(task.agent)) {
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
        const result = {
            taskId: task.id,
            status: 'running',
            agent: task.agent,
            output: null,
            startedAt: new Date(),
            sandboxPhase: task.sandboxPhase,
        };
        const descLower = (task.description || '').toLowerCase();
        const forbiddenHit = (_c = this.policy.forbiddenKeywords) === null || _c === void 0 ? void 0 : _c.find((k) => descLower.includes(k.toLowerCase()));
        if (forbiddenHit) {
            const msg = `Tarefa bloqueada por guardrail (keyword: ${forbiddenHit})`;
            this.log(msg);
            result.status = 'failed';
            result.error = msg;
            result.completedAt = new Date();
            (_d = this.state) === null || _d === void 0 ? void 0 : _d.results.set(task.id, result);
            return result;
        }
        try {
            // Coletar contexto de tarefas anteriores (dependências)
            const depContext = {};
            for (const depId of task.dependencies) {
                const depResult = (_e = this.state) === null || _e === void 0 ? void 0 : _e.results.get(depId);
                if (depResult === null || depResult === void 0 ? void 0 : depResult.output) {
                    depContext[depId] = depResult.output;
                }
            }
            // Executar agente apropriado
            switch (task.agent) {
                case 'advisor':
                    result.output = await (0, advisor_1.runAdvisor)({
                        repoPath: this.taskContext.repoPath,
                        query: task.description,
                        twinContext: this.taskContext.twinResult,
                        dependencyContext: depContext,
                    });
                    break;
                case 'reviewer':
                    // Pegar patch do operator se disponível
                    const operatorResult = Object.values(depContext).find((d) => (d === null || d === void 0 ? void 0 : d.role) === 'operator');
                    result.output = await (0, reviewer_1.runReviewer)({
                        patch: operatorResult === null || operatorResult === void 0 ? void 0 : operatorResult.patch,
                        context: task.description,
                        strictMode: task.priority === 'high',
                    });
                    const review = result.output;
                    if (!review.approved) {
                        this.log(`⚠️ Reviewer reprovou: ${review.summary}`);
                        if (incidentId)
                            (0, metrics_1.recordRegression)(incidentId, 'Reviewer reprovou a entrega');
                    }
                    break;
                case 'operator': {
                    // Se for fase sandbox (pre/post), apenas roda sandbox/harness e registra resultado
                    if (task.sandboxPhase) {
                        const sbResult = await this.runSandboxIfEnabled(task);
                        if (!sbResult) {
                            throw new Error('Sandbox não executado na fase ' + task.sandboxPhase);
                        }
                        const phase = task.sandboxPhase;
                        const reproduced = sbResult.reproductionSuccessful === true;
                        const passed = sbResult.success;
                        if (phase === 'pre') {
                            this.log(`🧪 Sandbox pré (harness): ${passed ? 'passou (incomum)' : reproduced ? 'reproduziu bug (esperado)' : 'falhou sem reproduzir'}`);
                        }
                        else {
                            this.log(`✅ Sandbox pós: ${passed ? 'corrigido (passou)' : 'falhou, incidente persiste'}`);
                        }
                        if (task.sandboxPhase === 'post' && !sbResult.success) {
                            throw new Error('Sandbox pós-patch falhou; incidente não mitigado');
                        }
                        result.output = sbResult;
                        break;
                    }
                    await this.runSandboxIfEnabled(task);
                    result.output = await (0, operator_1.runOperator)({
                        repoPath: this.taskContext.repoPath || '',
                        action: task.description,
                        dependencyContext: depContext,
                        twinContext: this.taskContext.twinResult,
                    });
                    break;
                }
                case 'executor': {
                    if (this.taskContext.safeMode) {
                        throw new Error('Safe mode habilitado: executor bloqueado');
                    }
                    await this.runSandboxIfEnabled(task);
                    result.output = await (0, executor_1.runExecutor)({
                        owner: this.taskContext.owner || '',
                        repo: this.taskContext.repo || '',
                        prNumber: this.taskContext.prNumber || 0,
                        token: this.taskContext.token || '',
                        action: task.description,
                        twinContext: this.taskContext.twinResult,
                        dependencyContext: depContext,
                    });
                    break;
                }
                case 'advisor-impact':
                    // Tarefa especial de impacto
                    if (!this.taskContext.repoPath) {
                        throw new Error('repoPath não definido para análise de impacto');
                    }
                    result.output = await (0, impact_1.analyzeImpact)(this.taskContext.repoPath, task.description || 'refatoração');
                    break;
                default:
                    throw new Error(`Agente desconhecido: ${task.agent}`);
            }
            result.status = 'completed';
            result.completedAt = new Date();
            this.log(`✅ Concluído: [${task.agent}] ${task.id}`);
            (_g = (_f = this.callbacks).onTaskCompleted) === null || _g === void 0 ? void 0 : _g.call(_f, task, result);
        }
        catch (error) {
            result.status = 'failed';
            result.error = error.message || String(error);
            result.completedAt = new Date();
            this.log(`❌ Falha: [${task.agent}] ${task.id} - ${result.error}`);
            if (incidentId && (task.agent === 'executor' || task.agent === 'operator')) {
                (0, metrics_1.recordRegression)(incidentId, `Falha em ${task.agent}: ${result.error}`);
            }
            (_j = (_h = this.callbacks).onTaskFailed) === null || _j === void 0 ? void 0 : _j.call(_h, task, result.error || 'Erro desconhecido');
        }
        (_k = this.state) === null || _k === void 0 ? void 0 : _k.results.set(task.id, result);
        return result;
    }
    grantApproval() {
        this.approvalGranted = true;
        this.log('✅ Aprovação concedida pelo usuário');
    }
    async resumeAfterApproval() {
        var _a, _b, _c, _d;
        if (!this.state || this.state.status !== 'awaiting-approval') {
            return null;
        }
        this.grantApproval();
        this.state.status = 'executing';
        // Continuar execução das waves restantes
        const waves = (0, planner_1.getExecutionOrder)(this.state.plan);
        for (let waveIdx = this.state.currentWave; waveIdx < waves.length; waveIdx++) {
            const wave = waves[waveIdx];
            this.state.currentWave = waveIdx;
            this.log(`\n=== Wave ${waveIdx + 1}/${waves.length} (retomando) ===`);
            const waveResults = await Promise.all(wave.map((task) => {
                var _a;
                // Pular tarefas já executadas
                if ((_a = this.state) === null || _a === void 0 ? void 0 : _a.results.has(task.id)) {
                    return this.state.results.get(task.id);
                }
                return this.executeTask(task);
            }));
            (_b = (_a = this.callbacks).onWaveCompleted) === null || _b === void 0 ? void 0 : _b.call(_a, waveIdx, waveResults);
        }
        this.state.status = 'completed';
        this.state.updatedAt = new Date();
        (_d = (_c = this.callbacks).onCompleted) === null || _d === void 0 ? void 0 : _d.call(_c, this.state);
        return this.state;
    }
    setContext(context) {
        this.taskContext = { ...this.taskContext, ...context };
    }
    async runSandboxIfEnabled(task) {
        var _a, _b;
        const sandbox = this.taskContext.sandbox;
        const riskLevel = ((_a = this.state) === null || _a === void 0 ? void 0 : _a.plan.riskLevel) || 'medium';
        const requiresSandbox = riskLevel === 'high' || riskLevel === 'critical';
        if (!(sandbox === null || sandbox === void 0 ? void 0 : sandbox.enabled) && requiresSandbox) {
            throw new Error('Sandbox obrigatório para tasks de risco alto/crítico');
        }
        if (!(sandbox === null || sandbox === void 0 ? void 0 : sandbox.enabled))
            return null;
        const repoPath = sandbox.repoPath || this.taskContext.repoPath;
        if (!repoPath) {
            this.log('Sandbox habilitado, mas repoPath não foi fornecido; etapa pulada');
            return null;
        }
        // Se um runnerPath foi fornecido mas não existe no FS, respeitar failMode
        if (sandbox.runnerPath) {
            try {
                if (!fs_1.default.existsSync(sandbox.runnerPath)) {
                    const msg = `Sandbox runner não encontrado: ${sandbox.runnerPath}`;
                    this.log(msg);
                    if ((sandbox.failMode || 'fail') === 'fail')
                        throw new Error(msg);
                    return null;
                }
            }
            catch {
                // se houver erro em verificar, prosseguir e deixar runSandbox lidar com fallbacks
            }
        }
        // Em Windows sem WSL, o runner bash não funciona; falha ou apenas alerta conforme failMode
        const isWindows = process.platform === 'win32' && !process.env.WSL_DISTRO_NAME;
        if (isWindows) {
            const msg = 'Sandbox requer WSL/Docker; em Windows puro o runner bash não está disponível.';
            this.log(msg);
            if ((sandbox.failMode || 'fail') === 'fail')
                throw new Error(msg);
            return null;
        }
        // Para risco alto/crítico, exigir Docker; sem Docker aborta
        if (requiresSandbox) {
            const caps = await (0, sandbox_1.getSandboxCapabilities)();
            if (!caps.docker) {
                throw new Error('Sandbox Docker indisponível; não é seguro executar tasks de risco alto/crítico sem isolamento');
            }
        }
        const harness = sandbox.harnessCommands;
        const commands = sandbox.commands;
        // Normalize commands which may come as HarnessSuggestion[] (from twin.harness.commands)
        const normalizeArr = (arr) => {
            if (!arr)
                return undefined;
            if (arr.length === 0)
                return [];
            if (arr.every((v) => typeof v === 'string'))
                return arr;
            if (arr.every((v) => v && typeof v.command === 'string'))
                return arr.map((v) => v.command);
            return arr.map((v) => String(v));
        };
        const normalizedCommands = normalizeArr(commands);
        let normalizedHarness = undefined;
        if (harness) {
            normalizedHarness = {
                run: normalizeArr(harness.run) || [],
                setup: normalizeArr(harness.setup) || [],
                teardown: normalizeArr(harness.teardown) || [],
                env: harness.env,
                workdir: harness.workdir,
            };
        }
        const command = sandbox.command || this.autoDetectSandboxCommand(repoPath, sandbox.languageHint);
        const timeoutMs = (_b = sandbox.timeoutMs) !== null && _b !== void 0 ? _b : 15 * 60 * 1000;
        const failMode = task.sandboxPhase === 'pre' ? 'warn' : sandbox.failMode || 'fail';
        if (!harness && !(commands === null || commands === void 0 ? void 0 : commands.length) && !command) {
            this.log('Sandbox: nenhum comando definido (pulando)');
            return null;
        }
        this.log(`🔒 Sandbox: executando ${harness ? 'harness Twin' : 'comando autodetect'} antes de [${task.agent}]`);
        const result = await (0, sandbox_1.runSandbox)({
            enabled: true,
            repoPath,
            harnessCommands: normalizedHarness,
            commands: normalizedCommands,
            command,
            timeoutMs,
            failMode: failMode,
            languageHint: sandbox.languageHint,
            isolationProfile: sandbox.isolationProfile || (requiresSandbox ? 'strict' : 'permissive'),
            networkPolicy: sandbox.networkPolicy,
            fsPolicy: sandbox.fsPolicy,
            memoryLimit: sandbox.memoryLimit,
            cpuLimit: sandbox.cpuLimit,
            tmpfsSizeMb: sandbox.tmpfsSizeMb,
            useDocker: sandbox.useDocker,
            runnerPath: sandbox.runnerPath,
            onLog: (m) => this.log(m),
        });
        if (!result.success && failMode === 'fail') {
            throw new Error(`Sandbox falhou: ${result.stderr || result.stdout || 'erro desconhecido'}`);
        }
        return result;
    }
    toDockerPath(inputPath) {
        if (process.platform !== 'win32')
            return inputPath;
        const match = inputPath.match(/^[A-Za-z]:\\/);
        if (!match)
            return inputPath;
        const drive = inputPath[0].toLowerCase();
        const rest = inputPath.slice(2).replace(/\\/g, '/');
        return `/mnt/${drive}/${rest}`;
    }
    autoDetectSandboxCommand(repoPath, languageHint) {
        // Presets por linguagem e detecção simples do workspace
        const presetByLang = {
            javascript: 'npm test',
            typescript: 'npm test',
            node: 'npm test',
            python: 'pytest',
            go: 'go test ./...',
            rust: 'cargo test',
        };
        if (languageHint && presetByLang[languageHint])
            return presetByLang[languageHint];
        try {
            const has = (file) => fs_1.default.existsSync(path_1.default.join(repoPath, file));
            if (has('pnpm-lock.yaml'))
                return 'pnpm test';
            if (has('yarn.lock'))
                return 'yarn test';
            if (has('package.json'))
                return 'npm test';
            if (has('requirements.txt'))
                return 'pytest';
            if (has('go.mod'))
                return 'go test ./...';
            if (has('Cargo.toml'))
                return 'cargo test';
        }
        catch {
            // fallback silencioso
        }
        return 'npm test';
    }
    getState() {
        return this.state;
    }
    formatResultsForDisplay() {
        if (!this.state)
            return 'Nenhuma orquestração em andamento';
        const lines = [];
        lines.push(`## 🎭 Orquestração: ${this.state.id}`);
        lines.push(`**Status:** ${this.state.status}`);
        lines.push(`**Plano:** ${this.state.plan.summary}`);
        lines.push(`**Risco:** ${this.state.plan.riskLevel}`);
        lines.push('');
        lines.push('### 📋 Resultados por Tarefa');
        for (const [taskId, result] of this.state.results) {
            const task = this.state.plan.subtasks.find((t) => t.id === taskId);
            const icon = result.status === 'completed' ? '✅' : result.status === 'failed' ? '❌' : '⏳';
            lines.push(`${icon} **[${result.agent}]** ${(task === null || task === void 0 ? void 0 : task.description) || taskId}`);
            if (result.agent === 'reviewer' && result.output) {
                lines.push((0, reviewer_1.formatReviewForDisplay)(result.output));
            }
        }
        return lines.join('\n');
    }
    getRollbackPlan() {
        var _a;
        if (!this.state)
            return undefined;
        const results = Array.from(this.state.results.values());
        for (let i = results.length - 1; i >= 0; i--) {
            const out = (_a = results[i]) === null || _a === void 0 ? void 0 : _a.output;
            const rollback = (out === null || out === void 0 ? void 0 : out.rollbackInstructions) || (out === null || out === void 0 ? void 0 : out.rollbackPlan);
            if (rollback && typeof rollback === 'string' && rollback.trim().length > 0) {
                return rollback.trim();
            }
        }
        return undefined;
    }
}
exports.Orchestrator = Orchestrator;
// Factory function para criar orquestrador com callbacks padrão
function createOrchestrator(callbacks) {
    return new Orchestrator(callbacks);
}
