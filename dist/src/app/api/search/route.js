"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
const server_1 = require("next/server");
const rag_indexer_1 = require("@/lib/rag-indexer");
/**
 * API para busca semântica com RAG (pgvector)
 *
 * GET /api/search?q=query&repo=repoId&lang=typescript&limit=10
 * POST /api/search { query, repoId, language, limit, code }
 */
const ragEnabled = !!(process.env.PGVECTOR_URL || process.env.AUDIT_DB_URL) && !!process.env.OPENAI_API_KEY;
async function GET(req) {
    if (!ragEnabled) {
        return server_1.NextResponse.json({
            error: 'RAG não habilitado. Configure AUDIT_DB_URL/PGVECTOR_URL e OPENAI_API_KEY.',
            enabled: false,
        }, { status: 503 });
    }
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || searchParams.get('query');
    const repoId = searchParams.get('repo') || searchParams.get('repoId') || undefined;
    const language = searchParams.get('lang') || searchParams.get('language') || undefined;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const minScore = parseFloat(searchParams.get('minScore') || '0.5');
    if (!query) {
        return server_1.NextResponse.json({ error: 'Parâmetro q (query) é obrigatório' }, { status: 400 });
    }
    try {
        const indexer = (0, rag_indexer_1.getRAGIndexer)();
        const results = await indexer.search(query, {
            repoId,
            language,
            limit,
            minScore,
            useCache: true,
        });
        return server_1.NextResponse.json({
            query,
            filters: { repoId, language, limit, minScore },
            count: results.length,
            results: results.map(r => {
                var _a;
                return ({
                    path: r.path,
                    repoId: r.repoId,
                    language: r.language,
                    snippet: r.content.slice(0, 500),
                    symbols: (_a = r.symbols) === null || _a === void 0 ? void 0 : _a.slice(0, 10),
                    score: {
                        semantic: r.semanticScore.toFixed(3),
                        keyword: r.keywordScore.toFixed(3),
                        combined: r.combinedScore.toFixed(3),
                    },
                });
            }),
        });
    }
    catch (error) {
        console.error('[search] Error:', error);
        return server_1.NextResponse.json({ error: error.message || 'Erro na busca' }, { status: 500 });
    }
}
async function POST(req) {
    if (!ragEnabled) {
        return server_1.NextResponse.json({
            error: 'RAG não habilitado. Configure AUDIT_DB_URL/PGVECTOR_URL e OPENAI_API_KEY.',
            enabled: false,
        }, { status: 503 });
    }
    try {
        const body = await req.json();
        const { query, code, repoId, language, limit = 10, minScore = 0.5 } = body;
        if (!query && !code) {
            return server_1.NextResponse.json({ error: 'query ou code é obrigatório' }, { status: 400 });
        }
        const indexer = (0, rag_indexer_1.getRAGIndexer)();
        // Se code fornecido, busca código similar
        const results = code
            ? await indexer.searchSimilarCode(code, { repoId, language, limit, minScore })
            : await indexer.search(query, { repoId, language, limit, minScore, useCache: true });
        return server_1.NextResponse.json({
            query: query || '[similar code]',
            mode: code ? 'similar-code' : 'semantic',
            filters: { repoId, language, limit, minScore },
            count: results.length,
            results: results.map(r => ({
                id: r.id,
                path: r.path,
                repoId: r.repoId,
                language: r.language,
                content: r.content,
                symbols: r.symbols,
                score: {
                    semantic: r.semanticScore,
                    keyword: r.keywordScore,
                    combined: r.combinedScore,
                },
            })),
        });
    }
    catch (error) {
        console.error('[search] Error:', error);
        return server_1.NextResponse.json({ error: error.message || 'Erro na busca' }, { status: 500 });
    }
}
