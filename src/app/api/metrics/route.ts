import { NextRequest, NextResponse } from 'next/server';
import { 
  getMetricsSummary,
  getObservabilitySummary, 
  getPrometheusMetrics,
  getSandboxMetrics,
  getRAGMetrics,
  getRerankerMetrics,
} from '@/lib/metrics';

/**
 * API de Métricas de Observabilidade
 * 
 * GET /api/metrics - Métricas completas em JSON
 * GET /api/metrics?format=prometheus - Formato Prometheus
 * GET /api/metrics?category=sandbox - Apenas sandbox
 * GET /api/metrics?category=rag - Apenas RAG
 * GET /api/metrics?category=reranker - Apenas reranker
 * GET /api/metrics?category=incidents - Apenas incidents (legacy)
 * 
 * Requires: admin role ou METRICS_API_KEY
 */

export async function GET(req: NextRequest) {
  // Check authorization
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.METRICS_API_KEY;
  
  // Allow access if no key configured (dev mode) or key matches
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');
  const category = searchParams.get('category');

  // Prometheus format
  if (format === 'prometheus') {
    return new NextResponse(getPrometheusMetrics(), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  // Category filter
  if (category) {
    switch (category) {
      case 'sandbox':
        return NextResponse.json(getSandboxMetrics());
      case 'rag':
        return NextResponse.json(getRAGMetrics());
      case 'reranker':
        return NextResponse.json(getRerankerMetrics());
      case 'incidents':
        return NextResponse.json(getMetricsSummary());
      default:
        return NextResponse.json(
          { error: `Unknown category: ${category}. Valid: sandbox, rag, reranker, incidents` },
          { status: 400 }
        );
    }
  }

  // Full summary
  return NextResponse.json(getObservabilitySummary());
}
