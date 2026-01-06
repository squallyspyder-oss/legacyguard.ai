import { Pool, PoolClient } from 'pg';
import OpenAI from 'openai';
import ts from 'typescript';
import { extractSymbols } from './indexer';
import crypto from 'crypto';

/**
 * PGVector RAG Indexer
 * 
 * Usa Neon PostgreSQL com pgvector para busca semântica de código.
 * Suporta:
 * - Chunking inteligente de código
 * - Busca híbrida (semântica + keyword)
 * - Cache de queries
 * - Multi-repo
 */

// ============================================================================
// Types
// ============================================================================

export interface CodeFile {
  path: string;
  content: string;
}

export interface ChunkMetadata {
  functions?: string[];
  classes?: string[];
  imports?: string[];
  exports?: string[];
}

export interface CodeChunk {
  id?: number;
  repoId: string;
  path: string;
  chunkIndex: number;
  content: string;
  symbols: string[];
  language: string;
  startLine: number;
  endLine: number;
  metadata: ChunkMetadata;
}

export interface GraphNode {
  repoId: string;
  path: string;
  symbol: string;
  kind: string;
  startLine: number;
  endLine: number;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  repoId: string;
  fromPath: string;
  fromSymbol?: string;
  toPath: string;
  toSymbol?: string;
  kind: 'import' | 'call' | 'ref' | 'export';
  metadata?: Record<string, any>;
}

export interface SearchResult {
  id: number;
  repoId: string;
  path: string;
  content: string;
  symbols: string[];
  language: string;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
}

export interface IndexedRepo {
  id: string;
  name: string;
  url?: string;
  branch: string;
  totalFiles: number;
  totalChunks: number;
  languages: Record<string, number>;
  indexedAt: Date;
  status: 'pending' | 'indexing' | 'ready' | 'failed';
  errorMessage?: string;
}

export interface RAGIndexer {
  // Indexação
  indexFile: (repoId: string, file: CodeFile) => Promise<number>;
  indexRepo: (repoId: string, files: CodeFile[]) => Promise<IndexedRepo>;
  deleteRepo: (repoId: string) => Promise<void>;
  
  // Busca
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  searchSimilarCode: (code: string, options?: SearchOptions) => Promise<SearchResult[]>;
  
  // Info
  getRepoStats: (repoId: string) => Promise<IndexedRepo | null>;
  listRepos: () => Promise<IndexedRepo[]>;

  // Grafo
  getGraphNeighbors?: (
    repoId: string,
    path: string,
    options?: { limit?: number }
  ) => Promise<{ symbols: GraphNode[]; imports: GraphEdge[]; dependents: GraphEdge[] }>;
  
  // Manutenção
  cleanupCache: (daysOld?: number) => Promise<number>;
}

export interface SearchOptions {
  repoId?: string;
  language?: string;
  limit?: number;
  useCache?: boolean;
  minScore?: number;
}

// ============================================================================
// Singleton instances
// ============================================================================

let pool: Pool | null = null;
let openai: OpenAI | null = null;
const graphEnabled = ['true', '1', 'yes'].includes(`${process.env.RAG_GRAPH_ENABLED || ''}`.toLowerCase());

