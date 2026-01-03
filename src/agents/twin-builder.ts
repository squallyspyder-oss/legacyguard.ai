import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
function getExecFile() {
  // Dynamically require to avoid bundling child_process in serverless/edge builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('child_process').execFile;
}
import { emitSandboxLog } from '../lib/sandbox-logs';
import { startIncidentCycle } from '../lib/metrics';
import { logEvent } from '../lib/audit';
import { profileLegacyRepo, LegacyProfile } from '../analyzers/legacy-profiler';
import { classifyBehavior, BehaviorClassification } from '../analyzers/behavior-classifier';
import { generateHarness, HarnessPack } from '../analyzers/harness-generator';

// Twin Builder: Cria "digital twins" de incidentes para reprodução controlada
// Este agente é fundamental para debug de bugs complexos no LegacyGuard.
// Ele gera fixtures sintéticas, harness de testes e reproduz cenários em sandbox.

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
  syntheticTests?: Array<{ name: string; input: unknown }>;
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
  /** Se o repositório foi clonado de remoto (true) ou era local (false/undefined) */
  repoCloned?: boolean;
  /** Caminho efetivo do repositório usado (pode ser diferente do input se foi clonado) */
  resolvedRepoPath?: string;
};

function log(taskId: string, message: string, scope: 'sandbox' | 'orchestrator' = 'orchestrator') {
  emitSandboxLog({ taskId, message: `[twin-builder] ${message}`, scope });
}

// Diretório base para repositórios clonados
const CLONED_REPOS_DIR = path.join(process.cwd(), '.legacyguard', 'cloned-repos');

/**
 * Clona repositório remoto para uso local pelo Twin Builder.
 * Suporta GitHub URLs com autenticação via GITHUB_TOKEN.
 * 
 * @param repoUrl - URL do repositório (https://github.com/owner/repo ou owner/repo)
 * @param targetDir - Diretório destino (opcional, gera automaticamente se não fornecido)
 * @param commit - Commit específico para checkout (opcional)
 * @param taskId - ID da task para logging
 * @returns Caminho local do repositório clonado
 */
