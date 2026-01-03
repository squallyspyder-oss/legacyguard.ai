import { Pool } from 'pg';
import OpenAI from 'openai';
import { CodeFile, CodeNode, extractSymbols } from './indexer';

// Config via PGVECTOR_URL (postgresql://user:pass@host:port/db)
// Requer extensão pgvector instalada no banco: CREATE EXTENSION IF NOT EXISTS vector;

type PgVectorIndexer = {
  upsertFile: (file: CodeFile) => Promise<void>;
  search: (query: string, limit?: number) => Promise<CodeNode[]>;
};

let pool: Pool | null = null;
let openai: OpenAI | null = null;

/**
 * Check if vector indexing is enabled (PGVECTOR_URL + OPENAI_API_KEY)
 */
export function isVectorIndexingEnabled(): boolean {
  return !!(process.env.PGVECTOR_URL && process.env.OPENAI_API_KEY);
}

function getPool() {
  if (!pool) {
    const url = process.env.PGVECTOR_URL;
    if (!url) throw new Error('PGVECTOR_URL não definido');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

function getOpenAI() {
  if (!openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não definido');
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

async function ensureSchema() {
  const client = getPool();
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  await client.query(`
    CREATE TABLE IF NOT EXISTS code_chunks (
      path TEXT PRIMARY KEY,
      embedding vector(1536),
      content TEXT,
      symbols TEXT[]
    )
  `);
}

async function embed(text: string): Promise<number[]> {
  const oa = getOpenAI();
  const res = await oa.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 6000),
  });
  return res.data[0].embedding;
}

function toVectorLiteral(arr: number[]) {
  return `[${arr.join(',')}]`;
}

export function createPgVectorIndexer(): PgVectorIndexer {
  return {
    async upsertFile(file: CodeFile) {
      await ensureSchema();
      const symbols = extractSymbols(file.content).slice(0, 25);
      const embedding = await embed(file.content);
      const vec = toVectorLiteral(embedding);
      await getPool().query(
        'INSERT INTO code_chunks (path, embedding, content, symbols) VALUES ($1, $2, $3, $4) ON CONFLICT (path) DO UPDATE SET embedding = EXCLUDED.embedding, content = EXCLUDED.content, symbols = EXCLUDED.symbols',
        [file.path, vec, file.content.slice(0, 4000), symbols]
      );
    },

    async search(query: string, limit = 5): Promise<CodeNode[]> {
      await ensureSchema();
      const embedding = await embed(query);
      const vec = toVectorLiteral(embedding);
      const { rows } = await getPool().query(
        'SELECT path, content, symbols, 1 - (embedding <=> $1) AS score FROM code_chunks ORDER BY embedding <=> $1 ASC LIMIT $2',
        [vec, limit]
      );
      return rows.map((r: any) => ({
        id: r.path,
        path: r.path,
        symbols: r.symbols || [],
        contentSnippet: r.content?.slice(0, 400) || '',
      }));
    },
  };
}

// Timeout helper para operações de health check
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout após ${ms}ms em: ${operation}`)), ms)
    ),
  ]);
}

/**
 * Verifica o status REAL do RAG/pgvector.
 * 
 * MANIFESTO Regra 1: Não mentir sobre status - verificar realidade.
 * 
 * @param timeoutMs - Timeout para queries (default: 5000ms)
 * @param includeDetails - Se true, retorna contagem de docs (requer auth)
 */
export async function checkRagStatus(options?: {
  timeoutMs?: number;
  includeDetails?: boolean;
}): Promise<{
  configured: boolean;
  connected: boolean;
  tableExists: boolean;
  documentCount: number;
  ready: boolean;
  error?: string;
}> {
  const { timeoutMs = 5000, includeDetails = false } = options || {};
  const url = process.env.PGVECTOR_URL;
  
  // Sem URL configurada
  if (!url) {
    return {
      configured: false,
      connected: false,
      tableExists: false,
      documentCount: 0,
      ready: false,
      error: 'PGVECTOR_URL não configurada',
    };
  }

  try {
    const client = getPool();
    
    // Testar conexão e verificar se tabela existe - COM TIMEOUT
    const tableCheck = await withTimeout(
      client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'code_chunks'
        ) AS table_exists
      `),
      timeoutMs,
      'verificar tabela'
    );
    
    const tableExists = tableCheck.rows[0]?.table_exists === true;
    
    if (!tableExists) {
      return {
        configured: true,
        connected: true,
        tableExists: false,
        documentCount: 0,
        ready: false,
        error: 'Tabela code_chunks não existe - indexação nunca executada',
      };
    }
    
    // Contar documentos - COM TIMEOUT
    // Para requests não autenticados, apenas verificar se existe >= 1
    const countQuery = includeDetails
      ? 'SELECT COUNT(*) as count FROM code_chunks'
      : 'SELECT EXISTS(SELECT 1 FROM code_chunks LIMIT 1) as has_data';
    
    const countResult = await withTimeout(
      client.query(countQuery),
      timeoutMs,
      'contar documentos'
    );
    
    let documentCount = 0;
    let ready = false;
    
    if (includeDetails) {
      documentCount = parseInt(countResult.rows[0]?.count || '0', 10);
      ready = documentCount > 0;
    } else {
      // Não expor contagem exata para requests não autenticados
      ready = countResult.rows[0]?.has_data === true;
      documentCount = ready ? -1 : 0; // -1 indica "há dados mas contagem oculta"
    }
    
    return {
      configured: true,
      connected: true,
      tableExists: true,
      documentCount,
      ready,
      error: !ready ? 'Nenhum documento indexado' : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      configured: true,
      connected: false,
      tableExists: false,
      documentCount: 0,
      ready: false,
      error: `Erro de conexão: ${message}`,
    };
  }
}

