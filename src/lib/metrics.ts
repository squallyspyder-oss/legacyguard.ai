type IncidentStatus = 'open' | 'mitigated' | 'failed';

type IncidentCycle = {
  id: string;
  source?: string;
  startedAt: number;
  mitigatedAt?: number;
  status: IncidentStatus;
  regressions: number;
  notes: string[];
};

const incidents = new Map<string, IncidentCycle>();

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

export function startIncidentCycle(id: string, source?: string, startedAt: number = Date.now()): IncidentCycle {
  if (!id) throw new Error('incident id obrigatório');
  const existing = incidents.get(id);
  if (existing) return existing;
  const created: IncidentCycle = {
    id,
    source,
    startedAt,
    status: 'open',
    regressions: 0,
    notes: [],
  };
  incidents.set(id, created);
  return created;
}

export function markMitigation(id: string, status: IncidentStatus = 'mitigated', when: number = Date.now()): IncidentCycle {
  if (!id) throw new Error('incident id obrigatório');
  const incident = incidents.get(id) || startIncidentCycle(id);
  incident.status = status;
  if (status === 'mitigated') {
    incident.mitigatedAt = when;
  }
  incidents.set(id, incident);
  return incident;
}

export function recordRegression(id: string, note?: string): IncidentCycle {
  if (!id) throw new Error('incident id obrigatório');
  const incident = incidents.get(id) || startIncidentCycle(id);
  incident.regressions += 1;
  if (note) incident.notes.push(note.slice(0, 500));
  incidents.set(id, incident);
  return incident;
}

export function getIncident(id: string): IncidentCycle | undefined {
  return incidents.get(id);
}

export function getMetricsSummary() {
  const values = Array.from(incidents.values());
  const total = values.length;
  const mitigated = values.filter((v) => v.status === 'mitigated');
  const open = values.filter((v) => v.status === 'open');
  const failed = values.filter((v) => v.status === 'failed');

  const mttrList = mitigated
    .filter((v) => typeof v.mitigatedAt === 'number')
    .map((v) => (v.mitigatedAt as number) - v.startedAt)
    .filter((v) => v >= 0);

  const mttrAvg = mttrList.length ? Math.round(mttrList.reduce((a, b) => a + b, 0) / mttrList.length) : 0;
  const mttrP50 = median(mttrList);

  const regressionsTotal = values.reduce((acc, v) => acc + v.regressions, 0);

  return {
    totals: {
      incidents: total,
      mitigated: mitigated.length,
      open: open.length,
      failed: failed.length,
    },
    mttr: {
      avgMs: mttrAvg,
      p50Ms: mttrP50,
      samples: mttrList.length,
    },
    regressions: {
      total: regressionsTotal,
      perIncident: total ? Number((regressionsTotal / total).toFixed(2)) : 0,
    },
  };
}

export function resetMetrics() {
  incidents.clear();
}

// ============================================================================
// C.2 Observability — Sandbox, RAG, Reranker Metrics
// ============================================================================

/**
 * Execution Guard Analysis:
 * - Evento: chamadas de recordSandboxExecution, recordRAGSearch, recordRerankerCall
 * - Agente: Sistema interno (não LLM)
 * - Estado: métricas em memória; persist opcional via export
 * - Falha: métricas perdidas em restart; não afeta funcionalidade core
 * - Rollback: N/A — dados agregados
 * - Auditoria: logs estruturados para aggregation externa
 * - RBAC: endpoint /api/metrics requer role admin
 * - Silent fail: contadores podem ficar stale; mitigado com TTL window
 */

// Sandbox Metrics
interface SandboxMetrics {
  executions: number;
  successes: number;
  failures: number;
  timeouts: number;
  snapshotsCreated: number;
  snapshotsRestored: number;
  runtimeCounts: Record<string, number>;
  latencies: number[];
  lastUpdated: number;
}

const sandboxMetrics: SandboxMetrics = {
  executions: 0,
  successes: 0,
  failures: 0,
  timeouts: 0,
  snapshotsCreated: 0,
  snapshotsRestored: 0,
  runtimeCounts: {},
  latencies: [],
  lastUpdated: Date.now(),
};

export type SandboxOutcome = 'success' | 'failure' | 'timeout';