function getPool(): Pool {
  if (!pool) {
    // Usa mesma URL do audit (AUDIT_DB_URL) ou PGVECTOR_URL específica
    const url = process.env.PGVECTOR_URL || process.env.AUDIT_DB_URL;
    if (!url) throw new Error('PGVECTOR_URL ou AUDIT_DB_URL não definido');
    pool = new Pool({ 
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

let graphSchemaReady = false;

async function ensureGraphSchema(client: Pool | PoolClient) {
  if (graphSchemaReady || !graphEnabled) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS code_graph_nodes (
      id SERIAL PRIMARY KEY,
      repo_id TEXT NOT NULL,
      path TEXT NOT NULL,
      symbol TEXT NOT NULL,
      kind TEXT,
      start_line INT,
      end_line INT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (repo_id, path, symbol)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS code_graph_edges (
      id SERIAL PRIMARY KEY,
      repo_id TEXT NOT NULL,
      from_path TEXT NOT NULL,
      from_symbol TEXT,
      to_path TEXT NOT NULL,
      to_symbol TEXT,
      kind TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_graph_nodes_repo ON code_graph_nodes(repo_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_graph_edges_repo ON code_graph_edges(repo_id)');
  graphSchemaReady = true;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não definido');
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

// ============================================================================
// Embedding helpers
// ============================================================================

async function embed(text: string): Promise<number[]> {
  const oa = getOpenAI();
  // Trunca para limite do modelo
  const truncated = text.slice(0, 8000);
  const res = await oa.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncated,
  });
  return res.data[0].embedding;
}

function toVectorLiteral(arr: number[]): string {
  return `[${arr.join(',')}]`;
}

function hashQuery(query: string): string {
  return crypto.createHash('sha256').update(query).digest('hex').slice(0, 32);
}

// ============================================================================
// Chunking
// ============================================================================

const CHUNK_SIZE = 1500; // tokens aproximado
const CHUNK_OVERLAP = 200;

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    php: 'php',
    sql: 'sql',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext] || 'unknown';
}

type ChunkPiece = {
  content: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
  symbols?: string[];
  metadata?: ChunkMetadata;
};

// ============================================================================
// Python AST Chunking (regex-based, no external parser)
// ============================================================================

function chunkPythonByAst(content: string, filePath: string): ChunkPiece[] {
  const lines = content.split('\n');
  const chunks: ChunkPiece[] = [];
  const fileImports: string[] = [];
  let idx = 0;

  // Regex patterns for Python constructs
  const funcPattern = /^(\s*)def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
  const classPattern = /^(\s*)class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:\(]/;
  const asyncFuncPattern = /^(\s*)async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
  const importPattern = /^(?:from\s+(\S+)\s+)?import\s+(.+)/;

  let currentBlock: { startLine: number; indent: number; symbol: string; kind: string; lines: string[] } | null = null;

  function flushBlock() {
    if (currentBlock && currentBlock.lines.length > 0) {
      chunks.push({
        content: currentBlock.lines.join('\n').trim(),
        startLine: currentBlock.startLine,
        endLine: currentBlock.startLine + currentBlock.lines.length - 1,
        chunkIndex: idx++,
        symbols: [currentBlock.symbol],
        metadata: {
          functions: currentBlock.kind === 'function' ? [currentBlock.symbol] : [],
          classes: currentBlock.kind === 'class' ? [currentBlock.symbol] : [],
          imports: fileImports,
        },
      });
    }
    currentBlock = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Extract imports
    const importMatch = line.match(importPattern);
    if (importMatch) {
      const module = importMatch[1] || importMatch[2].split(',')[0].trim().split(' ')[0];
      if (module && !module.startsWith('(')) fileImports.push(module);
    }

    // Check for new function/class definition
    const funcMatch = line.match(funcPattern) || line.match(asyncFuncPattern);
    const classMatch = line.match(classPattern);

    if (funcMatch || classMatch) {
      flushBlock();
      const match = funcMatch || classMatch;
      const indent = (match![1] || '').length;
      const symbol = match![2];
      const kind = classMatch ? 'class' : 'function';
      currentBlock = { startLine: lineNum, indent, symbol, kind, lines: [line] };
    } else if (currentBlock) {
      // Continue current block if indentation is greater or line is empty/comment
      const lineIndent = line.match(/^(\s*)/)?.[1].length || 0;
      const isEmptyOrComment = /^\s*(#.*)?$/.test(line);
      
      if (isEmptyOrComment || lineIndent > currentBlock.indent || (lineIndent === currentBlock.indent && line.trim() === '')) {
        currentBlock.lines.push(line);
      } else {
        flushBlock();
      }
    }
  }

  flushBlock();
  return chunks;
}

// ============================================================================
// Go AST Chunking (regex-based, no external parser)
// ============================================================================

function chunkGoByAst(content: string, filePath: string): ChunkPiece[] {
  const lines = content.split('\n');
  const chunks: ChunkPiece[] = [];
  const fileImports: string[] = [];
  let idx = 0;

  // Regex patterns for Go constructs
  const funcPattern = /^func\s+(?:\([^)]+\)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
  const methodPattern = /^func\s+\(([^)]+)\)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
  const typePattern = /^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:struct|interface)\s*\{/;
  const importPattern = /^\s*"([^"]+)"/;
  const importBlockStart = /^import\s*\(/;
  const importBlockEnd = /^\s*\)/;

  let currentBlock: { startLine: number; symbol: string; kind: string; lines: string[]; braceCount: number } | null = null;
  let inImportBlock = false;

  function flushBlock() {
    if (currentBlock && currentBlock.lines.length > 0) {
      chunks.push({
        content: currentBlock.lines.join('\n').trim(),
        startLine: currentBlock.startLine,
        endLine: currentBlock.startLine + currentBlock.lines.length - 1,
        chunkIndex: idx++,
        symbols: [currentBlock.symbol],
        metadata: {
          functions: currentBlock.kind === 'function' ? [currentBlock.symbol] : [],
          classes: currentBlock.kind === 'type' ? [currentBlock.symbol] : [],
          imports: fileImports,
        },
      });
    }
    currentBlock = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Handle import blocks
    if (importBlockStart.test(line)) {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock) {
      if (importBlockEnd.test(line)) {
        inImportBlock = false;
      } else {
        const importMatch = line.match(importPattern);
        if (importMatch) fileImports.push(importMatch[1]);
      }
      continue;
    }

    // Single-line import
    if (line.match(/^import\s+"([^"]+)"/)) {
      const match = line.match(/^import\s+"([^"]+)"/);
      if (match) fileImports.push(match[1]);
      continue;
    }

    // Check for new function/type definition
    const funcMatch = line.match(funcPattern);
    const methodMatch = line.match(methodPattern);
    const typeMatch = line.match(typePattern);

    if (funcMatch || methodMatch || typeMatch) {
      flushBlock();
      const symbol = funcMatch?.[1] || methodMatch?.[2] || typeMatch?.[1] || 'unknown';
      const kind = typeMatch ? 'type' : 'function';
      const braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      currentBlock = { startLine: lineNum, symbol, kind, lines: [line], braceCount };
    } else if (currentBlock) {
      currentBlock.lines.push(line);
      currentBlock.braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      
      // Block ends when braces balance
      if (currentBlock.braceCount <= 0) {
        flushBlock();
      }
    }
  }

  flushBlock();
  return chunks;
}

