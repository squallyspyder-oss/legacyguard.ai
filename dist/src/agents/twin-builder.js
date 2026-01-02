"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIncidentTwin = buildIncidentTwin;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
function getExecFile() {
    // Dynamically require to avoid bundling child_process in serverless/edge builds
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('child_process').execFile;
}
const sandbox_logs_1 = require("../lib/sandbox-logs");
const metrics_1 = require("../lib/metrics");
const audit_1 = require("../lib/audit");
const legacy_profiler_1 = require("../analyzers/legacy-profiler");
const behavior_classifier_1 = require("../analyzers/behavior-classifier");
const harness_generator_1 = require("../analyzers/harness-generator");
function log(taskId, message, scope = 'orchestrator') {
    (0, sandbox_logs_1.emitSandboxLog)({ taskId, message: `[twin-builder] ${message}`, scope });
}
async function buildIncidentTwin(input) {
    var _a;
    const { incident, repoPath, sandbox, taskId } = input;
    const twinId = `twin-${taskId}`;
    const incidentId = incident.id || taskId;
    (0, metrics_1.startIncidentCycle)(incidentId, incident.source);
    (0, audit_1.logEvent)({
        action: 'twin.prep',
        severity: 'info',
        message: incident.title,
        metadata: { incidentId, source: incident.source },
    }).catch(() => undefined);
    // Deriva caminhos (snapshot, fixtures) de forma determinística e local
    const snapshotPath = path_1.default.join(repoPath, '.legacyguard', 'twin-snapshots', incident.id || taskId);
    const syntheticFixturePath = path_1.default.join(repoPath, '.legacyguard', 'twin-fixtures', `${incident.id || taskId}.json`);
    log(taskId, `Preparando twin para incidente ${incident.id || '<sem-id>'}`);
    log(taskId, `Snapshot em ${snapshotPath}`);
    const sandboxCommand = (sandbox === null || sandbox === void 0 ? void 0 : sandbox.command) || autoDetectCommand(repoPath, sandbox === null || sandbox === void 0 ? void 0 : sandbox.languageHint);
    const commands = detectCommands(repoPath);
    let legacyProfile;
    let behavior;
    let harness;
    try {
        legacyProfile = (0, legacy_profiler_1.profileLegacyRepo)(repoPath);
        log(taskId, 'Analyzer legacy-profiler loaded');
        behavior = (0, behavior_classifier_1.classifyBehavior)(legacyProfile);
        log(taskId, 'Analyzer behavior-classifier loaded');
        harness = (0, harness_generator_1.generateHarness)(legacyProfile, behavior, incident);
        log(taskId, 'Analyzer harness-generator loaded');
    }
    catch (err) {
        log(taskId, `Analyzer falhou: ${err instanceof Error ? err.message : String(err)}`);
        throw err instanceof Error ? err : new Error(String(err));
    }
    if (sandbox === null || sandbox === void 0 ? void 0 : sandbox.enabled) {
        log(taskId, `Sandbox ligado (runner=${sandbox.runnerPath || 'default'}, mode=${sandbox.failMode || 'fail'})`, 'sandbox');
    }
    else {
        log(taskId, 'Sandbox desabilitado para este twin');
    }
    // Criar diretórios e persistir fixture sintética (stack, payload do alerta)
    const incidentFixture = {
        id: incident.id,
        source: incident.source,
        title: incident.title,
        stack: incident.stack,
        payload: incident.payload,
        capturedAt: new Date().toISOString(),
    };
    const syntheticTests = buildSyntheticTests(incident);
    const impactGuardrails = evaluateImpactGuardrails(incident);
    if ((_a = harness === null || harness === void 0 ? void 0 : harness.fixtures) === null || _a === void 0 ? void 0 : _a.length) {
        syntheticTests.push(...harness.fixtures);
    }
    try {
        await promises_1.default.mkdir(path_1.default.dirname(snapshotPath), { recursive: true });
        await promises_1.default.mkdir(path_1.default.dirname(syntheticFixturePath), { recursive: true });
        await promises_1.default.writeFile(syntheticFixturePath, JSON.stringify({
            ...incidentFixture,
            syntheticTests,
            commands,
            impactGuardrails,
            legacyProfile,
            behavior,
            harness,
        }, null, 2), 'utf-8');
        log(taskId, `Fixture sintética gravada em ${syntheticFixturePath}`);
    }
    catch (err) {
        log(taskId, `Falha ao persistir fixture: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
        return {
            twinId,
            status: 'failed',
            snapshotPath,
            syntheticFixturePath,
            sandboxCommand,
            syntheticTests,
            commands,
            impactGuardrails,
            message: 'Falha ao preparar fixture do incidente',
        };
    }
    if ((sandbox === null || sandbox === void 0 ? void 0 : sandbox.enabled) && sandbox.runnerPath) {
        try {
            await execSandbox(sandbox.runnerPath, repoPath, sandboxCommand, sandbox.failMode, taskId);
        }
        catch (err) {
            return {
                twinId,
                status: 'failed',
                snapshotPath,
                syntheticFixturePath,
                sandboxCommand,
                syntheticTests,
                commands,
                impactGuardrails,
                message: `Sandbox falhou: ${(err === null || err === void 0 ? void 0 : err.message) || err}`,
            };
        }
    }
    const message = 'Twin builder preparado com snapshot e fixture persistidos.';
    (0, audit_1.logEvent)({
        action: 'twin.prepared',
        severity: 'info',
        message,
        metadata: { incidentId, snapshotPath, fixture: syntheticFixturePath },
    }).catch(() => undefined);
    return {
        twinId,
        status: 'prepared',
        snapshotPath,
        syntheticFixturePath,
        syntheticTests,
        commands,
        impactGuardrails,
        sandboxCommand,
        legacyProfile,
        behavior,
        harness,
        message,
    };
}
function buildSyntheticTests(incident) {
    const tests = [];
    if (incident.payload)
        tests.push({ name: 'replay-payload', input: incident.payload });
    if (incident.stack)
        tests.push({ name: 'stack-sanity', input: { stack: incident.stack } });
    if (tests.length === 0)
        tests.push({ name: 'placeholder', input: { note: 'sem payload/stack' } });
    return tests;
}
function detectCommands(repoPath) {
    if (!repoPath)
        return {};
    const has = (file) => fs_1.default.existsSync(path_1.default.join(repoPath, file));
    const commands = {};
    if (has('pnpm-lock.yaml')) {
        commands.test = 'pnpm test';
        commands.build = 'pnpm build';
        commands.lint = 'pnpm lint';
        commands.security = 'pnpm audit';
    }
    else if (has('yarn.lock')) {
        commands.test = 'yarn test';
        commands.build = 'yarn build';
        commands.lint = 'yarn lint';
        commands.security = 'yarn audit';
    }
    else if (has('package.json')) {
        commands.test = 'npm test';
        commands.build = 'npm run build';
        commands.lint = 'npm run lint';
        commands.security = 'npm audit';
    }
    else if (has('go.mod')) {
        commands.test = 'go test ./...';
        commands.build = 'go build ./...';
        commands.lint = 'golangci-lint run || true';
        commands.security = 'gosec ./... || true';
    }
    else if (has('Cargo.toml')) {
        commands.test = 'cargo test';
        commands.build = 'cargo build';
        commands.lint = 'cargo clippy || true';
        commands.security = 'cargo audit || true';
    }
    else if (has('requirements.txt') || has('pyproject.toml')) {
        commands.test = 'pytest';
        commands.build = 'pip install -e .';
        commands.lint = 'ruff check . || true';
        commands.security = 'pip-audit || true';
    }
    return commands;
}
function evaluateImpactGuardrails(incident) {
    const warnings = [];
    const text = `${incident.title || ''} ${JSON.stringify(incident.payload || {})}`.toLowerCase();
    ['prod', 'secrets', 'vault', 'payment', 'pii', 'credential'].forEach((kw) => {
        if (text.includes(kw))
            warnings.push(`Possível impacto sensível: ${kw}`);
    });
    return { warnings };
}
async function execSandbox(runnerPath, repoPath, command, failMode = 'fail', taskId) {
    const toDockerPath = (p) => {
        if (process.platform !== 'win32')
            return p;
        const match = p.match(/^[A-Za-z]:\\/);
        if (!match)
            return p;
        const drive = p[0].toLowerCase();
        const rest = p.slice(2).replace(/\\/g, '/');
        return `/mnt/${drive}/${rest}`;
    };
    const repoPathForRunner = toDockerPath(repoPath);
    log(taskId, `Executando runner sandbox: ${runnerPath} (${command})`, 'sandbox');
    try {
        await new Promise((resolve, reject) => {
            const child = getExecFile()('bash', [runnerPath, repoPathForRunner, command], { timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
                if (stdout)
                    log(taskId, `Sandbox stdout: ${stdout.slice(0, 1000)}`, 'sandbox');
                if (stderr)
                    log(taskId, `Sandbox stderr: ${stderr.slice(0, 1000)}`, 'sandbox');
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
            child.on('error', reject);
        });
        log(taskId, 'Sandbox finalizado (twin-builder)', 'sandbox');
    }
    catch (err) {
        log(taskId, `Sandbox falhou (${failMode}): ${(err === null || err === void 0 ? void 0 : err.message) || err}`, 'sandbox');
        if (failMode === 'fail')
            throw err;
    }
}
function autoDetectCommand(repoPath, languageHint) {
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
    return 'npm test';
}
function buildCommandSet(repoPath, primary) {
    const cmds = new Set();
    cmds.add(primary);
    const has = (file) => fs_1.default.existsSync(path_1.default.join(repoPath, file));
    if (has('package.json')) {
        cmds.add('npm run lint');
        cmds.add('npm run build');
    }
    if (has('pnpm-lock.yaml')) {
        cmds.add('pnpm run lint');
        cmds.add('pnpm run build');
    }
    if (has('yarn.lock')) {
        cmds.add('yarn lint');
        cmds.add('yarn build');
    }
    if (has('requirements.txt')) {
        cmds.add('pytest');
    }
    if (has('go.mod')) {
        cmds.add('go test ./...');
        cmds.add('go vet ./...');
    }
    if (has('Cargo.toml')) {
        cmds.add('cargo test');
        cmds.add('cargo clippy');
    }
    return Array.from(cmds);
}
