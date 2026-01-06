/**
 * Reranker Module
 * 
 * Re-ranks RAG search results using:
 * 1. Graph neighbor boost (files that import/are imported by top results)
 * 2. Optional external reranker API (Cohere, BGE)
 * 
 * Feature-flagged via RAG_RERANKER_ENABLED env var.
 */

import type { SearchResult, GraphEdge } from './rag-indexer';

// ============================================================================
// Types
// ============================================================================

export interface RerankerConfig {
  enabled: boolean;
  graphBoostWeight: number;      // How much to boost graph neighbors (0-1)
  externalReranker?: 'cohere' | 'bge' | 'none';
  cohereApiKey?: string;
  topK: number;                   // How many results to return after rerank
  timeoutMs: number;              // Timeout for external reranker
}

export interface RerankedResult extends SearchResult {
  originalRank: number;
  rerankedScore: number;
  boostReason?: string;
}

export interface GraphContext {
  imports: GraphEdge[];
  dependents: GraphEdge[];
}

// ============================================================================
// Config
// ============================================================================

const defaultConfig: RerankerConfig = {
  enabled: ['true', '1', 'yes'].includes(`${process.env.RAG_RERANKER_ENABLED || ''}`.toLowerCase()),
  graphBoostWeight: parseFloat(process.env.RAG_GRAPH_BOOST_WEIGHT || '0.15'),
  externalReranker: (process.env.RAG_EXTERNAL_RERANKER as 'cohere' | 'bge' | 'none') || 'none',
  cohereApiKey: process.env.COHERE_API_KEY,
  topK: parseInt(process.env.RAG_RERANKER_TOP_K || '10', 10),
  timeoutMs: parseInt(process.env.RAG_RERANKER_TIMEOUT_MS || '3000', 10),
};

// ============================================================================
// Graph Boost Logic
// ============================================================================

/**
 * Boost results that are graph neighbors of top results.
 * 
 * Algorithm:
 * 1. Take top-N results as "anchor" files
 * 2. For each other result, check if it imports/is imported by anchors
 * 3. Add boost to score if graph connection found
 */
function applyGraphBoost(
  results: SearchResult[],
  graphContexts: Map<string, GraphContext>,
  boostWeight: number
): RerankedResult[] {
  if (results.length === 0) return [];

  // Anchor files = top 3 results
  const anchorPaths = new Set(results.slice(0, 3).map(r => r.path));
  
  // Build set of paths connected to anchors
  const connectedPaths = new Set<string>();
  for (const anchorPath of anchorPaths) {
    const ctx = graphContexts.get(anchorPath);
    if (!ctx) continue;
    
    // Files that anchor imports
    ctx.imports.forEach(edge => connectedPaths.add(edge.toPath));
    // Files that import anchor
    ctx.dependents.forEach(edge => connectedPaths.add(edge.fromPath));
  }

  return results.map((result, idx) => {
    let boost = 0;
    let boostReason: string | undefined;

    // Boost if this file is connected to an anchor
    if (!anchorPaths.has(result.path) && connectedPaths.has(result.path)) {
      boost = boostWeight;
      boostReason = 'graph-neighbor';
    }

    // Boost if this file shares imports with anchors
    const resultCtx = graphContexts.get(result.path);
    if (resultCtx && !anchorPaths.has(result.path)) {
      const resultImports = new Set(resultCtx.imports.map(e => e.toPath));
      for (const anchorPath of anchorPaths) {
        const anchorCtx = graphContexts.get(anchorPath);
        if (anchorCtx) {
          const anchorImports = new Set(anchorCtx.imports.map(e => e.toPath));
          const sharedImports = [...resultImports].filter(p => anchorImports.has(p));
          if (sharedImports.length >= 2) {
            boost = Math.max(boost, boostWeight * 0.7);
            boostReason = boostReason || 'shared-imports';
          }
        }
      }
    }

    return {
      ...result,
      originalRank: idx + 1,
      rerankedScore: result.combinedScore + boost,
      boostReason,
    };
  });
}

// ============================================================================
// External Reranker (Cohere)
// ============================================================================

async function rerankWithCohere(
  query: string,
  results: RerankedResult[],
  config: RerankerConfig
): Promise<RerankedResult[]> {
  if (!config.cohereApiKey) {
    console.warn('[reranker] Cohere API key not set, skipping external rerank');
    return results;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    const response = await fetch('https://api.cohere.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.cohereApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-english-v3.0',
        query,
        documents: results.map(r => r.content.slice(0, 4000)), // Cohere limit
        top_n: config.topK,
        return_documents: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[reranker] Cohere API error: ${response.status}`);
      return results;
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    // Map Cohere scores back to results
    const reranked: RerankedResult[] = data.results.map(cr => ({
      ...results[cr.index],
      rerankedScore: cr.relevance_score,
      boostReason: results[cr.index].boostReason 
        ? `${results[cr.index].boostReason}+cohere`
        : 'cohere',
    }));

    return reranked;
  } catch (err) {
    console.warn('[reranker] Cohere rerank failed:', (err as Error).message);
    return results; // Graceful fallback
  }
}

// ============================================================================
// Main Reranker Function
// ============================================================================

export async function rerank(
  query: string,
  results: SearchResult[],
  graphContexts: Map<string, GraphContext>,
  config: Partial<RerankerConfig> = {}
): Promise<RerankedResult[]> {
  const cfg = { ...defaultConfig, ...config };

  if (!cfg.enabled || results.length === 0) {
    // Return as-is with minimal transformation
    return results.map((r, idx) => ({
      ...r,
      originalRank: idx + 1,
      rerankedScore: r.combinedScore,
    }));
  }

  console.log(`[reranker] Reranking ${results.length} results (graphBoost=${cfg.graphBoostWeight}, external=${cfg.externalReranker})`);

  // Step 1: Apply graph boost
  let reranked = applyGraphBoost(results, graphContexts, cfg.graphBoostWeight);

  // Step 2: Sort by boosted score
  reranked.sort((a, b) => b.rerankedScore - a.rerankedScore);

  // Step 3: Optional external reranker
  if (cfg.externalReranker === 'cohere') {
    reranked = await rerankWithCohere(query, reranked.slice(0, 20), cfg);
  }

  // Step 4: Take top K
  const finalResults = reranked.slice(0, cfg.topK);

  // Log boost stats
  const boosted = finalResults.filter(r => r.boostReason).length;
  if (boosted > 0) {
    console.log(`[reranker] ${boosted}/${finalResults.length} results received boost`);
  }

  return finalResults;
}

// ============================================================================
// Helper to check if reranker is enabled
// ============================================================================

export function isRerankerEnabled(): boolean {
  return defaultConfig.enabled;
}

export function getRerankerConfig(): RerankerConfig {
  return { ...defaultConfig };
}