function scriptKindFromPath(path: string): ts.ScriptKind {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
      return ts.ScriptKind.TS;
    case 'tsx':
      return ts.ScriptKind.TSX;
    case 'js':
      return ts.ScriptKind.JS;
    case 'jsx':
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.Unknown;
  }
}

function chunkByAst(content: string, path: string): ChunkPiece[] {
  try {
    const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKindFromPath(path));
    const chunks: ChunkPiece[] = [];
    const fileImports: string[] = [];
    const fileExports: string[] = [];
    let idx = 0;

    function pushNode(node: ts.Node, symbol: string, kind: string) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      const nodeText = content.slice(node.getStart(), node.getEnd());
      chunks.push({
        content: nodeText.trim(),
        startLine: start.line + 1,
        endLine: end.line + 1,
        chunkIndex: idx++,
        symbols: [symbol],
        metadata: { functions: kind === 'function' ? [symbol] : [], classes: kind === 'class' ? [symbol] : [] },
      });
    }

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;
        fileImports.push(moduleName);
      }

      if (ts.isExportDeclaration(node)) {
        const moduleName = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : undefined;
        if (moduleName) fileExports.push(moduleName);
      }

      if (ts.isFunctionDeclaration(node) && node.name?.text) {
        pushNode(node, node.name.text, 'function');
      } else if (ts.isClassDeclaration(node) && node.name?.text) {
        pushNode(node, node.name.text, 'class');
      } else if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((decl) => {
          if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            pushNode(decl, decl.name.text, 'function');
          }
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return chunks.map((c) => ({
      ...c,
      metadata: {
        ...(c.metadata || {}),
        imports: fileImports,
        exports: fileExports,
      },
    }));
  } catch (err) {
    console.warn('[rag-indexer] AST chunking failed, falling back:', (err as Error).message);
    return [];
  }
}

