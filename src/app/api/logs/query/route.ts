import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logEvent } from '@/lib/audit';
import { createLogProvider, type LogEntry, type LogQuery } from '@/lib/log-providers';
import { sanitizeLogLines, createLogSummaryForLLM } from '@/lib/pii-sanitizer';
import { getLogSource, getLogSourceConfig, getAllEnabledSources, updateLastUsed } from '../sources/route';

// Rate limiting por usuário
const queryRateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_QUERIES_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Cache de queries (em memória, TTL curto)
const queryCache = new Map<string, { result: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface QuerySourceResult {
  sourceId: string;
  sourceName: string;
  provider: string;
  count: number;
  error?: string;
  logs: LogEntry[];
}

/**
 * POST /api/logs/query
 * 
 * Executa uma query de logs em um ou mais providers.
 * Requer permissão: logs:read
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('logs:read');
  if (!auth.authorized) return auth.response;
  
  const userId = auth.user?.email || 'unknown';
  
  // Rate limiting
  const rateLimitKey = userId;
  const now = Date.now();
  const rateLimit = queryRateLimits.get(rateLimitKey);
  
  if (rateLimit) {
    if (now < rateLimit.resetAt) {
      if (rateLimit.count >= MAX_QUERIES_PER_MINUTE) {
        return NextResponse.json(
          { 
            error: 'Rate limit excedido',
            message: `Máximo de ${MAX_QUERIES_PER_MINUTE} queries por minuto`,
            retryAfter: Math.ceil((rateLimit.resetAt - now) / 1000)
          },
          { status: 429 }
        );
      }
      rateLimit.count++;
    } else {
      queryRateLimits.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
  } else {
    queryRateLimits.set(rateLimitKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }
  
  try {
    const body = await req.json();
    const { sourceId, query, timeRange, limit = 50, forLLM = false } = body;
    
    // Validação
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query é obrigatória' },
        { status: 400 }
      );
    }
    
    const effectiveLimit = Math.min(limit, 100);
    
    // Determinar fontes a consultar
    let sources: Array<{ id: string; name: string; provider: string }> = [];
    
    if (sourceId) {
      const source = getLogSource(sourceId);
      if (!source) {
        return NextResponse.json(
          { error: 'Fonte de logs não encontrada' },
          { status: 404 }
        );
      }
      if (!source.enabled) {
        return NextResponse.json(
          { error: 'Fonte de logs desabilitada' },
          { status: 400 }
        );
      }
      sources = [{ id: source.id, name: source.name, provider: source.provider }];
    } else {
      sources = getAllEnabledSources().map(s => ({
        id: s.id,
        name: s.name,
        provider: s.provider
      }));
      
      if (sources.length === 0) {
        return NextResponse.json(
          { error: 'Nenhuma fonte de logs configurada ou habilitada' },
          { status: 400 }
        );
      }
    }
    
    // Verificar cache
    const cacheKey = JSON.stringify({ sourceId, query, timeRange, limit: effectiveLimit });
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({
        ...cached.result as object,
        cached: true
      });
    }
    
    // Executar queries em paralelo
    const results: QuerySourceResult[] = await Promise.all(
      sources.map(async (source): Promise<QuerySourceResult> => {
        try {
          const config = getLogSourceConfig(source.id);
          if (!config) {
            return {
              sourceId: source.id,
              sourceName: source.name,
              provider: source.provider,
              count: 0,
              error: 'Configuração não encontrada',
              logs: [],
            };
          }
          
          const provider = createLogProvider(source.provider, config);
          
          // Testar conexão
          const connectionTest = await provider.testConnection();
          if (!connectionTest.success) {
            return {
              sourceId: source.id,
              sourceName: source.name,
              provider: source.provider,
              count: 0,
              error: connectionTest.message || 'Falha na conexão',
              logs: [],
            };
          }
          
          // Executar query
          const from = timeRange?.from ? new Date(timeRange.from) : new Date(Date.now() - 60 * 60 * 1000);
          const to = timeRange?.to ? new Date(timeRange.to) : new Date();
          
          const logQuery: LogQuery = {
            query,
            startTime: from,
            endTime: to,
            limit: effectiveLimit,
          };
          
          const queryResult = await provider.queryLogs(logQuery);
          
          // Atualizar last_used_at
          updateLastUsed(source.id);
          
          return {
            sourceId: source.id,
            sourceName: source.name,
            provider: source.provider,
            logs: queryResult.logs,
            count: queryResult.logs.length,
          };
          
        } catch (error) {
          console.error(`Error querying ${source.name}:`, error);
          return {
            sourceId: source.id,
            sourceName: source.name,
            provider: source.provider,
            count: 0,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            logs: [],
          };
        }
      })
    );
    
    // Combinar todos os logs
    const allLogs: LogEntry[] = results.flatMap(r => r.logs);
    
    // Converter messages para sanitização
    const messages = allLogs.map(log => 
      typeof log.message === 'string' ? log.message : String(log.message)
    );
    
    // Sanitizar PII
    const sanitizedResult = sanitizeLogLines(messages);
    
    // Audit log
    await logEvent({
      action: 'logs.query.executed',
      severity: 'info',
      message: `Log query executed: ${query.substring(0, 100)}`,
      metadata: {
        query: query.substring(0, 200),
        sources: sources.map(s => s.name),
        resultCount: allLogs.length,
        userId,
        piiSanitized: sanitizedResult.totalPIIDetected,
      },
    });
    
    // Preparar resposta
    let response: Record<string, unknown>;
    
    if (forLLM) {
      // Retornar resumo sanitizado para LLM
      const summary = createLogSummaryForLLM(sanitizedResult.lines, {
        maxLines: effectiveLimit,
      });
      
      response = {
        summary,
        piiWarning: sanitizedResult.totalPIIDetected > 0
          ? `${sanitizedResult.totalPIIDetected} itens de PII foram sanitizados`
          : null,
        sources: results.map(r => ({
          name: r.sourceName,
          provider: r.provider,
          count: r.count,
          error: r.error,
        })),
        totalLogs: allLogs.length,
        timeRange: {
          from: timeRange?.from || new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          to: timeRange?.to || new Date().toISOString(),
        },
      };
    } else {
      // Criar mapa de mensagens sanitizadas por índice global
      let globalIdx = 0;
      const sanitizedResults = results.map(r => {
        const sanitizedLogs = r.logs.map((log) => {
          const sanitizedMessage = sanitizedResult.lines[globalIdx] || log.message;
          globalIdx++;
          return {
            timestamp: log.timestamp,
            level: log.level,
            message: sanitizedMessage,
            service: log.service,
            attributes: log.attributes,
          };
        });
        
        return {
          sourceId: r.sourceId,
          sourceName: r.sourceName,
          provider: r.provider,
          count: r.count,
          error: r.error,
          logs: sanitizedLogs,
        };
      });
      
      response = {
        results: sanitizedResults,
        piiSanitized: sanitizedResult.totalPIIDetected,
        totalLogs: allLogs.length,
        query,
        timeRange: {
          from: timeRange?.from || new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          to: timeRange?.to || new Date().toISOString(),
        },
      };
    }
    
    // Cachear resultado
    queryCache.set(cacheKey, {
      result: response,
      expiresAt: now + CACHE_TTL_MS,
    });
    
    // Limpar cache expirado periodicamente
    if (Math.random() < 0.1) {
      cleanExpiredCache();
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error executing log query:', error);
    
    await logEvent({
      action: 'logs.query.error',
      severity: 'error',
      message: 'Log query failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      },
    });
    
    return NextResponse.json(
      { error: 'Erro ao executar query de logs' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/logs/query
 * 
 * Lista os providers de logs disponíveis.
 */
export async function GET() {
  const auth = await requirePermission('logs:read');
  if (!auth.authorized) return auth.response;
  
  return NextResponse.json({
    providers: [
      {
        id: 'datadog',
        name: 'Datadog',
        description: 'Logs do Datadog via API',
        configFields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'appKey', label: 'Application Key', type: 'password', required: true },
          { name: 'site', label: 'Site', type: 'text', required: false, default: 'datadoghq.com' },
        ],
      },
      {
        id: 'cloudwatch',
        name: 'AWS CloudWatch',
        description: 'CloudWatch Logs via AWS SDK',
        configFields: [
          { name: 'accessKeyId', label: 'Access Key ID', type: 'password', required: true },
          { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true },
          { name: 'region', label: 'Region', type: 'text', required: true },
        ],
        status: 'coming_soon',
      },
      {
        id: 'elasticsearch',
        name: 'Elasticsearch',
        description: 'Logs do Elasticsearch/OpenSearch',
        configFields: [
          { name: 'url', label: 'URL', type: 'text', required: true },
          { name: 'username', label: 'Username', type: 'text', required: false },
          { name: 'password', label: 'Password', type: 'password', required: false },
        ],
        status: 'coming_soon',
      },
      {
        id: 'splunk',
        name: 'Splunk',
        description: 'Logs do Splunk via REST API',
        configFields: [
          { name: 'url', label: 'URL', type: 'text', required: true },
          { name: 'token', label: 'Bearer Token', type: 'password', required: true },
        ],
        status: 'coming_soon',
      },
    ],
  });
}

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of queryCache.entries()) {
    if (value.expiresAt < now) {
      queryCache.delete(key);
    }
  }
}