export function recordSandboxExecution(params: {
  outcome: SandboxOutcome;
  runtime: string;
  latencyMs: number;
  snapshotCreated?: boolean;
  snapshotRestored?: boolean;
}): void {
  sandboxMetrics.executions++;
  sandboxMetrics.lastUpdated = Date.now();

  if (params.outcome === 'success') sandboxMetrics.successes++;
  else if (params.outcome === 'failure') sandboxMetrics.failures++;
  else if (params.outcome === 'timeout') sandboxMetrics.timeouts++;

  sandboxMetrics.runtimeCounts[params.runtime] = 
    (sandboxMetrics.runtimeCounts[params.runtime] || 0) + 1;

  // Keep last 1000 latencies for percentile calculations
  sandboxMetrics.latencies.push(params.latencyMs);
  if (sandboxMetrics.latencies.length > 1000) {
    sandboxMetrics.latencies.shift();
  }

  if (params.snapshotCreated) sandboxMetrics.snapshotsCreated++;
  if (params.snapshotRestored) sandboxMetrics.snapshotsRestored++;

  // Structured log for external aggregation
  console.log(JSON.stringify({
    type: 'metric',
    category: 'sandbox',
    ...params,
    timestamp: new Date().toISOString(),
  }));
}

export function getSandboxMetrics() {
  const latencies = sandboxMetrics.latencies;
  return {
    executions: sandboxMetrics.executions,
    successRate: sandboxMetrics.executions > 0 
      ? sandboxMetrics.successes / sandboxMetrics.executions 
      : 0,
    failureRate: sandboxMetrics.executions > 0 
      ? sandboxMetrics.failures / sandboxMetrics.executions 
      : 0,
    timeoutRate: sandboxMetrics.executions > 0 
      ? sandboxMetrics.timeouts / sandboxMetrics.executions 
      : 0,
    snapshots: {
      created: sandboxMetrics.snapshotsCreated,
      restored: sandboxMetrics.snapshotsRestored,
    },
    runtimeDistribution: sandboxMetrics.runtimeCounts,
    latency: {
      avgMs: latencies.length > 0 
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) 
        : 0,
      p50Ms: median(latencies),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
      samples: latencies.length,
    },
    lastUpdated: sandboxMetrics.lastUpdated,
  };
}

// RAG Search Metrics
interface RAGMetrics {
  searches: number;
  cacheHits: number;
  cacheMisses: number;
  emptyResults: number;
  avgResultCount: number;
  totalResultCount: number;
  latencies: number[];
  embeddingLatencies: number[];
  lastUpdated: number;
}

const ragMetrics: RAGMetrics = {
  searches: 0,
  cacheHits: 0,
  cacheMisses: 0,
  emptyResults: 0,
  avgResultCount: 0,
  totalResultCount: 0,
  latencies: [],
  embeddingLatencies: [],
  lastUpdated: Date.now(),
};

export function recordRAGSearch(params: {
  latencyMs: number;
  embeddingLatencyMs?: number;
  resultCount: number;
  cacheHit: boolean;
  query?: string; // For debugging, not logged
}): void {
  ragMetrics.searches++;
  ragMetrics.lastUpdated = Date.now();

  if (params.cacheHit) ragMetrics.cacheHits++;
  else ragMetrics.cacheMisses++;

  if (params.resultCount === 0) ragMetrics.emptyResults++;

  ragMetrics.totalResultCount += params.resultCount;
  ragMetrics.avgResultCount = ragMetrics.totalResultCount / ragMetrics.searches;

  ragMetrics.latencies.push(params.latencyMs);
  if (ragMetrics.latencies.length > 1000) ragMetrics.latencies.shift();

  if (params.embeddingLatencyMs !== undefined) {
    ragMetrics.embeddingLatencies.push(params.embeddingLatencyMs);
    if (ragMetrics.embeddingLatencies.length > 1000) ragMetrics.embeddingLatencies.shift();
  }

  console.log(JSON.stringify({
    type: 'metric',
    category: 'rag_search',
    latencyMs: params.latencyMs,
    embeddingLatencyMs: params.embeddingLatencyMs,
    resultCount: params.resultCount,
    cacheHit: params.cacheHit,
    timestamp: new Date().toISOString(),
  }));
}

