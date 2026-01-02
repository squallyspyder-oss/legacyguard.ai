"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRAGIndexer = createRAGIndexer;
exports.createPgVectorIndexer = createRAGIndexer;
exports.getRAGIndexer = getRAGIndexer;
const pg_1 = require("pg");
const openai_1 = __importDefault(require("openai"));
const indexer_1 = require("./indexer");
const crypto_1 = __importDefault(require("crypto"));
// ============================================================================
// Singleton instances
// ============================================================================
let pool = null;
let openai = null;
function getPool() {
    if (!pool) {
        // Usa mesma URL do audit (AUDIT_DB_URL) ou PGVECTOR_URL específica
        const url = process.env.PGVECTOR_URL || process.env.AUDIT_DB_URL;
        if (!url)
            throw new Error('PGVECTOR_URL ou AUDIT_DB_URL não definido');
        pool = new pg_1.Pool({
            connectionString: url,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
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
// ============================================================================
// Embedding helpers
// ============================================================================
async function embed(text) {
    const oa = getOpenAI();
    // Trunca para limite do modelo
    const truncated = text.slice(0, 8000);
    const res = await oa.embeddings.create({
        model: 'text-embedding-3-small',
        input: truncated,
    });
    return res.data[0].embedding;
}
function toVectorLiteral(arr) {
    return `[${arr.join(',')}]`;
}
function hashQuery(query) {
    return crypto_1.default.createHash('sha256').update(query).digest('hex').slice(0, 32);
}
// ============================================================================
// Chunking
// ============================================================================
const CHUNK_SIZE = 1500; // tokens aproximado
const CHUNK_OVERLAP = 200;
function detectLanguage(path) {
    var _a;
    const ext = ((_a = path.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    const langMap = {
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
function chunkCode(content, path) {
    const lines = content.split('\n');
    const chunks = [];
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
function createRAGIndexer() {
    return {
        async indexFile(repoId, file) {
            const client = getPool();
            const language = detectLanguage(file.path);
            const chunks = chunkCode(file.content, file.path);
            let indexed = 0;
            for (const chunk of chunks) {
                const symbols = (0, indexer_1.extractSymbols)(chunk.content).slice(0, 50);
                const embedding = await embed(chunk.content);
                const vec = toVectorLiteral(embedding);
                const metadata = {
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
        async indexRepo(repoId, files) {
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
                const languages = {};
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
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                await client.query(`
          UPDATE indexed_repos SET status = 'failed', error_message = $2 WHERE id = $1
        `, [repoId, msg]);
                throw error;
            }
        },
        async deleteRepo(repoId) {
            const client = getPool();
            await client.query('DELETE FROM code_chunks WHERE repo_id = $1', [repoId]);
            try {
                await client.query('DELETE FROM doc_chunks WHERE repo_id = $1', [repoId]);
            }
            catch (err) {
                // Ignore missing table so deleteRepo can run on deployments without doc_chunks
                if (!(err === null || err === void 0 ? void 0 : err.code) || err.code !== '42P01') {
                    throw err;
                }
            }
            await client.query('DELETE FROM indexed_repos WHERE id = $1', [repoId]);
        },
        async search(query, options = {}) {
            const { repoId, language, limit = 10, useCache = true, minScore = 0.5 } = options;
            const client = getPool();
            // Verifica cache
            const queryHash = hashQuery(query + (repoId || '') + (language || ''));
            if (useCache) {
                const cached = await client.query('SELECT results FROM query_cache WHERE query_hash = $1 AND last_used_at > NOW() - INTERVAL \'1 hour\'', [queryHash]);
                if (cached.rows.length > 0) {
                    await client.query('UPDATE query_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE query_hash = $1', [queryHash]);
                    return cached.rows[0].results;
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
            const results = rows;
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
        async searchSimilarCode(code, options = {}) {
            // Busca código similar sem usar cache
            return this.search(code, { ...options, useCache: false });
        },
        async getRepoStats(repoId) {
            const client = getPool();
            const { rows } = await client.query('SELECT * FROM indexed_repos WHERE id = $1', [repoId]);
            if (rows.length === 0)
                return null;
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
        async listRepos() {
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
        async cleanupCache(daysOld = 7) {
            var _a, _b;
            const client = getPool();
            // Only call helper function when it exists to avoid runtime errors on fresh DBs
            const { rows: fnRows } = await client.query("SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_query_cache') AS exists");
            if (!((_a = fnRows[0]) === null || _a === void 0 ? void 0 : _a.exists)) {
                return 0;
            }
            try {
                const { rows } = await client.query('SELECT cleanup_query_cache($1) as deleted', [daysOld]);
                return ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.deleted) || 0;
            }
            catch {
                return 0;
            }
        },
    };
}
// ============================================================================
// Convenience exports
// ============================================================================
let defaultIndexer = null;
function getRAGIndexer() {
    if (!defaultIndexer) {
        defaultIndexer = createRAGIndexer();
    }
    return defaultIndexer;
}
