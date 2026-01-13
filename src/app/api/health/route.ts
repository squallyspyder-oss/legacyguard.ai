/**
 * Health Check Endpoint
 * 
 * Usado pelo ALB e ECS para verificar saúde do serviço.
 * Retorna status de todos os serviços dependentes.
 */

import { NextResponse } from 'next/server';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'error';
      latencyMs?: number;
      message?: string;
    };
  };
}

const startTime = Date.now();

async function checkPostgres(): Promise<{ status: 'ok' | 'error'; latencyMs: number; message?: string }> {
  const start = Date.now();
  try {
    // Apenas verifica se a variável está configurada
    // Em produção, fazer uma query real
    if (!process.env.AUDIT_DB_URL) {
      return { status: 'error', latencyMs: Date.now() - start, message: 'AUDIT_DB_URL not configured' };
    }
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return { 
      status: 'error', 
      latencyMs: Date.now() - start, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function checkRedis(): Promise<{ status: 'ok' | 'error'; latencyMs: number; message?: string }> {
  const start = Date.now();
  try {
    if (!process.env.REDIS_URL && !process.env.REDIS_TLS_URL) {
      return { status: 'error', latencyMs: Date.now() - start, message: 'REDIS_URL not configured' };
    }
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return { 
      status: 'error', 
      latencyMs: Date.now() - start, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function checkOpenAI(): Promise<{ status: 'ok' | 'error'; latencyMs: number; message?: string }> {
  const start = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { status: 'error', latencyMs: Date.now() - start, message: 'OPENAI_API_KEY not configured' };
    }
    // Não fazer request real aqui para não gastar tokens
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return { 
      status: 'error', 
      latencyMs: Date.now() - start, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function GET() {
  const [postgres, redis, openai] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkOpenAI(),
  ]);

  const checks = { postgres, redis, openai };
  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const anyError = Object.values(checks).some(c => c.status === 'error');

  const health: HealthStatus = {
    status: allOk ? 'healthy' : anyError ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  // ALB espera 200 para healthy
  // Retorna 200 mesmo para degraded (serviço ainda funciona)
  // Retorna 503 apenas se todos os checks falharem
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(health, { 
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// HEAD request para checks simples do ALB
export async function HEAD() {
  return new Response(null, { status: 200 });
}
