// Cross-platform sandbox runner using Docker API
// Falls back to shell script on Linux when available

import { promisify } from 'util';
let spawn: any;
let exec: any;
function ensureChildProcess() {
  if (!spawn || !exec) {
    // Dynamically require to avoid bundlers/edge runtimes pulling in child_process at build time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cp = require('child_process');
    spawn = cp.spawn;
    exec = cp.exec;
  }
}
import path from 'path';
import fs from 'fs';

// execAsync will be created on-demand via ensureChildProcess()

// Harness commands from Twin Builder
export type HarnessCommands = {
  setup?: string[];    // Commands to set up test environment
  run: string[];       // Commands to reproduce/test the scenario
  teardown?: string[]; // Cleanup commands
  env?: Record<string, string>; // Environment variables
  workdir?: string;    // Working directory override
};

export type SandboxConfig = {
  enabled?: boolean;
  repoPath: string;
  command?: string;
  commands?: string[]; // Multiple commands to run in sequence
  harnessCommands?: HarnessCommands; // Commands from Twin Builder harness
  runnerPath?: string;
  timeoutMs?: number;
  failMode?: 'fail' | 'warn';
  languageHint?: string;
  onLog?: (message: string) => void;
  useDocker?: boolean; // Force Docker mode
  env?: Record<string, string>; // Additional environment variables
  isolationProfile?: 'strict' | 'permissive'; // Strict = no network + readonly FS by default
  networkPolicy?: 'none' | 'bridge'; // Overrides isolationProfile
  fsPolicy?: 'readonly' | 'readwrite'; // Overrides isolationProfile
  memoryLimit?: string; // Docker memory limit (e.g., "1g")
  cpuLimit?: string; // Docker CPU limit (e.g., "1" for 1 vCPU)
  tmpfsSizeMb?: number; // Size for /tmp tmpfs
};

export type SandboxResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  method: 'docker' | 'shell' | 'native';
  error?: string;
  commandsRun?: string[];
  reproductionSuccessful?: boolean; // For Twin harness - did we reproduce the issue?
};

// Language presets for test commands
const LANGUAGE_PRESETS: Record<string, string[]> = {
  javascript: ['pnpm test', 'yarn test', 'npm test'],
  typescript: ['pnpm test', 'yarn test', 'npm test'],
  python: ['pytest', 'python -m pytest', 'python -m unittest'],
  go: ['go test ./...'],
  rust: ['cargo test'],
  java: ['mvn test', 'gradle test'],
  ruby: ['bundle exec rspec', 'rake test'],
  php: ['vendor/bin/phpunit', 'composer test'],
};

// Detect language from repo
async function detectLanguage(repoPath: string): Promise<string | null> {
  const indicators: Record<string, string[]> = {
    javascript: ['package.json'],
    typescript: ['tsconfig.json'],
    python: ['requirements.txt', 'pyproject.toml', 'setup.py'],
    go: ['go.mod', 'go.sum'],
    rust: ['Cargo.toml'],
    java: ['pom.xml', 'build.gradle'],
    ruby: ['Gemfile'],
    php: ['composer.json'],
  };

  for (const [lang, files] of Object.entries(indicators)) {
    for (const file of files) {
      if (fs.existsSync(path.join(repoPath, file))) {
        return lang;
      }
    }
  }
  return null;
}

// Build command string from harness commands
function buildCommandFromHarness(harness: HarnessCommands): string {
  const commands: string[] = [];
  
  // Setup phase
  if (harness.setup && harness.setup.length > 0) {
    commands.push(`echo "=== SETUP PHASE ==="`);
    commands.push(...harness.setup);
  }
  
  // Run phase (required)
  commands.push(`echo "=== RUN PHASE ==="`);
  commands.push(...harness.run);
  
  // Teardown phase (always run, even on failure)
  if (harness.teardown && harness.teardown.length > 0) {
    // Store exit code, run teardown, then exit with stored code
    commands.push(`HARNESS_EXIT=$?`);
    commands.push(`echo "=== TEARDOWN PHASE ==="`);
    commands.push(...harness.teardown);
    commands.push(`exit $HARNESS_EXIT`);
  }
  
  return commands.join(' && ');
}