function chunkByLines(content: string, path: string): ChunkPiece[] {
  const lines = content.split('\n');
  const chunks: ChunkPiece[] = [];
  
  // Estimativa: ~4 chars por token
  const charsPerChunk = CHUNK_SIZE * 4;
  const overlapChars = CHUNK_OVERLAP * 4;
  
  let currentChunk = '';
  let startLine = 1;
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunk += line + '\n';
    
    // Chunk cheio ou última linha
    if (currentChunk.length >= charsPerChunk || i === lines.length - 1) {
      chunks.push({
        content: currentChunk.trim(),
        startLine,
        endLine: i + 1,
        chunkIndex,
      });
      
      // Overlap: mantém últimas linhas
      if (i < lines.length - 1) {
        const overlapLines = Math.ceil(overlapChars / 80); // ~80 chars/linha
        const overlapStart = Math.max(0, i - overlapLines);
        currentChunk = lines.slice(overlapStart, i + 1).join('\n') + '\n';
        startLine = overlapStart + 1;
        chunkIndex++;
      }
    }
  }
  
  return chunks;
}

function smartChunk(content: string, filePath: string): ChunkPiece[] {
  const lang = detectLanguage(filePath);
  
  // Try language-specific AST chunking first
  let astChunks: ChunkPiece[] = [];
  
  if (lang === 'typescript' || lang === 'javascript') {
    astChunks = chunkByAst(content, filePath);
  } else if (lang === 'python') {
    astChunks = chunkPythonByAst(content, filePath);
  } else if (lang === 'go') {
    astChunks = chunkGoByAst(content, filePath);
  }
  
  // Fall back to line-based chunking if AST parsing yields nothing
  if (astChunks.length > 0) {
    console.log(`[rag-indexer] AST chunking for ${lang}: ${astChunks.length} chunks from ${filePath}`);
    return astChunks;
  }
  
  return chunkByLines(content, filePath);
}

// ============================================================================
// RAG Indexer implementation
// ============================================================================

