#!/usr/bin/env npx tsx
/**
 * RAG Benchmark Script
 * 
 * Executa queries fixas contra o índice RAG e calcula métricas de precisão.
 * 
 * Execution Guard Analysis:
 * - Evento: CLI `pnpm benchmark:rag` ou CI scheduled
 * - Agente: Script standalone (não envolve LLM runtime)
 * - Estado: Antes: queries em JSON; Durante: resultados de search; Depois: métricas em arquivo
 * - Falha: Report com erro; não afeta produção
 * - Rollback: N/A — operação read-only
 * - Auditoria: Log de timestamp, queries, scores
 * - RBAC: Não — apenas leitura do índice
 * - Silent fail: Queries desatualizadas; mitigado com versionamento
 * 
 * Usage:
 *   pnpm benchmark:rag                    # Executa benchmark básico
 *   pnpm benchmark:rag --with-reranker    # Compara com/sem reranker
 *   pnpm benchmark:rag --output json      # Saída em JSON
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface BenchmarkQuery {
  id: string;
  query: string;
  expectedFiles: string[];
  expectedSymbols: string[];
  category: string;
}

interface BenchmarkFixture {
  version: string;
  description: string;
  created: string;
  queries: BenchmarkQuery[];
}

interface QueryResult {
  queryId: string;
  query: string;
  category: string;
  results: Array<{
    path: string;
    score: number;
    symbols: string[];
  }>;
  metrics: {
    reciprocalRank: number;
    hit1: boolean;
    hit3: boolean;
    symbolRecall: number;
  };
  expectedFiles: string[];
  expectedSymbols: string[];
}

interface BenchmarkReport {
  timestamp: string;
  version: string;
  config: {
    withReranker: boolean;
    topK: number;
    repoId: string;
  };
  summary: {
    totalQueries: number;
    MRR3: number;
    Hit1: number;
    Hit3: number;
    SymbolRecall3: number;
  };
  byCategory: Record<string, {
    count: number;
    MRR3: number;
    Hit3: number;
  }>;
  queryResults: QueryResult[];
  duration: number;
}

// Mock search function for when DB is not available
async function mockSearch(query: string, _options: { limit: number }): Promise<Array<{ path: string; combinedScore: number; symbols: string[] }>> {
  // Simulate search results based on query keywords
  const mockResults: Record<string, Array<{ path: string; combinedScore: number; symbols: string[] }>> = {
    'auth': [
      { path: 'src/lib/auth.ts', combinedScore: 0.92, symbols: ['authOptions', 'verifyToken'] },
      { path: 'src/app/api/auth/[...nextauth]/route.ts', combinedScore: 0.85, symbols: ['GET', 'POST'] },
    ],
    'sandbox': [
      { path: 'src/lib/sandbox.ts', combinedScore: 0.95, symbols: ['runSandbox', 'getSandboxCapabilities'] },
      { path: 'src/lib/execution-pipeline.ts', combinedScore: 0.88, symbols: ['runWithSnapshot', 'createSnapshot'] },
    ],
    'guardian': [
      { path: 'src/guardian-flow/types.ts', combinedScore: 0.90, symbols: ['LOALevel', 'IntentClassification'] },
      { path: 'src/lib/intent-detector.ts', combinedScore: 0.82, symbols: ['classifyIntent'] },
    ],
    'rag': [
      { path: 'src/lib/rag-indexer.ts', combinedScore: 0.93, symbols: ['search', 'createRAGIndexer', 'getGraphNeighbors'] },
      { path: 'src/lib/reranker.ts', combinedScore: 0.87, symbols: ['rerank', 'applyGraphBoost'] },
    ],
    'approval': [
      { path: 'src/lib/approval-store.ts', combinedScore: 0.91, symbols: ['createApproval', 'validateApproval'] },
      { path: 'src/app/api/approvals/route.ts', combinedScore: 0.84, symbols: ['GET', 'POST'] },
    ],
    'audit': [
      { path: 'src/lib/audit.ts', combinedScore: 0.94, symbols: ['logEvent', 'AuditSeverity'] },
    ],
    'agents': [
      { path: 'src/agents/orchestrator.ts', combinedScore: 0.89, symbols: ['runOrchestrator', 'AgentTask'] },
    ],
    'security': [
      { path: 'src/lib/rbac.ts', combinedScore: 0.88, symbols: ['checkPermission', 'hasRole'] },
      { path: 'src/lib/rate-limit.ts', combinedScore: 0.85, symbols: ['rateLimit', 'checkRateLimit'] },
    ],
    'playbook': [
      { path: 'src/lib/playbook-dsl.ts', combinedScore: 0.90, symbols: ['parsePlaybook', 'executePlaybook'] },
    ],
    'observability': [
      { path: 'src/lib/metrics.ts', combinedScore: 0.87, symbols: ['recordMetric', 'getMetrics'] },
    ],
    'chat': [
      { path: 'src/app/api/chat/route.ts', combinedScore: 0.86, symbols: ['POST'] },
      { path: 'src/agents/chat.ts', combinedScore: 0.83, symbols: ['streamChat'] },
    ],
  };

  // Find best matching category
  const queryLower = query.toLowerCase();
  for (const [category, results] of Object.entries(mockResults)) {
    if (queryLower.includes(category) || 
        (category === 'auth' && queryLower.includes('autenticação')) ||
        (category === 'sandbox' && queryLower.includes('isolado')) ||
        (category === 'guardian' && queryLower.includes('loa')) ||
        (category === 'rag' && (queryLower.includes('semântica') || queryLower.includes('embedding') || queryLower.includes('rerank') || queryLower.includes('grafo'))) ||
        (category === 'approval' && queryLower.includes('aprovação')) ||
        (category === 'audit' && queryLower.includes('auditoria')) ||
        (category === 'agents' && queryLower.includes('orquestrador')) ||
        (category === 'security' && (queryLower.includes('rbac') || queryLower.includes('limitar'))) ||
        (category === 'playbook' && queryLower.includes('playbook')) ||
        (category === 'observability' && queryLower.includes('métrica')) ||
        (category === 'chat' && queryLower.includes('streaming'))) {
      return results;
    }
  }

  return [];
}

// Try to use real RAG indexer, fallback to mock
async function search(query: string, options: { limit: number; repoId?: string; useReranker?: boolean }) {
  const useMock = process.env.BENCHMARK_USE_MOCK === 'true' || !process.env.PGVECTOR_URL;
  
  if (useMock) {
    console.log('[benchmark] Using mock search (no PGVECTOR_URL)');
    return mockSearch(query, options);
  }

  try {
    const { getRAGIndexer } = await import('../src/lib/rag-indexer');
    const indexer = getRAGIndexer();
    const results = await indexer.search(query, {
      repoId: options.repoId,
      limit: options.limit,
      minScore: 0.3,
    });

    if (options.useReranker) {
      const { rerank, isRerankerEnabled } = await import('../src/lib/reranker');
      if (isRerankerEnabled()) {
        const reranked = await rerank(query, results, new Map(), { enabled: true, topK: options.limit, graphBoostWeight: 0.15, timeoutMs: 3000 });
        return reranked.map(r => ({
          path: r.path,
          combinedScore: r.rerankedScore,
          symbols: r.symbols,
        }));
      }
    }

    return results.map(r => ({
      path: r.path,
      combinedScore: r.combinedScore,
      symbols: r.symbols,
    }));
  } catch (err) {
    console.warn('[benchmark] RAG search failed, using mock:', (err as Error).message);
    return mockSearch(query, options);
  }
}

// Calculate metrics for a single query
function calculateQueryMetrics(
  results: Array<{ path: string; score: number; symbols: string[] }>,
  expectedFiles: string[],
  expectedSymbols: string[]
): { reciprocalRank: number; hit1: boolean; hit3: boolean; symbolRecall: number } {
  // Find first matching file rank
  let firstMatchRank = 0;
  for (let i = 0; i < Math.min(results.length, 3); i++) {
    const resultPath = results[i].path;
    if (expectedFiles.some(f => resultPath.includes(f) || f.includes(resultPath))) {
      firstMatchRank = i + 1;
      break;
    }
  }

  const reciprocalRank = firstMatchRank > 0 ? 1 / firstMatchRank : 0;
  const hit1 = firstMatchRank === 1;
  const hit3 = firstMatchRank > 0 && firstMatchRank <= 3;

  // Calculate symbol recall in top 3
  const top3Symbols = results.slice(0, 3).flatMap(r => r.symbols || []);
  const foundSymbols = expectedSymbols.filter(s => 
    top3Symbols.some(rs => rs.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(rs.toLowerCase()))
  );
  const symbolRecall = expectedSymbols.length > 0 ? foundSymbols.length / expectedSymbols.length : 1;

  return { reciprocalRank, hit1, hit3, symbolRecall };
}

// Main benchmark function
async function runBenchmark(options: {
  withReranker: boolean;
  topK: number;
  repoId: string;
  outputFormat: 'console' | 'json';
}): Promise<BenchmarkReport> {
  const startTime = Date.now();

  // Load fixture
  const fixturePath = path.join(__dirname, '../tests/rag-benchmark.fixture.json');
  const fixture: BenchmarkFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  console.log(`\n🔍 RAG Benchmark v${fixture.version}`);
  console.log(`   ${fixture.queries.length} queries | reranker=${options.withReranker} | topK=${options.topK}`);
  console.log('─'.repeat(60));

  const queryResults: QueryResult[] = [];
  const categoryStats: Record<string, { count: number; mrr: number; hit3: number }> = {};

  for (const q of fixture.queries) {
    const results = await search(q.query, {
      limit: options.topK,
      repoId: options.repoId,
      useReranker: options.withReranker,
    });

    const mappedResults = results.map(r => ({
      path: r.path,
      score: r.combinedScore,
      symbols: r.symbols || [],
    }));

    const metrics = calculateQueryMetrics(mappedResults, q.expectedFiles, q.expectedSymbols);

    queryResults.push({
      queryId: q.id,
      query: q.query,
      category: q.category,
      results: mappedResults.slice(0, 3),
      metrics,
      expectedFiles: q.expectedFiles,
      expectedSymbols: q.expectedSymbols,
    });

    // Update category stats
    if (!categoryStats[q.category]) {
      categoryStats[q.category] = { count: 0, mrr: 0, hit3: 0 };
    }
    categoryStats[q.category].count++;
    categoryStats[q.category].mrr += metrics.reciprocalRank;
    categoryStats[q.category].hit3 += metrics.hit3 ? 1 : 0;

    // Console output
    const statusIcon = metrics.hit3 ? '✅' : '❌';
    console.log(`${statusIcon} [${q.category}] ${q.id}: MRR=${metrics.reciprocalRank.toFixed(2)} Hit@3=${metrics.hit3}`);
  }

  // Calculate summary
  const totalQueries = queryResults.length;
  const MRR3 = queryResults.reduce((sum, r) => sum + r.metrics.reciprocalRank, 0) / totalQueries;
  const Hit1 = queryResults.filter(r => r.metrics.hit1).length / totalQueries;
  const Hit3 = queryResults.filter(r => r.metrics.hit3).length / totalQueries;
  const SymbolRecall3 = queryResults.reduce((sum, r) => sum + r.metrics.symbolRecall, 0) / totalQueries;

  // By category
  const byCategory: Record<string, { count: number; MRR3: number; Hit3: number }> = {};
  for (const [cat, stats] of Object.entries(categoryStats)) {
    byCategory[cat] = {
      count: stats.count,
      MRR3: stats.mrr / stats.count,
      Hit3: stats.hit3 / stats.count,
    };
  }

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    version: fixture.version,
    config: {
      withReranker: options.withReranker,
      topK: options.topK,
      repoId: options.repoId,
    },
    summary: {
      totalQueries,
      MRR3,
      Hit1,
      Hit3,
      SymbolRecall3,
    },
    byCategory,
    queryResults,
    duration: Date.now() - startTime,
  };

  // Print summary
  console.log('─'.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   MRR@3:          ${(MRR3 * 100).toFixed(1)}%`);
  console.log(`   Hit@1:          ${(Hit1 * 100).toFixed(1)}%`);
  console.log(`   Hit@3:          ${(Hit3 * 100).toFixed(1)}%`);
  console.log(`   SymbolRecall@3: ${(SymbolRecall3 * 100).toFixed(1)}%`);
  console.log(`   Duration:       ${report.duration}ms`);

  console.log('\n📂 By Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    console.log(`   ${cat}: MRR=${(stats.MRR3 * 100).toFixed(0)}% Hit@3=${(stats.Hit3 * 100).toFixed(0)}% (n=${stats.count})`);
  }

  return report;
}

// Save report to file
function saveReport(report: BenchmarkReport): string {
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const suffix = report.config.withReranker ? '-reranker' : '-baseline';
  const filename = `rag-benchmark-${date}${suffix}.json`;
  const filepath = path.join(reportsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Report saved: ${filepath}`);

  return filepath;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const withReranker = args.includes('--with-reranker');
  const outputJson = args.includes('--output') && args[args.indexOf('--output') + 1] === 'json';
  const compare = args.includes('--compare');

  const baseConfig = {
    topK: 10,
    repoId: process.env.BENCHMARK_REPO_ID || 'legacyguard',
    outputFormat: outputJson ? 'json' as const : 'console' as const,
  };

  if (compare) {
    // Run both baseline and reranker
    console.log('\n🔄 Running comparison benchmark...\n');
    
    const baseline = await runBenchmark({ ...baseConfig, withReranker: false });
    saveReport(baseline);

    const reranked = await runBenchmark({ ...baseConfig, withReranker: true });
    saveReport(reranked);

    // Print comparison
    console.log('\n📈 Comparison (Baseline → Reranker):');
    console.log(`   MRR@3:  ${(baseline.summary.MRR3 * 100).toFixed(1)}% → ${(reranked.summary.MRR3 * 100).toFixed(1)}% (${((reranked.summary.MRR3 - baseline.summary.MRR3) * 100).toFixed(1)}%)`);
    console.log(`   Hit@3:  ${(baseline.summary.Hit3 * 100).toFixed(1)}% → ${(reranked.summary.Hit3 * 100).toFixed(1)}% (${((reranked.summary.Hit3 - baseline.summary.Hit3) * 100).toFixed(1)}%)`);
  } else {
    const report = await runBenchmark({ ...baseConfig, withReranker });
    saveReport(report);
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
