import { NextRequest, NextResponse } from 'next/server';
import { getRAGIndexer } from '@/lib/rag-indexer';
import fs from 'fs';
import path from 'path';

const REPOS_DIR = path.join(process.cwd(), '.legacyguard', 'repos');

/**
 * GET /api/repo/context?repoId=xxx
 * 
 * Retorna contexto do repositório para os agentes:
 * - Resumo do repo (arquivos, linguagens, etc)
 * - Estrutura de diretórios
 * - Arquivos principais identificados
 * - Status do RAG indexing
 */
export async function GET(req: NextRequest) {
  const repoId = req.nextUrl.searchParams.get('repoId');
  
  if (!repoId) {
    return NextResponse.json({ error: 'repoId é obrigatório' }, { status: 400 });
  }
  
  try {
    // Buscar path do repo
    const repoPath = path.join(REPOS_DIR, repoId);
    
    if (!fs.existsSync(repoPath)) {
      // Tentar encontrar por nome parcial
      const dirs = fs.readdirSync(REPOS_DIR);
      const match = dirs.find(d => d.includes(repoId) || repoId.includes(d));
      if (!match) {
        return NextResponse.json({ error: 'Repositório não encontrado' }, { status: 404 });
      }
    }
    
    const actualPath = fs.existsSync(repoPath) 
      ? repoPath 
      : path.join(REPOS_DIR, fs.readdirSync(REPOS_DIR).find(d => d.includes(repoId) || repoId.includes(d))!);
    
    // Coletar informações do repo
    const structure = collectStructure(actualPath, 3); // 3 níveis de profundidade
    const stats = collectStats(actualPath);
    const mainFiles = identifyMainFiles(actualPath);
    
    // Buscar status do RAG
    let ragStatus = { indexed: false, chunks: 0 };
    try {
      const ragIndexer = getRAGIndexer();
      const search = await ragIndexer.search('main entry point', { repoId, limit: 1 });
      ragStatus = { indexed: search.length > 0, chunks: search.length };
    } catch {
      // RAG não disponível
    }
    
    // Construir contexto para agentes
    const context = {
      repoId,
      path: actualPath,
      stats,
      structure,
      mainFiles,
      ragStatus,
      summary: buildSummary(stats, mainFiles),
    };
    
    return NextResponse.json(context);
  } catch (error: any) {
    console.error('[repo/context] Erro:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Coletar estrutura de diretórios
function collectStructure(dir: string, maxDepth: number, currentDepth = 0): string[] {
  if (currentDepth >= maxDepth) return [];
  
  const result: string[] = [];
  const indent = '  '.repeat(currentDepth);
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', '.legacyguard'];
    
    for (const entry of entries.slice(0, 30)) { // Limitar a 30 entries por nível
      if (ignoreDirs.includes(entry.name)) continue;
      if (entry.name.startsWith('.') && currentDepth === 0) continue;
      
      if (entry.isDirectory()) {
        result.push(`${indent}📁 ${entry.name}/`);
        result.push(...collectStructure(path.join(dir, entry.name), maxDepth, currentDepth + 1));
      } else {
        result.push(`${indent}📄 ${entry.name}`);
      }
    }
  } catch {
    // ignore
  }
  
  return result;
}

// Coletar estatísticas
function collectStats(dir: string): { files: number; dirs: number; languages: Record<string, number>; totalSize: number } {
  const stats = { files: 0, dirs: 0, languages: {} as Record<string, number>, totalSize: 0 };
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target'];
  
  const extToLang: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby',
    '.php': 'PHP', '.c': 'C', '.cpp': 'C++', '.cs': 'C#', '.swift': 'Swift',
    '.kt': 'Kotlin', '.scala': 'Scala', '.sql': 'SQL', '.md': 'Markdown',
  };
  
  function walk(d: string) {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (ignoreDirs.includes(entry.name)) continue;
        
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          stats.dirs++;
          walk(full);
        } else {
          stats.files++;
          try {
            const s = fs.statSync(full);
            stats.totalSize += s.size;
          } catch {}
          
          const ext = path.extname(entry.name).toLowerCase();
          const lang = extToLang[ext];
          if (lang) {
            stats.languages[lang] = (stats.languages[lang] || 0) + 1;
          }
        }
      }
    } catch {}
  }
  
  walk(dir);
  return stats;
}

// Identificar arquivos principais
function identifyMainFiles(dir: string): string[] {
  const mainFiles: string[] = [];
  const important = [
    'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
    'README.md', 'README', 'index.ts', 'index.js', 'main.ts', 'main.py', 'app.ts', 'app.py',
    'Dockerfile', 'docker-compose.yml', '.env.example', 'tsconfig.json',
  ];
  
  function walk(d: string, depth = 0) {
    if (depth > 2) return;
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
        
        const full = path.join(d, entry.name);
        const rel = path.relative(dir, full);
        
        if (entry.isFile() && important.includes(entry.name)) {
          mainFiles.push(rel);
        } else if (entry.isDirectory() && depth < 2) {
          walk(full, depth + 1);
        }
      }
    } catch {}
  }
  
  walk(dir);
  return mainFiles.slice(0, 10);
}

// Construir resumo
function buildSummary(stats: ReturnType<typeof collectStats>, mainFiles: string[]): string {
  const langs = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang, count]) => `${lang} (${count})`)
    .join(', ');
  
  const sizeKB = Math.round(stats.totalSize / 1024);
  
  return `Repositório com ${stats.files} arquivos em ${stats.dirs} diretórios. ` +
    `Linguagens: ${langs || 'N/A'}. ` +
    `Tamanho: ${sizeKB > 1024 ? `${(sizeKB/1024).toFixed(1)}MB` : `${sizeKB}KB`}. ` +
    `Arquivos principais: ${mainFiles.slice(0, 5).join(', ') || 'N/A'}.`;
}
