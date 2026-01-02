"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPgVectorIndexer = createPgVectorIndexer;
const pg_1 = require("pg");
const openai_1 = __importDefault(require("openai"));
const indexer_1 = require("./indexer");
let pool = null;
let openai = null;
function getPool() {
    if (!pool) {
        const url = process.env.PGVECTOR_URL;
        if (!url)
            throw new Error('PGVECTOR_URL não definido');
        pool = new pg_1.Pool({ connectionString: url });
    }
    return pool;
}
function getOpenAI() {
    if (!openai) {
        const key = process.env.OPENAI_API_KEY;
        if (!key)
            throw new Error('OPENAI_API_KEY não definido');
        openai = new openai_1.default({ apiKey: key });
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
async function embed(text) {
    const oa = getOpenAI();
    const res = await oa.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.slice(0, 6000),
    });
    return res.data[0].embedding;
}
function toVectorLiteral(arr) {
    return `[${arr.join(',')}]`;
}
function createPgVectorIndexer() {
    return {
        async upsertFile(file) {
            await ensureSchema();
            const symbols = (0, indexer_1.extractSymbols)(file.content).slice(0, 25);
            const embedding = await embed(file.content);
            const vec = toVectorLiteral(embedding);
            await getPool().query('INSERT INTO code_chunks (path, embedding, content, symbols) VALUES ($1, $2, $3, $4) ON CONFLICT (path) DO UPDATE SET embedding = EXCLUDED.embedding, content = EXCLUDED.content, symbols = EXCLUDED.symbols', [file.path, vec, file.content.slice(0, 4000), symbols]);
        },
        async search(query, limit = 5) {
            await ensureSchema();
            const embedding = await embed(query);
            const vec = toVectorLiteral(embedding);
            const { rows } = await getPool().query('SELECT path, content, symbols, 1 - (embedding <=> $1) AS score FROM code_chunks ORDER BY embedding <=> $1 ASC LIMIT $2', [vec, limit]);
            return rows.map((r) => {
                var _a;
                return ({
                    id: r.path,
                    path: r.path,
                    symbols: r.symbols || [],
                    contentSnippet: ((_a = r.content) === null || _a === void 0 ? void 0 : _a.slice(0, 400)) || '',
                });
            });
        },
    };
}