// Find best test command for language
async function findTestCommand(repoPath: string, languageHint?: string): Promise<string | null> {
  const lang = languageHint || (await detectLanguage(repoPath));
  if (!lang || !LANGUAGE_PRESETS[lang]) return null;

  // Check package.json scripts
  if (['javascript', 'typescript'].includes(lang)) {
    try {
      const pkgPath = path.join(repoPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
          // Choose package manager by lockfile
          if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm test';
          if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return 'yarn test';
          return 'npm test';
        }
      }
    } catch {
      // Ignore
    }
  }

  // Prefer lockfile-specific preset
  if (lang === 'javascript' || lang === 'typescript') {
    if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm test';
    if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return 'yarn test';
    if (fs.existsSync(path.join(repoPath, 'package-lock.json'))) return 'npm test';
  }

  return LANGUAGE_PRESETS[lang]?.[0] || null;
}

// Check if Docker is available
async function isDockerAvailable(): Promise<boolean> {
  // Developer override: force Docker available for local testing without Docker/Wsl
  if (process.env.LEGACYGUARD_FORCE_DOCKER === 'true') return true;
  try {
    ensureChildProcess();
    const execAsync = promisify(exec);
    await execAsync('docker version --format "{{.Server.Version}}"');
    return true;
  } catch {
    return false;
  }
}

// Check if shell runner exists
function isShellRunnerAvailable(runnerPath?: string): boolean {
  if (!runnerPath) return false;
  return fs.existsSync(runnerPath);
}

// Run sandbox via Docker
async function runDockerSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const startTime = Date.now();
  const log = config.onLog || console.log;
  const commandsRun: string[] = [];

  // Priority: harnessCommands > commands > command > auto-detect
  let command: string;
  if (config.harnessCommands) {
    command = buildCommandFromHarness(config.harnessCommands);
    commandsRun.push(...(config.harnessCommands.setup || []));
    commandsRun.push(...config.harnessCommands.run);
    commandsRun.push(...(config.harnessCommands.teardown || []));
    log(`[Sandbox/Docker] Using harness commands from Twin Builder`);
  } else if (config.commands && config.commands.length > 0) {
    command = config.commands.join(' && ');
    commandsRun.push(...config.commands);
  } else {
    command = config.command || (await findTestCommand(config.repoPath, config.languageHint)) || 'echo "No test command found"';
    commandsRun.push(command);
  }

  const timeoutSec = Math.ceil((config.timeoutMs || 300000) / 1000);

  // Isolation defaults
  const profile = config.isolationProfile || 'strict';
  const networkPolicy = config.networkPolicy || (profile === 'strict' ? 'none' : 'bridge');
  const fsPolicy = config.fsPolicy || (profile === 'strict' ? 'readonly' : 'readwrite');
  const memoryLimit = config.memoryLimit || (profile === 'strict' ? '1g' : '2g');
  const cpuLimit = config.cpuLimit || (profile === 'strict' ? '1' : '2');
  const tmpfsSize = config.tmpfsSizeMb ?? (profile === 'strict' ? 256 : 512);

  // Determine base image based on language
  const lang = config.languageHint || (await detectLanguage(config.repoPath)) || 'javascript';
  const imageMap: Record<string, string> = {
    javascript: 'node:20-alpine',
    typescript: 'node:20-alpine',
    python: 'python:3.11-slim',
    go: 'golang:1.21-alpine',
    rust: 'rust:1.75-slim',
    java: 'maven:3.9-eclipse-temurin-21',
    ruby: 'ruby:3.2-slim',
    php: 'php:8.2-cli',
  };
  const image = imageMap[lang] || 'node:20-alpine';

  log(`[Sandbox/Docker] Starting container with image: ${image}`);
  log(`[Sandbox/Docker] Command: ${command}`);
  log(`[Sandbox/Docker] Timeout: ${timeoutSec}s`);
  log(`[Sandbox/Docker] Policy: network=${networkPolicy}, fs=${fsPolicy}, mem=${memoryLimit}, cpu=${cpuLimit}`);

  // Build environment variable args
  const envArgs: string[] = [];
  const allEnv = { ...config.env, ...config.harnessCommands?.env };
  for (const [key, value] of Object.entries(allEnv)) {
    envArgs.push('-e', `${key}=${value}`);
  }

  // Determine working directory
  const workdir = config.harnessCommands?.workdir || '/workspace';

  return new Promise((resolve) => {
    const args = [
      'run',
      '--rm',
      `--network=${networkPolicy}`,
      `--memory=${memoryLimit}`,
      `--cpus=${cpuLimit}`,
      '--pids-limit=256',
      '--security-opt', 'no-new-privileges',
      '--cap-drop=ALL',
      ...(fsPolicy === 'readonly' ? ['--read-only'] : []),
      `--tmpfs=/tmp:rw,nodev,nosuid,size=${tmpfsSize}m`,
      `-v=${config.repoPath}:/workspace:${fsPolicy === 'readonly' ? 'ro' : 'rw'}`,
      `-w=${workdir}`,
      ...envArgs,
      image,
      '/bin/sh',
      '-c',
      command,
    ];

    let stdout = '';
    let stderr = '';
    let killed = false;
    ensureChildProcess();

    const proc = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: config.timeoutMs || 300000,
    });

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, config.timeoutMs || 300000);

    proc.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      stdout += str;
      log(`[Sandbox/Docker] ${str.trim()}`);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      stderr += str;
      log(`[Sandbox/Docker] [stderr] ${str.trim()}`);
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      
      // For harness: exitCode !== 0 means we successfully reproduced the issue
      const reproductionSuccessful = config.harnessCommands ? code !== 0 : undefined;

      resolve({
        success: code === 0,
        exitCode: code ?? (killed ? 137 : 1),
        stdout,
        stderr,
        durationMs,
        method: 'docker',
        error: killed ? 'Timeout exceeded' : undefined,
        commandsRun,
        reproductionSuccessful,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        exitCode: 1,
        stdout,
        stderr: err.message,
        durationMs: Date.now() - startTime,
        method: 'docker',
        error: err.message,
      });
    });
  });
}

