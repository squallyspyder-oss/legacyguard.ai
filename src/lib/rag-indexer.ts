import { Pool, PoolClient } from 'pg';
import OpenAI from 'openai';
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

function chunkCode(content: string, path: string): Array<{
  content: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
}> {
  const lines = content.split('\n');
  const chunks: Array<{
    content: string;
    startLine: number;
    endLine: number;
    chunkIndex: number;
  }> = [];
  
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

// ============================================================================
// RAG Indexer implementation
// ============================================================================

export function createRAGIndexer(): RAGIndexer {
  return {
    async indexFile(repoId: string, file: CodeFile): Promise<number> {
      const client = getPool();
      const language = detectLanguage(file.path);
      const chunks = chunkCode(file.content, file.path);
      
      let indexed = 0;
      
      for (const chunk of chunks) {
        const symbols = extractSymbols(chunk.content).slice(0, 50);
        const embedding = await embed(chunk.content);
        const vec = toVectorLiteral(embedding);
        
        const metadata: ChunkMetadata = {
          functions: symbols.filter(s => !s.includes('.')),
          classes: symbols.filter(s => s[0] === s[0].toUpperCase()),
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
      await client.query('DELETE FROM doc_chunks WHERE repo_id = $1', [repoId]);
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
      const { rows } = await client.query(
        'SELECT cleanup_query_cache($1) as deleted',
        [daysOld]
      );
      return rows[0]?.deleted || 0;
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
