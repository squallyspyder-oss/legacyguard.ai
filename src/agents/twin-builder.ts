import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
function getExecFile() {
  // Dynamically require to avoid bundling child_process in serverless/edge builds
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('child_process').execFile;
}
import { emitSandboxLog } from '../lib/sandbox-logs';
import { startIncidentCycle } from '../lib/metrics';
import { logEvent } from '../lib/audit';
import { profileLegacyRepo, LegacyProfile } from '../analyzers/legacy-profiler';
import { classifyBehavior, BehaviorClassification } from '../analyzers/behavior-classifier';
import { generateHarness, HarnessPack } from '../analyzers/harness-generator';

export type IncidentAlert = {
  id: string;
  source: 'sentry' | 'datadog' | 'siem' | 'custom' | 'otel';
  title: string;
  stack?: string;
  payload?: Record<string, unknown>;
  repo?: {
    url?: string;
    owner?: string;
    name?: string;
    commit?: string;
  };
};

export type TwinBuilderInput = {
  taskId: string;
  incident: IncidentAlert;
  repoPath: string;
  sandbox?: {
    enabled?: boolean;
    runnerPath?: string;
    command?: string;
    failMode?: 'fail' | 'warn';
    languageHint?: string;
  };
};

export type TwinBuilderResult = {
  twinId: string;
  status: 'prepared' | 'failed';
  snapshotPath?: string;
  syntheticFixturePath?: string;
  syntheticTests?: Array<{ name: string; input: any }>;
  commands?: {
    test?: string;
    build?: string;
    lint?: string;
    security?: string;
  };
  impactGuardrails?: {
    warnings: string[];
  };
  sandboxCommand?: string;
  legacyProfile?: LegacyProfile;
  behavior?: BehaviorClassification;
  harness?: HarnessPack;
  message: string;
};

function log(taskId: string, message: string, scope: 'sandbox' | 'orchestrator' = 'orchestrator') {
  emitSandboxLog({ taskId, message: `[twin-builder] ${message}`, scope });
}

