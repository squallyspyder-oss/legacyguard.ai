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
