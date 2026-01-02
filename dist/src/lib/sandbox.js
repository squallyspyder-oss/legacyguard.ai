"use strict";
// Cross-platform sandbox runner using Docker API
// Falls back to shell script on Linux when available
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSandbox = runSandbox;
exports.getSandboxCapabilities = getSandboxCapabilities;
exports.runSandboxWithTwinHarness = runSandboxWithTwinHarness;
exports.validateHarnessCommands = validateHarnessCommands;
const util_1 = require("util");
let spawn;
let exec;
function ensureChildProcess() {
    if (!spawn || !exec) {
        // Dynamically require to avoid bundlers/edge runtimes pulling in child_process at build time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cp = require('child_process');
        spawn = cp.spawn;
        exec = cp.exec;
    }
}
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Language presets for test commands
const LANGUAGE_PRESETS = {
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
async function detectLanguage(repoPath) {
    const indicators = {
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
            if (fs_1.default.existsSync(path_1.default.join(repoPath, file))) {
                return lang;
            }
        }
    }
    return null;
}
// Build command string from harness commands
function buildCommandFromHarness(harness) {
    const commands = [];
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
async function findTestCommand(repoPath, languageHint) {
    var _a, _b;
    const lang = languageHint || (await detectLanguage(repoPath));
    if (!lang || !LANGUAGE_PRESETS[lang])
        return null;
    // Check package.json scripts
    if (['javascript', 'typescript'].includes(lang)) {
        try {
            const pkgPath = path_1.default.join(repoPath, 'package.json');
            if (fs_1.default.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'));
                if (((_a = pkg.scripts) === null || _a === void 0 ? void 0 : _a.test) && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
                    // Choose package manager by lockfile
                    if (fs_1.default.existsSync(path_1.default.join(repoPath, 'pnpm-lock.yaml')))
                        return 'pnpm test';
                    if (fs_1.default.existsSync(path_1.default.join(repoPath, 'yarn.lock')))
                        return 'yarn test';
                    return 'npm test';
                }
            }
        }
        catch {
            // Ignore
        }
    }
    // Prefer lockfile-specific preset
    if (lang === 'javascript' || lang === 'typescript') {
        if (fs_1.default.existsSync(path_1.default.join(repoPath, 'pnpm-lock.yaml')))
            return 'pnpm test';
        if (fs_1.default.existsSync(path_1.default.join(repoPath, 'yarn.lock')))
            return 'yarn test';
        if (fs_1.default.existsSync(path_1.default.join(repoPath, 'package-lock.json')))
            return 'npm test';
    }
    return ((_b = LANGUAGE_PRESETS[lang]) === null || _b === void 0 ? void 0 : _b[0]) || null;
}
// Check if Docker is available
async function isDockerAvailable() {
    // Developer override: force Docker available for local testing without Docker/Wsl
    if (process.env.LEGACYGUARD_FORCE_DOCKER === 'true')
        return true;
    try {
        ensureChildProcess();
        const execAsync = (0, util_1.promisify)(exec);
        // Use a short timeout so detection does not hang if Docker daemon is unresponsive
        await execAsync('docker version --format "{{.Server.Version}}"', { timeout: 2000 });
        return true;
    }
    catch {
        return false;
    }
}
// Check if shell runner exists
function isShellRunnerAvailable(runnerPath) {
    if (!runnerPath)
        return false;
    return fs_1.default.existsSync(runnerPath);
}
// Run sandbox via Docker
async function runDockerSandbox(config) {
    var _a, _b, _c;
    const startTime = Date.now();
    const log = config.onLog || console.log;
    const commandsRun = [];
    // Priority: harnessCommands > commands > command > auto-detect
    let command;
    if (config.harnessCommands) {
        command = buildCommandFromHarness(config.harnessCommands);
        commandsRun.push(...(config.harnessCommands.setup || []));
        commandsRun.push(...config.harnessCommands.run);
        commandsRun.push(...(config.harnessCommands.teardown || []));
        log(`[Sandbox/Docker] Using harness commands from Twin Builder`);
    }
    else if (config.commands && config.commands.length > 0) {
        command = config.commands.join(' && ');
        commandsRun.push(...config.commands);
    }
    else {
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
    const tmpfsSize = (_a = config.tmpfsSizeMb) !== null && _a !== void 0 ? _a : (profile === 'strict' ? 256 : 512);
    // Determine base image based on language
    const lang = config.languageHint || (await detectLanguage(config.repoPath)) || 'javascript';
    const imageMap = {
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
    const envArgs = [];
    const allEnv = { ...config.env, ...(_b = config.harnessCommands) === null || _b === void 0 ? void 0 : _b.env };
    for (const [key, value] of Object.entries(allEnv)) {
        envArgs.push('-e', `${key}=${value}`);
    }
    // Determine working directory
    const workdir = ((_c = config.harnessCommands) === null || _c === void 0 ? void 0 : _c.workdir) || '/workspace';
    return new Promise((resolve) => {
        var _a, _b;
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
        (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            log(`[Sandbox/Docker] ${str.trim()}`);
        });
        (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            log(`[Sandbox/Docker] [stderr] ${str.trim()}`);
        });
        proc.on('close', (code) => {
            clearTimeout(timeout);
            const durationMs = Date.now() - startTime;
            // For harness: exitCode !== 0 means we successfully reproduced the issue
            const reproductionSuccessful = config.harnessCommands ? code !== 0 : undefined;
            resolve({
                success: code === 0,
                exitCode: code !== null && code !== void 0 ? code : (killed ? 137 : 1),
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
async function runShellSandbox(config) {
    const startTime = Date.now();
    const log = config.onLog || console.log;
    const runnerPath = config.runnerPath;
    log(`[Sandbox/Shell] Running: ${runnerPath}`);
    return new Promise((resolve) => {
        var _a, _b;
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
        (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            log(`[Sandbox/Shell] ${str.trim()}`);
        });
        (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            log(`[Sandbox/Shell] [stderr] ${str.trim()}`);
        });
        proc.on('close', (code) => {
            clearTimeout(timeout);
            resolve({
                success: code === 0,
                exitCode: code !== null && code !== void 0 ? code : (killed ? 137 : 1),
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
async function runNativeSandbox(config) {
    const startTime = Date.now();
    const log = config.onLog || console.log;
    const command = config.command || (await findTestCommand(config.repoPath, config.languageHint)) || 'echo "No test command"';
    log(`[Sandbox/Native] ⚠️ Running without isolation (Docker unavailable)`);
    log(`[Sandbox/Native] Command: ${command}`);
    return new Promise((resolve) => {
        var _a, _b;
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
        (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            log(`[Sandbox/Native] ${str.trim()}`);
        });
        (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            log(`[Sandbox/Native] [stderr] ${str.trim()}`);
        });
        proc.on('close', (code) => {
            clearTimeout(timeout);
            resolve({
                success: code === 0,
                exitCode: code !== null && code !== void 0 ? code : (killed ? 137 : 1),
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
async function runSandbox(config) {
    const log = config.onLog || console.log;
    log('[Sandbox] sandbox connected');
    try {
        const entries = fs_1.default.readdirSync(config.repoPath);
        log(`[Sandbox] files parsed (${entries.length} entries)`);
    }
    catch (err) {
        log(`[Sandbox] files parsed (error reading): ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    }
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
    let result;
    if (dockerAvailable) {
        log('[Sandbox] Using Docker isolation');
        result = await runDockerSandbox(config);
    }
    else if (shellAvailable) {
        log('[Sandbox] Using shell runner');
        result = await runShellSandbox(config);
    }
    else {
        log('[Sandbox] ⚠️ Falling back to native execution (no isolation)');
        result = await runNativeSandbox(config);
    }
    // Handle failure based on failMode
    if (!result.success && config.failMode === 'warn') {
        log(`[Sandbox] Warning: Test failed but failMode=warn, continuing`);
        result.success = true; // Override for orchestrator
    }
    if (result.success) {
        log(`[Sandbox] sandbox exec ok (${result.method})`);
    }
    return result;
}
// Get sandbox capabilities
async function getSandboxCapabilities() {
    const docker = process.env.LEGACYGUARD_FORCE_DOCKER === 'true' ? true : await isDockerAvailable();
    const shell = process.platform !== 'win32';
    return {
        docker,
        shell,
        recommended: docker ? 'docker' : shell ? 'shell' : 'native',
    };
}
// Run sandbox with Twin Builder harness
async function runSandboxWithTwinHarness(repoPath, harness, options) {
    const log = (options === null || options === void 0 ? void 0 : options.onLog) || console.log;
    log(`[Sandbox/Twin] Running harness with ${harness.commands.length} commands`);
    // Convert Twin harness format to HarnessCommands format
    const harnessCommands = {
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
        timeoutMs: (options === null || options === void 0 ? void 0 : options.timeoutMs) || 120000, // 2 min default for harness
        failMode: 'fail', // We want to know if reproduction failed
        onLog: log,
        useDocker: options === null || options === void 0 ? void 0 : options.useDocker,
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
function validateHarnessCommands(commands) {
    const warnings = [];
    const blocked = [];
    const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!tmp)/i, // rm -rf outside /tmp
        /curl\s+.*\|\s*(?:bash|sh)/i, // curl | bash
        /wget\s+.*\|\s*(?:bash|sh)/i, // wget | bash
        />\s*\/etc\//i, // writing to /etc
        /chmod\s+777/i, // world-writable
        /mkfs/i, // filesystem commands
        /dd\s+if=/i, // dd commands
    ];
    const warningPatterns = [
        /sudo/i, // sudo usage
        /su\s+-/i, // su usage
        /npm\s+install\s+--unsafe/i, // unsafe npm
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