export function getRAGMetrics() {
  return {
    searches: ragMetrics.searches,
    cacheHitRate: ragMetrics.searches > 0 
      ? ragMetrics.cacheHits / ragMetrics.searches 
      : 0,
    emptyResultRate: ragMetrics.searches > 0 
      ? ragMetrics.emptyResults / ragMetrics.searches 
      : 0,
    avgResultCount: Math.round(ragMetrics.avgResultCount * 10) / 10,
    latency: {
      avgMs: ragMetrics.latencies.length > 0 
        ? Math.round(ragMetrics.latencies.reduce((a, b) => a + b, 0) / ragMetrics.latencies.length) 
        : 0,
      p50Ms: median(ragMetrics.latencies),
      p95Ms: percentile(ragMetrics.latencies, 95),
      p99Ms: percentile(ragMetrics.latencies, 99),
      samples: ragMetrics.latencies.length,
    },
    embeddingLatency: {
      avgMs: ragMetrics.embeddingLatencies.length > 0 
        ? Math.round(ragMetrics.embeddingLatencies.reduce((a, b) => a + b, 0) / ragMetrics.embeddingLatencies.length) 
        : 0,
      p50Ms: median(ragMetrics.embeddingLatencies),
      samples: ragMetrics.embeddingLatencies.length,
    },
    lastUpdated: ragMetrics.lastUpdated,
  };
}

// Reranker Metrics
interface RerankerMetrics {
  calls: number;
  successes: number;
  failures: number;
  timeouts: number;
  graphBoostApplied: number;
  externalRerankerCalls: number;
  latencies: number[];
  boostDeltas: number[]; // How much scores changed
  lastUpdated: number;
}

const rerankerMetrics: RerankerMetrics = {
  calls: 0,
  successes: 0,
  failures: 0,
  timeouts: 0,
  graphBoostApplied: 0,
  externalRerankerCalls: 0,
  latencies: [],
  boostDeltas: [],
  lastUpdated: Date.now(),
};

export type RerankerOutcome = 'success' | 'failure' | 'timeout';

export function recordRerankerCall(params: {
  outcome: RerankerOutcome;
  latencyMs: number;
  graphBoostApplied: boolean;
  externalReranker: boolean;
  avgBoostDelta?: number; // Average score change
}): void {
  rerankerMetrics.calls++;
  rerankerMetrics.lastUpdated = Date.now();

  if (params.outcome === 'success') rerankerMetrics.successes++;
  else if (params.outcome === 'failure') rerankerMetrics.failures++;
  else if (params.outcome === 'timeout') rerankerMetrics.timeouts++;

  if (params.graphBoostApplied) rerankerMetrics.graphBoostApplied++;
  if (params.externalReranker) rerankerMetrics.externalRerankerCalls++;

  rerankerMetrics.latencies.push(params.latencyMs);
  if (rerankerMetrics.latencies.length > 1000) rerankerMetrics.latencies.shift();

  if (params.avgBoostDelta !== undefined) {
    rerankerMetrics.boostDeltas.push(params.avgBoostDelta);
    if (rerankerMetrics.boostDeltas.length > 1000) rerankerMetrics.boostDeltas.shift();
  }

  console.log(JSON.stringify({
    type: 'metric',
    category: 'reranker',
    ...params,
    timestamp: new Date().toISOString(),
  }));
}

export function getRerankerMetrics() {
  return {
    calls: rerankerMetrics.calls,
    successRate: rerankerMetrics.calls > 0 
      ? rerankerMetrics.successes / rerankerMetrics.calls 
      : 0,
    failureRate: rerankerMetrics.calls > 0 
      ? rerankerMetrics.failures / rerankerMetrics.calls 
      : 0,
    timeoutRate: rerankerMetrics.calls > 0 
      ? rerankerMetrics.timeouts / rerankerMetrics.calls 
      : 0,
    graphBoostRate: rerankerMetrics.calls > 0 
      ? rerankerMetrics.graphBoostApplied / rerankerMetrics.calls 
      : 0,
    externalRerankerRate: rerankerMetrics.calls > 0 
      ? rerankerMetrics.externalRerankerCalls / rerankerMetrics.calls 
      : 0,
    latency: {
      avgMs: rerankerMetrics.latencies.length > 0 
        ? Math.round(rerankerMetrics.latencies.reduce((a, b) => a + b, 0) / rerankerMetrics.latencies.length) 
        : 0,
      p50Ms: median(rerankerMetrics.latencies),
      p95Ms: percentile(rerankerMetrics.latencies, 95),
      p99Ms: percentile(rerankerMetrics.latencies, 99),
      samples: rerankerMetrics.latencies.length,
    },
    avgBoostDelta: rerankerMetrics.boostDeltas.length > 0 
      ? Math.round((rerankerMetrics.boostDeltas.reduce((a, b) => a + b, 0) / rerankerMetrics.boostDeltas.length) * 1000) / 1000 
      : 0,
    lastUpdated: rerankerMetrics.lastUpdated,
  };
}

