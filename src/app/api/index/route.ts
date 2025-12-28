import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getServerSession } from 'next-auth';
import { getRAGIndexer, type CodeFile } from '@/lib/rag-indexer';

const execAsync = promisify(exec);

// RAG indexer (pgvector)
const ragEnabled = !!(process.env.PGVECTOR_URL || process.env.AUDIT_DB_URL) && !!process.env.OPENAI_API_KEY;

const REPOS_DIR = path.join(process.cwd(), '.legacyguard', 'repos');

// Ensure repos directory exists
function ensureReposDir() {
  if (!fs.existsSync(REPOS_DIR)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
  }
}

// Collect files for indexing
function collectFiles(repoPath: string): { path: string; size: number; content?: string }[] {
  const files: { path: string; size: number; content?: string }[] = [];
  const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.md', '.json', '.yaml', '.yml'];

  function walk(dir: string, base = '') {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target'].includes(entry.name)) continue;
          walk(full, rel);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExts.includes(ext)) {
            const stat = fs.statSync(full);
            if (stat.size < 100_000) {
              files.push({ path: rel, size: stat.size });
            }
          }
        }
      }
    } catch {
      // ignore permission errors
    }
  }

  walk(repoPath);
  return files;
}

// Collect files with content for RAG indexing
function collectFilesWithContent(repoPath: string): CodeFile[] {
  const files: CodeFile[] = [];
  const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h', '.hpp'];

  function walk(dir: string, base = '') {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target'].includes(entry.name)) continue;
          walk(full, rel);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExts.includes(ext)) {
            const stat = fs.statSync(full);
            if (stat.size < 50_000) { // Smaller limit for embedding
              try {
                const content = fs.readFileSync(full, 'utf-8');
                files.push({ path: rel, content });
              } catch {
                // skip binary/unreadable files
              }
            }
          }
        }
      }
    } catch {
      // ignore permission errors
    }
  }

  walk(repoPath);
  return files;
}

// Generate unique repo folder name
function generateRepoFolderName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}

type IndexRequest = {
  action?: 'clone' | 'clone-github' | 'index-url' | 'index-local' | 'upload';
  // For clone
  gitUrl?: string;
  branch?: string;
  // For URL
  owner?: string;
  repo?: string;
  provider?: string;
  // For local
  path?: string;
  // Legacy support
  repoPath?: string;
  githubUrl?: string;
};