export async function buildIncidentTwin(input: TwinBuilderInput): Promise<TwinBuilderResult> {
  const { incident, repoPath, sandbox, taskId } = input;
  const twinId = `twin-${taskId}`;
  const incidentId = incident.id || taskId;
  startIncidentCycle(incidentId, incident.source);
  logEvent({
    action: 'twin.prep',
    severity: 'info',
    message: incident.title,
    metadata: { incidentId, source: incident.source },
  }).catch(() => undefined);

  // Deriva caminhos (snapshot, fixtures) de forma determinística e local
  const snapshotPath = path.join(repoPath, '.legacyguard', 'twin-snapshots', incident.id || taskId);
  const syntheticFixturePath = path.join(repoPath, '.legacyguard', 'twin-fixtures', `${incident.id || taskId}.json`);

  log(taskId, `Preparando twin para incidente ${incident.id || '<sem-id>'}`);
  log(taskId, `Snapshot em ${snapshotPath}`);

  const sandboxCommand = sandbox?.command || autoDetectCommand(repoPath, sandbox?.languageHint);
  const commands = detectCommands(repoPath);
  let legacyProfile: LegacyProfile | undefined;
  let behavior: BehaviorClassification | undefined;
  let harness: HarnessPack | undefined;

  try {
    legacyProfile = profileLegacyRepo(repoPath);
    log(taskId, 'Analyzer legacy-profiler loaded');
    behavior = classifyBehavior(legacyProfile);
    log(taskId, 'Analyzer behavior-classifier loaded');
    harness = generateHarness(legacyProfile, behavior, incident);
    log(taskId, 'Analyzer harness-generator loaded');
  } catch (err: unknown) {
    log(taskId, `Analyzer falhou: ${err instanceof Error ? err.message : String(err)}`);
    throw err instanceof Error ? err : new Error(String(err));
  }
  if (sandbox?.enabled) {
    log(taskId, `Sandbox ligado (runner=${sandbox.runnerPath || 'default'}, mode=${sandbox.failMode || 'fail'})`, 'sandbox');
  } else {
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
  if (harness?.fixtures?.length) {
    syntheticTests.push(...harness.fixtures);
  }

  try {
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.mkdir(path.dirname(syntheticFixturePath), { recursive: true });
    await fs.writeFile(
      syntheticFixturePath,
      JSON.stringify({
        ...incidentFixture,
        syntheticTests,
        commands,
        impactGuardrails,
        legacyProfile,
        behavior,
        harness,
      }, null, 2),
      'utf-8'
    );
    log(taskId, `Fixture sintética gravada em ${syntheticFixturePath}`);
  } catch (err: any) {
    log(taskId, `Falha ao persistir fixture: ${err?.message || err}`);
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

  if (sandbox?.enabled && sandbox.runnerPath) {
    try {
      await execSandbox(sandbox.runnerPath, repoPath, sandboxCommand, sandbox.failMode, taskId);
    } catch (err: any) {
      return {
        twinId,
        status: 'failed',
        snapshotPath,
        syntheticFixturePath,
        sandboxCommand,
        syntheticTests,
        commands,
        impactGuardrails,
        message: `Sandbox falhou: ${err?.message || err}`,
      };
    }
  }

  const message = 'Twin builder preparado com snapshot e fixture persistidos.';

  logEvent({
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

function buildSyntheticTests(incident: IncidentAlert) {
  const tests: Array<{ name: string; input: any }> = [];
  if (incident.payload) tests.push({ name: 'replay-payload', input: incident.payload });
  if (incident.stack) tests.push({ name: 'stack-sanity', input: { stack: incident.stack } });
  if (tests.length === 0) tests.push({ name: 'placeholder', input: { note: 'sem payload/stack' } });
  return tests;
}

function detectCommands(repoPath: string | undefined) {
  if (!repoPath) return {};
  const has = (file: string) => fssync.existsSync(path.join(repoPath, file));
  const commands: Record<string, string> = {};

  if (has('pnpm-lock.yaml')) {
    commands.test = 'pnpm test';
    commands.build = 'pnpm build';
    commands.lint = 'pnpm lint';
    commands.security = 'pnpm audit';
  } else if (has('yarn.lock')) {
    commands.test = 'yarn test';
    commands.build = 'yarn build';
    commands.lint = 'yarn lint';
    commands.security = 'yarn audit';
  } else if (has('package.json')) {
    commands.test = 'npm test';
    commands.build = 'npm run build';
    commands.lint = 'npm run lint';
    commands.security = 'npm audit';
  } else if (has('go.mod')) {
    commands.test = 'go test ./...';
    commands.build = 'go build ./...';
    commands.lint = 'golangci-lint run || true';
    commands.security = 'gosec ./... || true';
  } else if (has('Cargo.toml')) {
    commands.test = 'cargo test';
    commands.build = 'cargo build';
    commands.lint = 'cargo clippy || true';
    commands.security = 'cargo audit || true';
  } else if (has('requirements.txt') || has('pyproject.toml')) {
    commands.test = 'pytest';
    commands.build = 'pip install -e .';
    commands.lint = 'ruff check . || true';
    commands.security = 'pip-audit || true';
  }

  return commands;
}

function evaluateImpactGuardrails(incident: IncidentAlert) {
  const warnings: string[] = [];
  const text = `${incident.title || ''} ${JSON.stringify(incident.payload || {})}`.toLowerCase();
  ['prod', 'secrets', 'vault', 'payment', 'pii', 'credential'].forEach((kw) => {
    if (text.includes(kw)) warnings.push(`Possível impacto sensível: ${kw}`);
  });
  return { warnings };
}

async function execSandbox(runnerPath: string, repoPath: string, command: string, failMode: 'fail' | 'warn' = 'fail', taskId: string) {
  const toDockerPath = (p: string) => {
    if (process.platform !== 'win32') return p;
    const match = p.match(/^[A-Za-z]:\\/);
    if (!match) return p;
    const drive = p[0].toLowerCase();
    const rest = p.slice(2).replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  };

  const repoPathForRunner = toDockerPath(repoPath);
  log(taskId, `Executando runner sandbox: ${runnerPath} (${command})`, 'sandbox');

  try {
    await new Promise<void>((resolve, reject) => {
      const child = getExecFile()('bash', [runnerPath, repoPathForRunner, command], { timeout: 10 * 60 * 1000 }, (err: Error | null, stdout: string, stderr: string) => {
        if (stdout) log(taskId, `Sandbox stdout: ${stdout.slice(0, 1000)}`, 'sandbox');
        if (stderr) log(taskId, `Sandbox stderr: ${stderr.slice(0, 1000)}`, 'sandbox');
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      child.on('error', reject);
    });
    log(taskId, 'Sandbox finalizado (twin-builder)', 'sandbox');
  } catch (err: any) {
    log(taskId, `Sandbox falhou (${failMode}): ${err?.message || err}`, 'sandbox');
    if (failMode === 'fail') throw err;
  }
}

function autoDetectCommand(repoPath: string, languageHint?: string): string {
  const presetByLang: Record<string, string> = {
    javascript: 'npm test',
    typescript: 'npm test',
    node: 'npm test',
    python: 'pytest',
    go: 'go test ./...',
    rust: 'cargo test',
  };
  if (languageHint && presetByLang[languageHint]) return presetByLang[languageHint];

  const has = (file: string) => fssync.existsSync(path.join(repoPath, file));
  if (has('pnpm-lock.yaml')) return 'pnpm test';
  if (has('yarn.lock')) return 'yarn test';
  if (has('package.json')) return 'npm test';
  if (has('requirements.txt')) return 'pytest';
  if (has('go.mod')) return 'go test ./...';
  if (has('Cargo.toml')) return 'cargo test';
  return 'npm test';
}

function buildCommandSet(repoPath: string, primary: string): string[] {
  const cmds = new Set<string>();
  cmds.add(primary);
  const has = (file: string) => fssync.existsSync(path.join(repoPath, file));
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