export function createRAGIndexer(): RAGIndexer {
  return {
    async indexFile(repoId: string, file: CodeFile): Promise<number> {
      const client = getPool();
      const language = detectLanguage(file.path);
      const chunks = smartChunk(file.content, file.path);
      
      let indexed = 0;
      
      for (const chunk of chunks) {
        const symbols = (chunk.symbols || extractSymbols(chunk.content)).slice(0, 50);
        const embedding = await embed(chunk.content);
        const vec = toVectorLiteral(embedding);
        
        const metadata: ChunkMetadata = {
          functions: chunk.metadata?.functions || symbols.filter(s => !s.includes('.')),
          classes: chunk.metadata?.classes || symbols.filter(s => s[0] === s[0].toUpperCase()),
          imports: chunk.metadata?.imports,
          exports: chunk.metadata?.exports,
        };
        
        await client.query(`
          INSERT INTO code_chunks (repo_id, path, chunk_index, embedding, content, symbols, language, start_line, end_line, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (repo_id, path, chunk_index) DO UPDATE SET
            embedding = EXCLUDED.embedding,
            content = EXCLUDED.content,
            symbols = EXCLUDED.symbols,
            language = EXCLUDED.language,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `, [
          repoId,
          file.path,
          chunk.chunkIndex,
          vec,
          chunk.content.slice(0, 10000),
          symbols,
          language,
          chunk.startLine,
          chunk.endLine,
          JSON.stringify(metadata),
        ]);
        
        indexed++;
      }

      if (graphEnabled) {
        try {
          const astGraph = buildGraphFromAst(file.path, file.content, repoId);
          await persistGraph(repoId, file.path, astGraph.nodes, astGraph.edges);
        } catch (err: any) {
          console.warn('[rag-indexer] Failed to persist graph:', err?.message || err);
        }
      }
      
      return indexed;
    },
    
    async indexRepo(repoId: string, files: CodeFile[]): Promise<IndexedRepo> {
      const client = getPool();
      
      // Marca como indexando
      await client.query(`
        INSERT INTO indexed_repos (id, name, status)
        VALUES ($1, $2, 'indexing')
        ON CONFLICT (id) DO UPDATE SET status = 'indexing', indexed_at = NOW()
      `, [repoId, repoId]);
      
      try {
        // Remove chunks antigos
        await client.query('DELETE FROM code_chunks WHERE repo_id = $1', [repoId]);
        if (graphEnabled) {
          await ensureGraphSchema(client);
          await client.query('DELETE FROM code_graph_nodes WHERE repo_id = $1', [repoId]);
          await client.query('DELETE FROM code_graph_edges WHERE repo_id = $1', [repoId]);
        }
        
        let totalChunks = 0;
        const languages: Record<string, number> = {};
        
        for (const file of files) {
          const lang = detectLanguage(file.path);
          languages[lang] = (languages[lang] || 0) + 1;
          
          const chunksIndexed = await this.indexFile(repoId, file);
          totalChunks += chunksIndexed;
        }
        
        // Atualiza status
        await client.query(`
          UPDATE indexed_repos SET
            total_files = $2,
            total_chunks = $3,
            languages = $4,
            status = 'ready',
            error_message = NULL
          WHERE id = $1
        `, [repoId, files.length, totalChunks, JSON.stringify(languages)]);
        
        return {
          id: repoId,
          name: repoId,
          branch: 'main',
          totalFiles: files.length,
          totalChunks,
          languages,
          indexedAt: new Date(),
          status: 'ready',
        };
        
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await client.query(`
          UPDATE indexed_repos SET status = 'failed', error_message = $2 WHERE id = $1
        `, [repoId, msg]);
        throw error;
      }
    },
    
    async deleteRepo(repoId: string): Promise<void> {
      const client = getPool();
      await client.query('DELETE FROM code_chunks WHERE repo_id = $1', [repoId]);
      try {
        await client.query('DELETE FROM doc_chunks WHERE repo_id = $1', [repoId]);
      } catch (err: any) {
        // Ignore missing table so deleteRepo can run on deployments without doc_chunks
        if (!err?.code || err.code !== '42P01') {
          throw err;
        }
      }
      await client.query('DELETE FROM indexed_repos WHERE id = $1', [repoId]);
    },
    
    async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
      const { repoId, language, limit = 10, useCache = true, minScore = 0.5 } = options;
      const client = getPool();
      
      // Verifica cache
      const queryHash = hashQuery(query + (repoId || '') + (language || ''));
      
      if (useCache) {
        const cached = await client.query(
          'SELECT results FROM query_cache WHERE query_hash = $1 AND last_used_at > NOW() - INTERVAL \'1 hour\'',
          [queryHash]
        );
        
        if (cached.rows.length > 0) {
          await client.query(
            'UPDATE query_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE query_hash = $1',
            [queryHash]
          );
          return cached.rows[0].results as SearchResult[];
        }
      }
      
      // Gera embedding
      const embedding = await embed(query);
      const vec = toVectorLiteral(embedding);
      
      // Busca híbrida usando função SQL
      const { rows } = await client.query(`
        SELECT 
          c.id,
          c.repo_id as "repoId",
          c.path,
          c.content,
          c.symbols,
          c.language,
          1 - (c.embedding <=> $1) AS "semanticScore",
          CASE WHEN c.content ILIKE '%' || $4 || '%' THEN 0.2 ELSE 0.0 END AS "keywordScore",
          (1 - (c.embedding <=> $1)) + CASE WHEN c.content ILIKE '%' || $4 || '%' THEN 0.2 ELSE 0.0 END AS "combinedScore"
        FROM code_chunks c
        WHERE 
          ($2::TEXT IS NULL OR c.repo_id = $2)
          AND ($3::TEXT IS NULL OR c.language = $3)
          AND (1 - (c.embedding <=> $1)) >= $5
        ORDER BY c.embedding <=> $1 ASC
        LIMIT $6
      `, [vec, repoId || null, language || null, query, minScore, limit]);
      
      const results = rows as SearchResult[];
      
      // Cache resultado
      if (useCache && results.length > 0) {
        await client.query(`
          INSERT INTO query_cache (query_hash, query_text, embedding, results)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (query_hash) DO UPDATE SET
            results = EXCLUDED.results,
            hit_count = query_cache.hit_count + 1,
            last_used_at = NOW()
        `, [queryHash, query, vec, JSON.stringify(results)]);
      }
      
      return results;
    },
    
    async searchSimilarCode(code: string, options: SearchOptions = {}): Promise<SearchResult[]> {
      // Busca código similar sem usar cache
      return this.search(code, { ...options, useCache: false });
    },
    
    async getRepoStats(repoId: string): Promise<IndexedRepo | null> {
      const client = getPool();
      const { rows } = await client.query(
        'SELECT * FROM indexed_repos WHERE id = $1',
        [repoId]
      );
      
      if (rows.length === 0) return null;
      
      const row = rows[0];
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        branch: row.branch,
        totalFiles: row.total_files,
        totalChunks: row.total_chunks,
        languages: row.languages,
        indexedAt: row.indexed_at,
        status: row.status,
        errorMessage: row.error_message,
      };
    },
    
    async listRepos(): Promise<IndexedRepo[]> {
      const client = getPool();
      const { rows } = await client.query('SELECT * FROM indexed_repos ORDER BY indexed_at DESC');
      
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        url: row.url,
        branch: row.branch,
        totalFiles: row.total_files,
        totalChunks: row.total_chunks,
        languages: row.languages,
        indexedAt: row.indexed_at,
        status: row.status,
        errorMessage: row.error_message,
      }));
    },
    
    async cleanupCache(daysOld = 7): Promise<number> {
      const client = getPool();

      // Only call helper function when it exists to avoid runtime errors on fresh DBs
      const { rows: fnRows } = await client.query(
        "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_query_cache') AS exists"
      );
      if (!fnRows[0]?.exists) {
        return 0;
      }

      try {
        const { rows } = await client.query(
          'SELECT cleanup_query_cache($1) as deleted',
          [daysOld]
        );
        return rows[0]?.deleted || 0;
      } catch {
        return 0;
      }
    },

    async getGraphNeighbors(repoId: string, path: string, options?: { limit?: number }) {
      if (!graphEnabled) {
        return { symbols: [], imports: [], dependents: [] };
      }
      const client = getPool();
      await ensureGraphSchema(client);
      const limit = options?.limit || 5;

      const { rows: symbolRows } = await client.query(
        'SELECT symbol, kind, start_line, end_line, metadata FROM code_graph_nodes WHERE repo_id = $1 AND path = $2 LIMIT $3',
        [repoId, path, limit]
      );

      const { rows: importRows } = await client.query(
        'SELECT from_path, from_symbol, to_path, to_symbol, kind, metadata FROM code_graph_edges WHERE repo_id = $1 AND from_path = $2 LIMIT $3',
        [repoId, path, limit]
      );

      const { rows: dependentRows } = await client.query(
        'SELECT from_path, from_symbol, to_path, to_symbol, kind, metadata FROM code_graph_edges WHERE repo_id = $1 AND to_path = $2 LIMIT $3',
        [repoId, path, limit]
      );

      return {
        symbols: symbolRows.map((r: any) => ({
          repoId,
          path,
          symbol: r.symbol,
          kind: r.kind,
          startLine: r.start_line,
          endLine: r.end_line,
          metadata: r.metadata || {},
        })),
        imports: importRows.map((r: any) => ({
          repoId,
          fromPath: r.from_path,
          fromSymbol: r.from_symbol,
          toPath: r.to_path,
          toSymbol: r.to_symbol,
          kind: r.kind,
          metadata: r.metadata || {},
        })),
        dependents: dependentRows.map((r: any) => ({
          repoId,
          fromPath: r.from_path,
          fromSymbol: r.from_symbol,
          toPath: r.to_path,
          toSymbol: r.to_symbol,
          kind: r.kind,
          metadata: r.metadata || {},
        })),
      };
    },
  };
}

