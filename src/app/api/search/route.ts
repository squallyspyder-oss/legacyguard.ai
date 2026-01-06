import { NextRequest, NextResponse } from 'next/server';
import { getRAGIndexer } from '@/lib/rag-indexer';
import { rerank, isRerankerEnabled, type GraphContext } from '@/lib/reranker';

/**
 * API para busca semântica com RAG (pgvector)
 * 
 * GET /api/search?q=query&repo=repoId&lang=typescript&limit=10&rerank=true
 * POST /api/search { query, repoId, language, limit, code, rerank }
 */

const ragEnabled = !!(process.env.PGVECTOR_URL || process.env.AUDIT_DB_URL) && !!process.env.OPENAI_API_KEY;

export async function GET(req: NextRequest) {
  if (!ragEnabled) {
    return NextResponse.json({ 
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
  const graphFlag = (searchParams.get('graph') || searchParams.get('withGraph') || '').toLowerCase();
  const withGraph = ['true', '1', 'yes'].includes(graphFlag);
  const rerankFlag = (searchParams.get('rerank') || '').toLowerCase();
  const shouldRerank = rerankFlag ? ['true', '1', 'yes'].includes(rerankFlag) : isRerankerEnabled();

  if (!query) {
    return NextResponse.json({ error: 'Parâmetro q (query) é obrigatório' }, { status: 400 });
  }

  try {
    const indexer = getRAGIndexer();
    // Fetch more results if reranking (reranker will trim to topK)
    const fetchLimit = shouldRerank ? Math.max(limit * 2, 20) : limit;
    
    const results = await indexer.search(query, {
      repoId,
      language,
      limit: fetchLimit,
      minScore,
      useCache: true,
    });

    // Build graph context for both graph display and reranker
    const graphContextMap = new Map<string, GraphContext>();
    let graphContext: Record<string, any> = {};
    
    if ((withGraph || shouldRerank) && indexer.getGraphNeighbors) {
      const topForGraph = results.slice(0, Math.min(10, results.length));
      const neighbors = await Promise.all(
        topForGraph.map(async (r) => ({
          path: r.path,
          data: await indexer.getGraphNeighbors!(r.repoId, r.path, { limit: 5 }),
        }))
      );
      
      for (const item of neighbors) {
        graphContextMap.set(item.path, item.data as GraphContext);
        if (withGraph) {
          graphContext[item.path] = item.data;
        }
      }
    }

    // Apply reranking if enabled
    const finalResults = shouldRerank
      ? await rerank(query, results, graphContextMap, { topK: limit })
      : results.map((r, idx) => ({ ...r, originalRank: idx + 1, rerankedScore: r.combinedScore }));

    return NextResponse.json({
      query,
      filters: { repoId, language, limit, minScore, graph: withGraph, rerank: shouldRerank },
      count: finalResults.length,
      reranked: shouldRerank,
      results: finalResults.map(r => ({
        path: r.path,
        repoId: r.repoId,
        language: r.language,
        snippet: r.content.slice(0, 500),
        symbols: r.symbols?.slice(0, 10),
        score: {
          semantic: r.semanticScore.toFixed(3),
          keyword: r.keywordScore.toFixed(3),
          combined: r.combinedScore.toFixed(3),
          reranked: 'rerankedScore' in r ? (r as any).rerankedScore.toFixed(3) : undefined,
        },
        originalRank: 'originalRank' in r ? (r as any).originalRank : undefined,
        boostReason: 'boostReason' in r ? (r as any).boostReason : undefined,
        graph: graphContext[r.path],
      })),
    });
  } catch (error: any) {
    console.error('[search] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro na busca' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!ragEnabled) {
    return NextResponse.json({ 
      error: 'RAG não habilitado. Configure AUDIT_DB_URL/PGVECTOR_URL e OPENAI_API_KEY.',
      enabled: false,
    }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { 
      query, 
      code, 
      repoId, 
      language, 
      limit = 10, 
      minScore = 0.5, 
      graph: withGraph = false,
      rerank: shouldRerankBody,
    } = body;

    const shouldRerank = shouldRerankBody ?? isRerankerEnabled();

    if (!query && !code) {
      return NextResponse.json({ error: 'query ou code é obrigatório' }, { status: 400 });
    }

    const indexer = getRAGIndexer();
    const fetchLimit = shouldRerank ? Math.max(limit * 2, 20) : limit;
    
    // Se code fornecido, busca código similar
    const results = code 
      ? await indexer.searchSimilarCode(code, { repoId, language, limit: fetchLimit, minScore })
      : await indexer.search(query, { repoId, language, limit: fetchLimit, minScore, useCache: true });

    // Build graph context for both graph display and reranker
    const graphContextMap = new Map<string, GraphContext>();
    let graphContext: Record<string, any> = {};
    
    if ((withGraph || shouldRerank) && indexer.getGraphNeighbors) {
      const topForGraph = results.slice(0, Math.min(10, results.length));
      const neighbors = await Promise.all(
        topForGraph.map(async (r) => ({
          path: r.path,
          data: await indexer.getGraphNeighbors!(r.repoId, r.path, { limit: 5 }),
        }))
      );
      
      for (const item of neighbors) {
        graphContextMap.set(item.path, item.data as GraphContext);
        if (withGraph) {
          graphContext[item.path] = item.data;
        }
      }
    }

    // Apply reranking if enabled
    const finalResults = shouldRerank
      ? await rerank(query || code, results, graphContextMap, { topK: limit })
      : results.map((r, idx) => ({ ...r, originalRank: idx + 1, rerankedScore: r.combinedScore }));

    return NextResponse.json({
      query: query || '[similar code]',
      mode: code ? 'similar-code' : 'semantic',
      filters: { repoId, language, limit, minScore, graph: withGraph, rerank: shouldRerank },
      count: finalResults.length,
      reranked: shouldRerank,
      results: finalResults.map(r => ({
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
          reranked: 'rerankedScore' in r ? (r as any).rerankedScore : undefined,
        },
        originalRank: 'originalRank' in r ? (r as any).originalRank : undefined,
        boostReason: 'boostReason' in r ? (r as any).boostReason : undefined,
        graph: graphContext[r.path],
      })),
    });
  } catch (error: any) {
    console.error('[search] Error:', error);
    return NextResponse.json({ error: error.message || 'Erro na busca' }, { status: 500 });
  }
}