export async function POST(req: NextRequest) {
  try {
    ensureReposDir();
    
    const contentType = req.headers.get('content-type') || '';
    
    // Handle file upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const action = formData.get('action') as string;
      
      if (action === 'upload') {
        const files = formData.getAll('files') as File[];
        if (files.length === 0) {
          return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }

        const folderName = generateRepoFolderName('upload');
        const uploadDir = path.join(REPOS_DIR, folderName);
        fs.mkdirSync(uploadDir, { recursive: true });

        // Save uploaded files
        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const filePath = path.join(uploadDir, file.name);
          const fileDir = path.dirname(filePath);
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }
          fs.writeFileSync(filePath, buffer);
        }

        const indexedFiles = collectFiles(uploadDir);
        
        return NextResponse.json({
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
    const body: IndexRequest = await req.json().catch(() => ({}));
    const action = body.action || 'index-local';

    // Git Clone (public / generic)
    if (action === 'clone') {
      const gitUrl = body.gitUrl;
      const branch = body.branch || 'main';

      if (!gitUrl) {
        return NextResponse.json({ error: 'gitUrl é obrigatório para clone' }, { status: 400 });
      }

      // Extract repo name from URL
      const repoName = gitUrl.split('/').pop()?.replace('.git', '') || 'repo';
      const folderName = generateRepoFolderName(repoName);
      const clonePath = path.join(REPOS_DIR, folderName);

      // Clone repository
      try {
        await execAsync(`git clone --depth 1 --branch ${branch} "${gitUrl}" "${clonePath}"`, {
          timeout: 120000, // 2 min timeout
        });
      } catch (cloneError: any) {
        // Try without branch specification
        try {
          await execAsync(`git clone --depth 1 "${gitUrl}" "${clonePath}"`, {
            timeout: 120000,
          });
        } catch (fallbackError: any) {
          return NextResponse.json({ 
            error: `Erro ao clonar: ${fallbackError.message || 'Falha no git clone'}` 
          }, { status: 500 });
        }
      }

      const indexedFiles = collectFiles(clonePath);

      // RAG indexing (pgvector)
      let ragStats = null;
      if (ragEnabled) {
        try {
          const ragIndexer = getRAGIndexer();
          const codeFiles = collectFilesWithContent(clonePath);
          const repoId = folderName;
          ragStats = await ragIndexer.indexRepo(repoId, codeFiles);
        } catch (ragError: any) {
          console.warn('[index] RAG indexing failed:', ragError.message);
        }
      }

      return NextResponse.json({
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
      const session = await getServerSession();
      // @ts-ignore
      const accessToken = session?.accessToken as string | undefined;
      if (!accessToken) {
        return NextResponse.json({ error: 'Não autenticado no GitHub' }, { status: 401 });
      }

      const owner = body.owner as string | undefined;
      const repo = body.repo as string | undefined;
      const branch = body.branch || 'main';

      if (!owner || !repo) {
        return NextResponse.json({ error: 'owner e repo são obrigatórios' }, { status: 400 });
      }

      const repoName = `${owner}-${repo}`;
      const folderName = generateRepoFolderName(repoName);
      const clonePath = path.join(REPOS_DIR, folderName);

      const gitUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;

      try {
        await execAsync(`git clone --depth 1 --branch ${branch} "${gitUrl}" "${clonePath}"`, {
          timeout: 120000,
        });
      } catch (cloneError: any) {
        return NextResponse.json({
          error: cloneError?.message || 'Erro ao clonar repositório privado',
        }, { status: 500 });
      }

      const indexedFiles = collectFiles(clonePath);

      let ragStats = null;
      if (ragEnabled) {
        try {
          const ragIndexer = getRAGIndexer();
          const codeFiles = collectFilesWithContent(clonePath);
          const repoId = folderName;
          ragStats = await ragIndexer.indexRepo(repoId, codeFiles);
        } catch (ragError: any) {
          console.warn('[index] RAG indexing failed:', ragError.message);
        }
      }

      return NextResponse.json({
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
        return NextResponse.json({ error: 'owner e repo são obrigatórios' }, { status: 400 });
      }

      // For public repos, we can clone directly
      const gitUrl = provider === 'gitlab' 
        ? `https://gitlab.com/${owner}/${repo}.git`
        : `https://github.com/${owner}/${repo}.git`;

      const folderName = generateRepoFolderName(`${owner}-${repo}`);
      const clonePath = path.join(REPOS_DIR, folderName);

      try {
        await execAsync(`git clone --depth 1 "${gitUrl}" "${clonePath}"`, {
          timeout: 120000,
        });
      } catch (cloneError: any) {
        return NextResponse.json({ 
          error: `Repositório não encontrado ou privado: ${owner}/${repo}` 
        }, { status: 404 });
      }

      const indexedFiles = collectFiles(clonePath);

      // RAG indexing (pgvector)
      let ragStats = null;
      if (ragEnabled) {
        try {
          const ragIndexer = getRAGIndexer();
          const codeFiles = collectFilesWithContent(clonePath);
          const repoId = folderName;
          ragStats = await ragIndexer.indexRepo(repoId, codeFiles);
        } catch (ragError: any) {
          console.warn('[index] RAG indexing failed:', ragError.message);
        }
      }

      return NextResponse.json({
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
        return NextResponse.json({ error: 'path é obrigatório' }, { status: 400 });
      }

      if (!fs.existsSync(repoPath)) {
        return NextResponse.json({ error: `Caminho não encontrado: ${repoPath}` }, { status: 404 });
      }

      const indexedFiles = collectFiles(repoPath);

      return NextResponse.json({
        indexed: true,
        action: 'index-local',
        path: repoPath,
        fileCount: indexedFiles.length,
        totalSize: indexedFiles.reduce((acc, f) => acc + f.size, 0),
        files: indexedFiles.slice(0, 30).map((f) => f.path),
      });
    }

    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  } catch (err: any) {
    console.error('[index] Error:', err);
    return NextResponse.json({ error: err.message || 'Erro ao indexar' }, { status: 500 });
  }
}

export async function GET() {
  ensureReposDir();
  
  // List indexed repos
  const repos: { name: string; path: string; indexed: string }[] = [];
  try {
    const entries = fs.readdirSync(REPOS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const repoPath = path.join(REPOS_DIR, entry.name);
        const stat = fs.statSync(repoPath);
        repos.push({
          name: entry.name,
          path: repoPath,
          indexed: stat.mtime.toISOString(),
        });
      }
    }
  } catch {
    // No repos yet
  }

  return NextResponse.json({
    status: 'ok',
    reposDir: REPOS_DIR,
    repos,
    actions: ['clone', 'index-url', 'index-local', 'upload'],
  });
}