// Percentile helper
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Prometheus-compatible format export
export function getPrometheusMetrics(): string {
  const sandbox = getSandboxMetrics();
  const rag = getRAGMetrics();
  const reranker = getRerankerMetrics();

  const lines: string[] = [
    '# HELP legacyguard_sandbox_executions_total Total sandbox executions',
    '# TYPE legacyguard_sandbox_executions_total counter',
    `legacyguard_sandbox_executions_total ${sandbox.executions}`,
    '',
    '# HELP legacyguard_sandbox_success_rate Sandbox success rate',
    '# TYPE legacyguard_sandbox_success_rate gauge',
    `legacyguard_sandbox_success_rate ${sandbox.successRate.toFixed(4)}`,
    '',
    '# HELP legacyguard_sandbox_latency_ms Sandbox execution latency',
    '# TYPE legacyguard_sandbox_latency_ms summary',
    `legacyguard_sandbox_latency_ms{quantile="0.5"} ${sandbox.latency.p50Ms}`,
    `legacyguard_sandbox_latency_ms{quantile="0.95"} ${sandbox.latency.p95Ms}`,
    `legacyguard_sandbox_latency_ms{quantile="0.99"} ${sandbox.latency.p99Ms}`,
    '',
    '# HELP legacyguard_sandbox_snapshots_total Total snapshots',
    '# TYPE legacyguard_sandbox_snapshots_total counter',
    `legacyguard_sandbox_snapshots_total{type="created"} ${sandbox.snapshots.created}`,
    `legacyguard_sandbox_snapshots_total{type="restored"} ${sandbox.snapshots.restored}`,
    '',
    '# HELP legacyguard_rag_searches_total Total RAG searches',
    '# TYPE legacyguard_rag_searches_total counter',
    `legacyguard_rag_searches_total ${rag.searches}`,
    '',
    '# HELP legacyguard_rag_cache_hit_rate RAG cache hit rate',
    '# TYPE legacyguard_rag_cache_hit_rate gauge',
    `legacyguard_rag_cache_hit_rate ${rag.cacheHitRate.toFixed(4)}`,
    '',
    '# HELP legacyguard_rag_latency_ms RAG search latency',
    '# TYPE legacyguard_rag_latency_ms summary',
    `legacyguard_rag_latency_ms{quantile="0.5"} ${rag.latency.p50Ms}`,
    `legacyguard_rag_latency_ms{quantile="0.95"} ${rag.latency.p95Ms}`,
    `legacyguard_rag_latency_ms{quantile="0.99"} ${rag.latency.p99Ms}`,
    '',
    '# HELP legacyguard_reranker_calls_total Total reranker calls',
    '# TYPE legacyguard_reranker_calls_total counter',
    `legacyguard_reranker_calls_total ${reranker.calls}`,
    '',
    '# HELP legacyguard_reranker_success_rate Reranker success rate',
    '# TYPE legacyguard_reranker_success_rate gauge',
    `legacyguard_reranker_success_rate ${reranker.successRate.toFixed(4)}`,
    '',
    '# HELP legacyguard_reranker_latency_ms Reranker latency',
    '# TYPE legacyguard_reranker_latency_ms summary',
    `legacyguard_reranker_latency_ms{quantile="0.5"} ${reranker.latency.p50Ms}`,
    `legacyguard_reranker_latency_ms{quantile="0.95"} ${reranker.latency.p95Ms}`,
    `legacyguard_reranker_latency_ms{quantile="0.99"} ${reranker.latency.p99Ms}`,
  ];

  return lines.join('\n');
}

// Full observability summary
export function getObservabilitySummary() {
  return {
    sandbox: getSandboxMetrics(),
    rag: getRAGMetrics(),
    reranker: getRerankerMetrics(),
    incidents: getMetricsSummary(),
    exportedAt: new Date().toISOString(),
  };
}

// Reset observability metrics (for testing)
export function resetObservabilityMetrics() {
  Object.assign(sandboxMetrics, {
    executions: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    snapshotsCreated: 0,
    snapshotsRestored: 0,
    runtimeCounts: {},
    latencies: [],
    lastUpdated: Date.now(),
  });

  Object.assign(ragMetrics, {
    searches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    emptyResults: 0,
    avgResultCount: 0,
    totalResultCount: 0,
    latencies: [],
    embeddingLatencies: [],
    lastUpdated: Date.now(),
  });

  Object.assign(rerankerMetrics, {
    calls: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    graphBoostApplied: 0,
    externalRerankerCalls: 0,
    latencies: [],
    boostDeltas: [],
    lastUpdated: Date.now(),
  });
}