async function cloneRepository(
  repoUrl: string,
  targetDir: string | undefined,
  commit: string | undefined,
  taskId: string
): Promise<string> {
  // Normalizar URL do repositório
  let normalizedUrl = repoUrl;
  
  // Se for formato owner/repo, converter para URL completa
  if (!repoUrl.includes('://') && repoUrl.includes('/')) {
    normalizedUrl = `https://github.com/${repoUrl}.git`;
  }
  
  // Se for URL HTTPS do GitHub, adicionar token se disponível
  const token = process.env.GITHUB_TOKEN;
  if (token && normalizedUrl.includes('github.com') && normalizedUrl.startsWith('https://')) {
    normalizedUrl = normalizedUrl.replace(
      'https://github.com/',
      `https://${token}@github.com/`
    );
  }
  
  // Determinar diretório destino
  const repoName = repoUrl.split('/').slice(-1)[0].replace('.git', '');
  const cloneDir = targetDir || path.join(CLONED_REPOS_DIR, `${repoName}-${Date.now()}`);
  
  log(taskId, `Clonando repositório: ${repoUrl.replace(/\/\/[^@]+@/, '//')} → ${cloneDir}`);
  
  try {
    // Criar diretório pai se necessário
    await fs.mkdir(path.dirname(cloneDir), { recursive: true });
    
    // Clone com depth=1 para ser mais rápido (shallow clone)
    const cloneArgs = ['clone', '--depth', '1'];
    
    // Se commit específico, precisamos de clone completo
    if (commit) {
      cloneArgs.length = 0;
      cloneArgs.push('clone');
    }
    
    cloneArgs.push(normalizedUrl, cloneDir);
    
    await new Promise<void>((resolve, reject) => {
      const child = getExecFile()('git', cloneArgs, { timeout: 5 * 60 * 1000 }, (err: Error | null, stdout: string, stderr: string) => {
        if (stdout) log(taskId, `git clone stdout: ${stdout.slice(0, 500)}`);
        if (stderr && !stderr.includes('Cloning into')) log(taskId, `git clone stderr: ${stderr.slice(0, 500)}`);
        if (err) reject(err);
        else resolve();
      });
      child.on('error', reject);
    });
    
    // Checkout de commit específico se fornecido
    if (commit) {
      log(taskId, `Checkout do commit: ${commit}`);
      await new Promise<void>((resolve, reject) => {
        getExecFile()('git', ['checkout', commit], { cwd: cloneDir, timeout: 60 * 1000 }, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    log(taskId, `Repositório clonado com sucesso: ${cloneDir}`);
    
    await logEvent({
      action: 'twin.repo.cloned',
      severity: 'info',
      message: `Repositório clonado para Twin Builder`,
      metadata: { taskId, repoUrl, cloneDir, commit },
    });
    
    return cloneDir;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(taskId, `Falha ao clonar repositório: ${errorMsg}`);
    
    await logEvent({
      action: 'twin.repo.clone.failed',
      severity: 'error',
      message: `Falha ao clonar repositório: ${errorMsg}`,
      metadata: { taskId, repoUrl, error: errorMsg },
    });
    
    throw new Error(`Falha ao clonar repositório ${repoUrl}: ${errorMsg}`);
  }
}

/**
 * Remove repositório clonado após uso.
 * Chamado quando o twin builder finaliza (sucesso ou falha).
 */
async function cleanupClonedRepo(clonedPath: string, taskId: string): Promise<void> {
  // Só limpa se estiver dentro do diretório de repos clonados
  if (!clonedPath.startsWith(CLONED_REPOS_DIR)) {
    return;
  }
  
  try {
    await fs.rm(clonedPath, { recursive: true, force: true });
    log(taskId, `Repositório clonado removido: ${clonedPath}`);
  } catch (err: unknown) {
    // Não falhar se cleanup não funcionar
    log(taskId, `Aviso: falha ao remover repo clonado: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Resolve o caminho do repositório: usa local se existir, clona se necessário.
 */
async function resolveRepoPath(
  inputRepoPath: string,
  incident: IncidentAlert,
  taskId: string
): Promise<{ repoPath: string; wasCloned: boolean }> {
  // Se o caminho local existe, usar diretamente
  if (fssync.existsSync(inputRepoPath)) {
    log(taskId, `Usando repositório local: ${inputRepoPath}`);
    return { repoPath: inputRepoPath, wasCloned: false };
  }
  
  // Se não existe localmente, verificar se incidente tem info de repo remoto
  const repoInfo = incident.repo;
  if (!repoInfo) {
    throw new Error(
      `Repositório não encontrado em ${inputRepoPath} e incidente não tem informações de repositório remoto. ` +
      `Forneça um repoPath válido ou inclua incident.repo com url/owner/name.`
    );
  }
  
  // Construir URL do repositório
  let repoUrl: string | undefined;
  
  if (repoInfo.url) {
    repoUrl = repoInfo.url;
  } else if (repoInfo.owner && repoInfo.name) {
    repoUrl = `${repoInfo.owner}/${repoInfo.name}`;
  }
  
  if (!repoUrl) {
    throw new Error(
      `Informações insuficientes para clonar repositório. ` +
      `Forneça incident.repo.url ou incident.repo.owner + incident.repo.name.`
    );
  }
  
  // Clonar repositório
  const clonedPath = await cloneRepository(repoUrl, undefined, repoInfo.commit, taskId);
  
  return { repoPath: clonedPath, wasCloned: true };
}

export async function buildIncidentTwin(input: TwinBuilderInput): Promise<TwinBuilderResult> {
  const { incident, repoPath: inputRepoPath, sandbox, taskId } = input;
  const twinId = `twin-${taskId}`;
  const incidentId = incident.id || taskId;
  startIncidentCycle(incidentId, incident.source);
  logEvent({
    action: 'twin.prep',
    severity: 'info',
    message: incident.title,
    metadata: { incidentId, source: incident.source },
  }).catch(() => undefined);

  // Resolver caminho do repositório (local ou clonar de remoto)
  let repoPath: string;
  let wasCloned = false;
  
  try {
    const resolved = await resolveRepoPath(inputRepoPath, incident, taskId);
    repoPath = resolved.repoPath;
    wasCloned = resolved.wasCloned;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(taskId, `Falha ao resolver repositório: ${errorMsg}`);
    return {
      twinId,
      status: 'failed',
      message: errorMsg,
    };
  }

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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(taskId, `Falha ao persistir fixture: ${errorMsg}`);
    // Cleanup se foi clonado
    if (wasCloned) await cleanupClonedRepo(repoPath, taskId);
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
      repoCloned: wasCloned,
      resolvedRepoPath: repoPath,
    };
  }

  if (sandbox?.enabled && sandbox.runnerPath) {
    try {
      await execSandbox(sandbox.runnerPath, repoPath, sandboxCommand, sandbox.failMode, taskId);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Cleanup se foi clonado
      if (wasCloned) await cleanupClonedRepo(repoPath, taskId);
      return {
        twinId,
        status: 'failed',
        snapshotPath,
        syntheticFixturePath,
        sandboxCommand,
        syntheticTests,
        commands,
        impactGuardrails,
        message: `Sandbox falhou: ${errorMsg}`,
        repoCloned: wasCloned,
        resolvedRepoPath: repoPath,
      };
    }
  }

  const message = 'Twin builder preparado com snapshot e fixture persistidos.';

  logEvent({
    action: 'twin.prepared',
    severity: 'info',
    message,
    metadata: { incidentId, snapshotPath, fixture: syntheticFixturePath, repoCloned: wasCloned },
  }).catch(() => undefined);

  // Cleanup de repo clonado após sucesso
  // NOTA: Não removemos imediatamente para permitir debug posterior
  // O cleanup pode ser feito manualmente ou via cron job
  // Se quiser cleanup automático, descomentar:
  // if (wasCloned) await cleanupClonedRepo(repoPath, taskId);

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
    message: wasCloned 
      ? `${message} (repositório clonado de ${incident.repo?.url || incident.repo?.owner + '/' + incident.repo?.name})`
      : message,
    repoCloned: wasCloned,
    resolvedRepoPath: repoPath,
  };
}

function buildSyntheticTests(incident: IncidentAlert) {
  const tests: Array<{ name: string; input: unknown }> = [];
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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(taskId, `Sandbox falhou (${failMode}): ${errorMsg}`, 'sandbox');
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