// Run sandbox via shell script (Linux/Mac)
async function runShellSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const startTime = Date.now();
  const log = config.onLog || console.log;
  const runnerPath = config.runnerPath!;

  log(`[Sandbox/Shell] Running: ${runnerPath}`);

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SANDBOX_REPO_PATH: config.repoPath,
      SANDBOX_COMMAND: config.command || '',
      SANDBOX_TIMEOUT_MS: String(config.timeoutMs || 300000),
    };

    ensureChildProcess();

    const proc = spawn('bash', [runnerPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      timeout: config.timeoutMs || 300000,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, config.timeoutMs || 300000);

    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      log(`[Sandbox/Shell] ${str.trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      log(`[Sandbox/Shell] [stderr] ${str.trim()}`);
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        success: code === 0,
        exitCode: code ?? (killed ? 137 : 1),
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
        method: 'shell',
        error: killed ? 'Timeout exceeded' : undefined,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        exitCode: 1,
        stdout,
        stderr: err.message,
        durationMs: Date.now() - startTime,
        method: 'shell',
        error: err.message,
      });
    });
  });
}

// Run sandbox natively (fallback - less secure)
async function runNativeSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const startTime = Date.now();
  const log = config.onLog || console.log;

  const command = config.command || (await findTestCommand(config.repoPath, config.languageHint)) || 'echo "No test command"';

  log(`[Sandbox/Native] ⚠️ Running without isolation (Docker unavailable)`);
  log(`[Sandbox/Native] Command: ${command}`);

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    ensureChildProcess();

    const proc = spawn(shell, shellArgs, {
      cwd: config.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: config.timeoutMs || 300000,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, config.timeoutMs || 300000);

    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      log(`[Sandbox/Native] ${str.trim()}`);
    });

    proc.stderr?.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      log(`[Sandbox/Native] [stderr] ${str.trim()}`);
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        success: code === 0,
        exitCode: code ?? (killed ? 137 : 1),
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
        method: 'native',
        error: killed ? 'Timeout exceeded' : undefined,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        exitCode: 1,
        stdout,
        stderr: err.message,
        durationMs: Date.now() - startTime,
        method: 'native',
        error: err.message,
      });
    });
  });
}

// Main sandbox runner
export async function runSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const log = config.onLog || console.log;
  

  if (!config.enabled) {
    log('[Sandbox] Disabled, skipping');
    return {
      success: true,
      exitCode: 0,
      stdout: 'Sandbox disabled',
      stderr: '',
      durationMs: 0,
      method: 'native',
    };
  }

  // Priority: Docker > Shell script > Native
  const dockerAvailable = config.useDocker !== false && (await isDockerAvailable());
  const shellAvailable = isShellRunnerAvailable(config.runnerPath) && process.platform !== 'win32';

  let result: SandboxResult;

  if (dockerAvailable) {
    log('[Sandbox] Using Docker isolation');
    result = await runDockerSandbox(config);
  } else if (shellAvailable) {
    log('[Sandbox] Using shell runner');
    result = await runShellSandbox(config);
  } else {
    log('[Sandbox] ⚠️ Falling back to native execution (no isolation)');
    result = await runNativeSandbox(config);
  }

  // Handle failure based on failMode
  if (!result.success && config.failMode === 'warn') {
    log(`[Sandbox] Warning: Test failed but failMode=warn, continuing`);
    result.success = true; // Override for orchestrator
  }

  return result;
}

// Get sandbox capabilities
export async function getSandboxCapabilities(): Promise<{
  docker: boolean;
  shell: boolean;
  recommended: 'docker' | 'shell' | 'native';
}> {
  const docker = process.env.LEGACYGUARD_FORCE_DOCKER === 'true' ? true : await isDockerAvailable();
  const shell = process.platform !== 'win32';

  return {
    docker,
    shell,
    recommended: docker ? 'docker' : shell ? 'shell' : 'native',
  };
}

// Run sandbox with Twin Builder harness
export async function runSandboxWithTwinHarness(
  repoPath: string,
  harness: {
    commands: string[];
    testFixture?: string;
    env?: Record<string, string>;
  },
  options?: {
    timeoutMs?: number;
    onLog?: (message: string) => void;
    useDocker?: boolean;
  }
): Promise<SandboxResult> {
  const log = options?.onLog || console.log;
  
  log(`[Sandbox/Twin] Running harness with ${harness.commands.length} commands`);
  
  // Convert Twin harness format to HarnessCommands format
  const harnessCommands: HarnessCommands = {
    setup: [],
    run: harness.commands,
    teardown: [],
    env: harness.env,
  };

  // If there's a test fixture, add setup command to create it
  if (harness.testFixture) {
    harnessCommands.setup = [
      `echo "Setting up test fixture..."`,
      `mkdir -p /tmp/fixtures`,
    ];
  }

  const result = await runSandbox({
    enabled: true,
    repoPath,
    harnessCommands,
    timeoutMs: options?.timeoutMs || 120000, // 2 min default for harness
    failMode: 'fail', // We want to know if reproduction failed
    onLog: log,
    useDocker: options?.useDocker,
  });

  // Interpret result for Twin context
  // For incident reproduction: exitCode !== 0 means we reproduced the issue (good!)
  // For fix verification: exitCode === 0 means fix works (good!)
  
  return {
    ...result,
    reproductionSuccessful: result.exitCode !== 0,
  };
}

// Validate harness commands for safety
export function validateHarnessCommands(commands: string[]): {
  valid: boolean;
  warnings: string[];
  blocked: string[];
} {
  const warnings: string[] = [];
  const blocked: string[] = [];
  
  const dangerousPatterns = [
    /rm\s+-rf\s+\/(?!tmp)/i,  // rm -rf outside /tmp
    /curl\s+.*\|\s*(?:bash|sh)/i,  // curl | bash
    /wget\s+.*\|\s*(?:bash|sh)/i,  // wget | bash
    />\s*\/etc\//i,  // writing to /etc
    /chmod\s+777/i,  // world-writable
    /mkfs/i,  // filesystem commands
    /dd\s+if=/i,  // dd commands
  ];

  const warningPatterns = [
    /sudo/i,  // sudo usage
    /su\s+-/i,  // su usage
    /npm\s+install\s+--unsafe/i,  // unsafe npm
  ];

  for (const cmd of commands) {
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        blocked.push(`Blocked dangerous command: ${cmd.slice(0, 50)}...`);
      }
    }
    for (const pattern of warningPatterns) {
      if (pattern.test(cmd)) {
        warnings.push(`Warning in command: ${cmd.slice(0, 50)}...`);
      }
    }
  }

  return {
    valid: blocked.length === 0,
    warnings,
    blocked,
  };
}