// ============================================================================
// Convenience exports
// ============================================================================

let defaultIndexer: RAGIndexer | null = null;

export function getRAGIndexer(): RAGIndexer {
  if (!defaultIndexer) {
    defaultIndexer = createRAGIndexer();
  }
  return defaultIndexer;
}

// Re-export for compatibility
export { createRAGIndexer as createPgVectorIndexer };

// ============================================================================
// Graph helpers (AST)
// ============================================================================

function buildGraphFromAst(path: string, content: string, repoId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  try {
    const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKindFromPath(path));

    const addNode = (symbol: string, kind: string, node: ts.Node) => {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      nodes.push({
        repoId,
        path,
        symbol,
        kind,
        startLine: start.line + 1,
        endLine: end.line + 1,
        metadata: {},
      });
    };

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;
        edges.push({ repoId, fromPath: path, toPath: moduleName, kind: 'import' });
      }

      if (ts.isFunctionDeclaration(node) && node.name?.text) {
        addNode(node.name.text, 'function', node);
      }

      if (ts.isClassDeclaration(node) && node.name?.text) {
        addNode(node.name.text, 'class', node);
      }

      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((decl) => {
          if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            addNode(decl.name.text, 'function', decl);
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  } catch (err) {
    console.warn('[rag-indexer] buildGraphFromAst failed:', (err as Error).message);
  }

  return { nodes, edges };
}

