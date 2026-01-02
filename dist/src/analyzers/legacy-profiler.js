"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileLegacyRepo = profileLegacyRepo;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.py', '.go']);
const MAX_FILES = 40;
const MAX_BYTES = 200000;
function shouldScan(file) {
    return EXTENSIONS.has(path_1.default.extname(file).toLowerCase());
}
function profileLegacyRepo(repoPath) {
    const imports = [];
    const findings = [];
    const suspiciousStrings = [];
    let filesScanned = 0;
    const signals = {
        crypto: false,
        network: false,
        filesystem: false,
        exec: false,
        obfuscation: false,
    };
    const walk = (dir) => {
        if (filesScanned >= MAX_FILES)
            return;
        const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                if (filesScanned >= MAX_FILES)
                    return;
                continue;
            }
            if (!shouldScan(entry.name))
                continue;
            const stat = fs_1.default.statSync(full);
            if (stat.size > MAX_BYTES)
                continue;
            const content = fs_1.default.readFileSync(full, 'utf-8');
            filesScanned += 1;
            // Imports / requires
            const importRegex = /import\s+[^'";]+from\s+['"]([^'";]+)['"]/g;
            const requireRegex = /require\(['"]([^'";]+)['"]\)/g;
            let m;
            while ((m = importRegex.exec(content)) !== null)
                imports.push(m[1]);
            while ((m = requireRegex.exec(content)) !== null)
                imports.push(m[1]);
            const textLower = content.toLowerCase();
            const hit = (kw) => (typeof kw === 'string' ? textLower.includes(kw) : kw.test(content));
            // Crypto
            if (hit('crypto') || hit('aes') || hit('rsa')) {
                signals.crypto = true;
                findings.push(`crypto em ${path_1.default.relative(repoPath, full)}`);
            }
            // Network
            if (hit('fetch(') || hit('axios') || hit('http') || hit('net.')) {
                signals.network = true;
                findings.push(`network em ${path_1.default.relative(repoPath, full)}`);
            }
            // Filesystem
            if (hit('fs.') || hit('open(') || hit('readfile') || hit('writefile')) {
                signals.filesystem = true;
                findings.push(`filesystem em ${path_1.default.relative(repoPath, full)}`);
            }
            // Exec / spawn
            if (hit('child_process') || hit('exec(') || hit('spawn(')) {
                signals.exec = true;
                findings.push(`exec em ${path_1.default.relative(repoPath, full)}`);
            }
            // Obfuscation heuristics
            if (hit(/\b(atob|btoa|buffer\.from)\b/i) && hit(/base64|hex/)) {
                signals.obfuscation = true;
                findings.push(`possível ofuscação em ${path_1.default.relative(repoPath, full)}`);
            }
            // Suspicious strings
            ['secret', 'token', 'password', 'vault', 'private key', '-----begin'].forEach((kw) => {
                if (textLower.includes(kw))
                    suspiciousStrings.push(`${kw} @ ${path_1.default.relative(repoPath, full)}`);
            });
            if (filesScanned >= MAX_FILES)
                return;
        }
    };
    try {
        walk(repoPath);
    }
    catch {
        // fallback silencioso
    }
    return {
        filesScanned,
        imports: Array.from(new Set(imports)).slice(0, 200),
        findings: Array.from(new Set(findings)).slice(0, 200),
        signals,
        suspiciousStrings: suspiciousStrings.slice(0, 200),
    };
}
