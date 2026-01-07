/**
 * Tests for C.2 Observability Metrics
 * 
 * Validates:
 * 1. Sandbox metrics recording and retrieval
 * 2. RAG metrics recording and retrieval
 * 3. Reranker metrics recording and retrieval
 * 4. Prometheus format export
 * 5. Percentile calculations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSandboxExecution,
  getSandboxMetrics,
  recordRAGSearch,
  getRAGMetrics,
  recordRerankerCall,
  getRerankerMetrics,
  getPrometheusMetrics,
  getObservabilitySummary,
  resetObservabilityMetrics,
} from '../src/lib/metrics';

describe('Sandbox Metrics', () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it('should record successful execution', () => {
    recordSandboxExecution({
      outcome: 'success',
      runtime: 'docker',
      latencyMs: 150,
    });

    const metrics = getSandboxMetrics();
    expect(metrics.executions).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.failureRate).toBe(0);
  });

  it('should track runtime distribution', () => {
    recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: 100 });
    recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: 120 });
    recordSandboxExecution({ outcome: 'success', runtime: 'runsc', latencyMs: 200 });

    const metrics = getSandboxMetrics();
    expect(metrics.runtimeDistribution.docker).toBe(2);
    expect(metrics.runtimeDistribution.runsc).toBe(1);
  });

  it('should calculate latency percentiles', () => {
    // Add latencies from 10 to 100
    for (let i = 1; i <= 10; i++) {
      recordSandboxExecution({
        outcome: 'success',
        runtime: 'docker',
        latencyMs: i * 10,
      });
    }

    const metrics = getSandboxMetrics();
    expect(metrics.latency.avgMs).toBe(55); // (10+20+...+100)/10 = 550/10
    expect(metrics.latency.p50Ms).toBe(55); // Median of 10 values: (50+60)/2 = 55
    expect(metrics.latency.samples).toBe(10);
  });

  it('should track snapshots', () => {
    recordSandboxExecution({
      outcome: 'success',
      runtime: 'docker',
      latencyMs: 100,
      snapshotCreated: true,
    });
    recordSandboxExecution({
      outcome: 'failure',
      runtime: 'docker',
      latencyMs: 50,
      snapshotRestored: true,
    });

    const metrics = getSandboxMetrics();
    expect(metrics.snapshots.created).toBe(1);
    expect(metrics.snapshots.restored).toBe(1);
  });

  it('should track failure and timeout rates', () => {
    recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: 100 });
    recordSandboxExecution({ outcome: 'failure', runtime: 'docker', latencyMs: 50 });
    recordSandboxExecution({ outcome: 'timeout', runtime: 'docker', latencyMs: 30000 });

    const metrics = getSandboxMetrics();
    expect(metrics.executions).toBe(3);
    expect(metrics.successRate).toBeCloseTo(1/3, 2);
    expect(metrics.failureRate).toBeCloseTo(1/3, 2);
    expect(metrics.timeoutRate).toBeCloseTo(1/3, 2);
  });
});

describe('RAG Metrics', () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it('should record search with cache hit', () => {
    recordRAGSearch({
      latencyMs: 50,
      resultCount: 10,
      cacheHit: true,
    });

    const metrics = getRAGMetrics();
    expect(metrics.searches).toBe(1);
    expect(metrics.cacheHitRate).toBe(1);
  });

  it('should track empty results', () => {
    recordRAGSearch({ latencyMs: 30, resultCount: 0, cacheHit: false });
    recordRAGSearch({ latencyMs: 40, resultCount: 5, cacheHit: false });

    const metrics = getRAGMetrics();
    expect(metrics.emptyResultRate).toBe(0.5);
  });

  it('should calculate average result count', () => {
    recordRAGSearch({ latencyMs: 30, resultCount: 10, cacheHit: false });
    recordRAGSearch({ latencyMs: 40, resultCount: 20, cacheHit: false });
    recordRAGSearch({ latencyMs: 50, resultCount: 15, cacheHit: false });

    const metrics = getRAGMetrics();
    expect(metrics.avgResultCount).toBe(15);
  });

  it('should track embedding latency separately', () => {
    recordRAGSearch({ latencyMs: 100, embeddingLatencyMs: 30, resultCount: 5, cacheHit: false });
    recordRAGSearch({ latencyMs: 120, embeddingLatencyMs: 40, resultCount: 5, cacheHit: false });

    const metrics = getRAGMetrics();
    expect(metrics.embeddingLatency.avgMs).toBe(35);
    expect(metrics.embeddingLatency.samples).toBe(2);
  });
});

describe('Reranker Metrics', () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it('should record successful rerank with graph boost', () => {
    recordRerankerCall({
      outcome: 'success',
      latencyMs: 25,
      graphBoostApplied: true,
      externalReranker: false,
      avgBoostDelta: 0.15,
    });

    const metrics = getRerankerMetrics();
    expect(metrics.calls).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.graphBoostRate).toBe(1);
    expect(metrics.externalRerankerRate).toBe(0);
    expect(metrics.avgBoostDelta).toBe(0.15);
  });

  it('should track external reranker usage', () => {
    recordRerankerCall({
      outcome: 'success',
      latencyMs: 100,
      graphBoostApplied: true,
      externalReranker: true,
    });
    recordRerankerCall({
      outcome: 'success',
      latencyMs: 20,
      graphBoostApplied: true,
      externalReranker: false,
    });

    const metrics = getRerankerMetrics();
    expect(metrics.externalRerankerRate).toBe(0.5);
  });

  it('should track timeout rate', () => {
    recordRerankerCall({ outcome: 'success', latencyMs: 20, graphBoostApplied: false, externalReranker: false });
    recordRerankerCall({ outcome: 'timeout', latencyMs: 3000, graphBoostApplied: false, externalReranker: true });

    const metrics = getRerankerMetrics();
    expect(metrics.timeoutRate).toBe(0.5);
  });
});

describe('Prometheus Export', () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it('should export valid Prometheus format', () => {
    recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: 100 });
    recordRAGSearch({ latencyMs: 50, resultCount: 10, cacheHit: true });
    recordRerankerCall({ outcome: 'success', latencyMs: 25, graphBoostApplied: true, externalReranker: false });

    const prometheus = getPrometheusMetrics();

    // Should have HELP and TYPE comments
    expect(prometheus).toContain('# HELP legacyguard_sandbox_executions_total');
    expect(prometheus).toContain('# TYPE legacyguard_sandbox_executions_total counter');
    expect(prometheus).toContain('legacyguard_sandbox_executions_total 1');

    // Should have RAG metrics
    expect(prometheus).toContain('legacyguard_rag_searches_total 1');
    expect(prometheus).toContain('legacyguard_rag_cache_hit_rate 1.0000');

    // Should have reranker metrics
    expect(prometheus).toContain('legacyguard_reranker_calls_total 1');
    expect(prometheus).toContain('legacyguard_reranker_success_rate 1.0000');
  });

  it('should include quantiles for latencies', () => {
    for (let i = 0; i < 100; i++) {
      recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: i + 1 });
    }

    const prometheus = getPrometheusMetrics();
    expect(prometheus).toContain('legacyguard_sandbox_latency_ms{quantile="0.5"}');
    expect(prometheus).toContain('legacyguard_sandbox_latency_ms{quantile="0.95"}');
    expect(prometheus).toContain('legacyguard_sandbox_latency_ms{quantile="0.99"}');
  });
});

describe('Observability Summary', () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it('should return full summary', () => {
    recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: 100 });
    recordRAGSearch({ latencyMs: 50, resultCount: 10, cacheHit: false });
    recordRerankerCall({ outcome: 'success', latencyMs: 25, graphBoostApplied: true, externalReranker: false });

    const summary = getObservabilitySummary();

    expect(summary.sandbox.executions).toBe(1);
    expect(summary.rag.searches).toBe(1);
    expect(summary.reranker.calls).toBe(1);
    expect(summary.incidents).toBeDefined();
    expect(summary.exportedAt).toBeDefined();
  });

  it('should handle empty metrics', () => {
    const summary = getObservabilitySummary();

    expect(summary.sandbox.executions).toBe(0);
    expect(summary.sandbox.successRate).toBe(0);
    expect(summary.rag.searches).toBe(0);
    expect(summary.reranker.calls).toBe(0);
  });
});

describe('Percentile Calculation Edge Cases', () => {
  beforeEach(() => {
    resetObservabilityMetrics();
  });

  it('should handle single value', () => {
    recordSandboxExecution({ outcome: 'success', runtime: 'docker', latencyMs: 100 });

    const metrics = getSandboxMetrics();
    expect(metrics.latency.p50Ms).toBe(100);
    expect(metrics.latency.p95Ms).toBe(100);
    expect(metrics.latency.p99Ms).toBe(100);
  });

  it('should handle empty latencies', () => {
    const metrics = getSandboxMetrics();
    expect(metrics.latency.p50Ms).toBe(0);
    expect(metrics.latency.avgMs).toBe(0);
  });
});