async function persistGraph(repoId: string, path: string, nodes: GraphNode[], edges: GraphEdge[]) {
  if (!graphEnabled) return;
  const client = getPool();
  await ensureGraphSchema(client);

  await client.query('DELETE FROM code_graph_nodes WHERE repo_id = $1 AND path = $2', [repoId, path]);
  await client.query('DELETE FROM code_graph_edges WHERE repo_id = $1 AND from_path = $2', [repoId, path]);

  if (nodes.length > 0) {
    const params: any[] = [];
    const placeholders = nodes
      .map((n, i) => {
        const offset = i * 7;
        params.push(n.repoId, n.path, n.symbol, n.kind, n.startLine, n.endLine, n.metadata || {});
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
      })
      .join(',');

    await client.query(
      `INSERT INTO code_graph_nodes (repo_id, path, symbol, kind, start_line, end_line, metadata)
       VALUES ${placeholders}
       ON CONFLICT (repo_id, path, symbol) DO UPDATE SET
         kind = EXCLUDED.kind,
         start_line = EXCLUDED.start_line,
         end_line = EXCLUDED.end_line,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      params
    );
  }

  if (edges.length > 0) {
    const params: any[] = [];
    const placeholders = edges
      .map((e, i) => {
        const offset = i * 7;
        params.push(e.repoId, e.fromPath, e.fromSymbol || null, e.toPath, e.toSymbol || null, e.kind, e.metadata || {});
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
      })
      .join(',');

    await client.query(
      `INSERT INTO code_graph_edges (repo_id, from_path, from_symbol, to_path, to_symbol, kind, metadata)
       VALUES ${placeholders}`,
      params
    );
  }
}
