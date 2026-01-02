"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
exports.GET = GET;
const server_1 = require("next/server");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const next_auth_1 = require("next-auth");
const rag_indexer_1 = require("@/lib/rag-indexer");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// RAG indexer (pgvector)
const ragEnabled = !!(process.env.PGVECTOR_URL || process.env.AUDIT_DB_URL) && !!process.env.OPENAI_API_KEY;
const REPOS_DIR = path_1.default.join(process.cwd(), '.legacyguard', 'repos');
// Ensure repos directory exists
function ensureReposDir() {
    if (!fs_1.default.existsSync(REPOS_DIR)) {
        fs_1.default.mkdirSync(REPOS_DIR, { recursive: true });
    }
}
// Collect files for indexing
function collectFiles(repoPath) {
    const files = [];
    const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.md', '.json', '.yaml', '.yml'];
    function walk(dir, base = '') {
        try {
            for (const entry of fs_1.default.readdirSync(dir, { withFileTypes: true })) {
                const rel = path_1.default.join(base, entry.name);
                const full = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target'].includes(entry.name))
                        continue;
                    walk(full, rel);
                }
                else {
                    const ext = path_1.default.extname(entry.name).toLowerCase();
                    if (allowedExts.includes(ext)) {
                        const stat = fs_1.default.statSync(full);
                        if (stat.size < 100000) {
                            files.push({ path: rel, size: stat.size });
                        }
                    }
                }
            }
        }
        catch {
            // ignore permission errors
        }
    }
    walk(repoPath);
    return files;
}
// Collect files with content for RAG indexing
function collectFilesWithContent(repoPath) {
    const files = [];
    const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h', '.hpp'];
    function walk(dir, base = '') {
        try {
            for (const entry of fs_1.default.readdirSync(dir, { withFileTypes: true })) {
                const rel = path_1.default.join(base, entry.name);
                const full = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target'].includes(entry.name))
                        continue;
                    walk(full, rel);
                }
                else {
                    const ext = path_1.default.extname(entry.name).toLowerCase();
                    if (allowedExts.includes(ext)) {
                        const stat = fs_1.default.statSync(full);
                        if (stat.size < 50000) { // Smaller limit for embedding
                            try {
                                const content = fs_1.default.readFileSync(full, 'utf-8');
                                files.push({ path: rel, content });
                            }
                            catch {
                                // skip binary/unreadable files
                            }
                        }
                    }
                }
            }
        }
        catch {
            // ignore permission errors
        }
    }
    walk(repoPath);
    return files;
}
// Generate unique repo folder name
function generateRepoFolderName(name) {
    const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const timestamp = Date.now().toString(36);
    return `${sanitized}-${timestamp}`;
}
async function POST(req) {
    var _a;
    try {
        ensureReposDir();
        const contentType = req.headers.get('content-type') || '';
        // Handle file upload
        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const action = formData.get('action');
            if (action === 'upload') {
                const files = formData.getAll('files');
                if (files.length === 0) {
                    return server_1.NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
                }
                const folderName = generateRepoFolderName('upload');
                const uploadDir = path_1.default.join(REPOS_DIR, folderName);
                fs_1.default.mkdirSync(uploadDir, { recursive: true });
                // Save uploaded files
                for (const file of files) {
                    const buffer = Buffer.from(await file.arrayBuffer());
                    const filePath = path_1.default.join(uploadDir, file.name);
                    const fileDir = path_1.default.dirname(filePath);
                    if (!fs_1.default.existsSync(fileDir)) {
                        fs_1.default.mkdirSync(fileDir, { recursive: true });
                    }
                    fs_1.default.writeFileSync(filePath, buffer);
                }
                const indexedFiles = collectFiles(uploadDir);
                return server_1.NextResponse.json({
                    indexed: true,
                    action: 'upload',
                    path: uploadDir,
                    fileCount: indexedFiles.length,
                    totalSize: indexedFiles.reduce((acc, f) => acc + f.size, 0),
                    files: indexedFiles.slice(0, 30).map((f) => f.path),
                });
            }
        }
        // Handle JSON body
        const body = await req.json().catch(() => ({}));
        const action = body.action || 'index-local';
        // Git Clone (public / generic)
        if (action === 'clone') {
            const gitUrl = body.gitUrl;
            const branch = body.branch || 'main';
            if (!gitUrl) {
                return server_1.NextResponse.json({ error: 'gitUrl é obrigatório para clone' }, { status: 400 });
            }
            // Extract repo name from URL
            const repoName = ((_a = gitUrl.split('/').pop()) === null || _a === void 0 ? void 0 : _a.replace('.git', '')) || 'repo';
            const folderName = generateRepoFolderName(repoName);
            const clonePath = path_1.default.join(REPOS_DIR, folderName);
            // Clone repository
            try {
                await execAsync(`git clone --depth 1 --branch ${branch} "${gitUrl}" "${clonePath}"`, {
                    timeout: 120000, // 2 min timeout
                });
            }
            catch (cloneError) {
                // Try without branch specification
                try {
                    await execAsync(`git clone --depth 1 "${gitUrl}" "${clonePath}"`, {
                        timeout: 120000,
                    });
                }
                catch (fallbackError) {
                    return server_1.NextResponse.json({
                        error: `Erro ao clonar: ${fallbackError.message || 'Falha no git clone'}`
                    }, { status: 500 });
                }
            }
            const indexedFiles = collectFiles(clonePath);
            // RAG indexing (pgvector)
            let ragStats = null;
            if (ragEnabled) {
                try {
                    const ragIndexer = (0, rag_indexer_1.getRAGIndexer)();
                    const codeFiles = collectFilesWithContent(clonePath);
                    const repoId = folderName;
                    ragStats = await ragIndexer.indexRepo(repoId, codeFiles);
                }
                catch (ragError) {
                    console.warn('[index] RAG indexing failed:', ragError.message);
                }
            }
            return server_1.NextResponse.json({
                indexed: true,
                action: 'clone',
                path: clonePath,
                gitUrl,
                branch,
                fileCount: indexedFiles.length,
                totalSize: indexedFiles.reduce((acc, f) => acc + f.size, 0),
                files: indexedFiles.slice(0, 30).map((f) => f.path),
                rag: ragStats ? {
                    enabled: true,
                    chunks: ragStats.totalChunks,
                    languages: ragStats.languages,
                } : { enabled: false },
            });
        }
        // GitHub clone using authenticated session (lists come from /api/github/repos)
        if (action === 'clone-github') {
            const session = await (0, next_auth_1.getServerSession)();
            // @ts-ignore
            const accessToken = session === null || session === void 0 ? void 0 : session.accessToken;
            if (!accessToken) {
                return server_1.NextResponse.json({ error: 'Não autenticado no GitHub' }, { status: 401 });
            }
            const owner = body.owner;
            const repo = body.repo;
            const branch = body.branch || 'main';
            if (!owner || !repo) {
                return server_1.NextResponse.json({ error: 'owner e repo são obrigatórios' }, { status: 400 });
            }
            const repoName = `${owner}-${repo}`;
            const folderName = generateRepoFolderName(repoName);
            const clonePath = path_1.default.join(REPOS_DIR, folderName);
            const gitUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;
            try {
                await execAsync(`git clone --depth 1 --branch ${branch} "${gitUrl}" "${clonePath}"`, {
                    timeout: 120000,
                });
            }
            catch (cloneError) {
                return server_1.NextResponse.json({
                    error: (cloneError === null || cloneError === void 0 ? void 0 : cloneError.message) || 'Erro ao clonar repositório privado',
                }, { status: 500 });
            }
            const indexedFiles = collectFiles(clonePath);
            let ragStats = null;
            if (ragEnabled) {
                try {
                    const ragIndexer = (0, rag_indexer_1.getRAGIndexer)();
                    const codeFiles = collectFilesWithContent(clonePath);
                    const repoId = folderName;
                    ragStats = await ragIndexer.indexRepo(repoId, codeFiles);
                }
                catch (ragError) {
                    console.warn('[index] RAG indexing failed:', ragError.message);
                }
            }
            return server_1.NextResponse.json({
                indexed: true,
                action: 'clone-github',
                path: clonePath,
                owner,
                repo,
                branch,
                fileCount: indexedFiles.length,
                totalSize: indexedFiles.reduce((acc, f) => acc + f.size, 0),
                files: indexedFiles.slice(0, 30).map((f) => f.path),
                rag: ragStats ? {
                    enabled: true,
                    chunks: ragStats.totalChunks,
                    languages: ragStats.languages,
                } : { enabled: false },
            });
        }
        // Index from GitHub/GitLab URL (API access)
        if (action === 'index-url') {
            const { owner, repo, provider } = body;
            if (!owner || !repo) {
                return server_1.NextResponse.json({ error: 'owner e repo são obrigatórios' }, { status: 400 });
            }
            // For public repos, we can clone directly
            const gitUrl = provider === 'gitlab'
                ? `https://gitlab.com/${owner}/${repo}.git`
                : `https://github.com/${owner}/${repo}.git`;
            const folderName = generateRepoFolderName(`${owner}-${repo}`);
            const clonePath = path_1.default.join(REPOS_DIR, folderName);
            try {
                await execAsync(`git clone --depth 1 "${gitUrl}" "${clonePath}"`, {
                    timeout: 120000,
                });
            }
            catch (cloneError) {
                return server_1.NextResponse.json({
                    error: `Repositório não encontrado ou privado: ${owner}/${repo}`
                }, { status: 404 });
            }
            const indexedFiles = collectFiles(clonePath);
            // RAG indexing (pgvector)
            let ragStats = null;
            if (ragEnabled) {
                try {
                    const ragIndexer = (0, rag_indexer_1.getRAGIndexer)();
                    const codeFiles = collectFilesWithContent(clonePath);
                    const repoId = folderName;
                    ragStats = await ragIndexer.indexRepo(repoId, codeFiles);
                }
                catch (ragError) {
                    console.warn('[index] RAG indexing failed:', ragError.message);
                }
            }
            return server_1.NextResponse.json({
                indexed: true,
                action: 'index-url',
                path: clonePath,
                owner,
                repo,
                provider,
                fileCount: indexedFiles.length,
                totalSize: indexedFiles.reduce((acc, f) => acc + f.size, 0),
                files: indexedFiles.slice(0, 30).map((f) => f.path),
                rag: ragStats ? {
                    enabled: true,
                    chunks: ragStats.totalChunks,
                    languages: ragStats.languages,
                } : { enabled: false },
            });
        }
        // Index local path
        if (action === 'index-local') {
            const repoPath = body.path || body.repoPath || process.env.LEGACYGUARD_REPO_PATH;
            if (!repoPath) {
                return server_1.NextResponse.json({ error: 'path é obrigatório' }, { status: 400 });
            }
            if (!fs_1.default.existsSync(repoPath)) {
                return server_1.NextResponse.json({ error: `Caminho não encontrado: ${repoPath}` }, { status: 404 });
            }
            const indexedFiles = collectFiles(repoPath);
            return server_1.NextResponse.json({
                indexed: true,
                action: 'index-local',
                path: repoPath,
                fileCount: indexedFiles.length,
                totalSize: indexedFiles.reduce((acc, f) => acc + f.size, 0),
                files: indexedFiles.slice(0, 30).map((f) => f.path),
            });
        }
        return server_1.NextResponse.json({ error: 'action inválida' }, { status: 400 });
    }
    catch (err) {
        console.error('[index] Error:', err);
        return server_1.NextResponse.json({ error: err.message || 'Erro ao indexar' }, { status: 500 });
    }
}
async function GET() {
    ensureReposDir();
    // List indexed repos
    const repos = [];
    try {
        const entries = fs_1.default.readdirSync(REPOS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const repoPath = path_1.default.join(REPOS_DIR, entry.name);
                const stat = fs_1.default.statSync(repoPath);
                repos.push({
                    name: entry.name,
                    path: repoPath,
                    indexed: stat.mtime.toISOString(),
                });
            }
        }
    }
    catch {
        // No repos yet
    }
    return server_1.NextResponse.json({
        status: 'ok',
        reposDir: REPOS_DIR,
        repos,
        actions: ['clone', 'index-url', 'index-local', 'upload'],
    });
}