/**
 * Index a GitHub repository via API.
 * Fetches files from GitHub and indexes them into pgvector.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name  
 * @param token - GitHub token for API access
 * @returns Indexing stats
 */
export async function indexRepo(
  owner: string,
  repo: string,
  token?: string
): Promise<{
  filesIndexed: number;
  chunksCreated: number;
  skipped: number;
  errors: string[];
}> {
  if (!isVectorIndexingEnabled()) {
    throw new Error('Vector indexing not enabled - set PGVECTOR_URL and OPENAI_API_KEY');
  }
  
  const errors: string[] = [];
  let filesIndexed = 0;
  let chunksCreated = 0;
  let skipped = 0;
  
  // Extensões permitidas para indexação
  const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.c', '.cpp', '.h', '.hpp', '.md'];
  
  // Pastas ignoradas
  const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', 'vendor'];
  
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'LegacyGuard-Indexer',
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  // Buscar árvore do repositório
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });
  
  if (!treeRes.ok) {
    throw new Error(`GitHub API error: ${treeRes.status} ${treeRes.statusText}`);
  }
  
  const treeData = await treeRes.json() as { tree: Array<{ path: string; type: string; size?: number }> };
  const indexer = createPgVectorIndexer();
  
  // Filtrar e processar arquivos
  const filesToIndex = treeData.tree.filter(item => {
    if (item.type !== 'blob') return false;
    
    // Verificar extensão
    const ext = item.path.substring(item.path.lastIndexOf('.'));
    if (!allowedExts.includes(ext)) return false;
    
    // Verificar se está em diretório ignorado
    for (const ignored of ignoredDirs) {
      if (item.path.includes(`/${ignored}/`) || item.path.startsWith(`${ignored}/`)) {
        return false;
      }
    }
    
    // Limitar tamanho (50KB)
    if (item.size && item.size > 50000) return false;
    
    return true;
  });
  
  // Indexar em batches para não sobrecarregar
  const batchSize = 10;
  for (let i = 0; i < filesToIndex.length; i += batchSize) {
    const batch = filesToIndex.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (file) => {
      try {
        // Buscar conteúdo do arquivo
        const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;
        const contentRes = await fetch(contentUrl, { headers });
        
        if (!contentRes.ok) {
          skipped++;
          return;
        }
        
        const contentData = await contentRes.json() as { content?: string; encoding?: string };
        
        if (!contentData.content || contentData.encoding !== 'base64') {
          skipped++;
          return;
        }
        
        const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
        
        // Indexar arquivo
        await indexer.upsertFile({
          path: `${owner}/${repo}/${file.path}`,
          content,
        });
        
        filesIndexed++;
        chunksCreated++; // 1 chunk por arquivo nesta implementação simplificada
      } catch (err) {
        errors.push(`${file.path}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
    }));
  }
  
  return {
    filesIndexed,
    chunksCreated,
    skipped,
    errors: errors.slice(0, 10), // Limitar erros retornados
  };
}
