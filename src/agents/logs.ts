/**
 * LogsAgent - Agente especializado em análise de logs
 * 
 * Responsabilidades:
 * - Buscar logs de fontes configuradas
 * - Sanitizar PII antes de processar
 * - Correlacionar erros com código
 * - Gerar insights e recomendações
 */

import OpenAI from 'openai';
import { createLogProvider, type LogQuery, type LogQueryResult, type LogSourceConfig } from '../lib/log-providers';
import { createLogSummaryForLLM, sanitizePII } from '../lib/pii-sanitizer';

export interface LogsAgentInput {
  sourceConfig: LogSourceConfig;
  userQuery: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  service?: string;
  level?: 'error' | 'warn' | 'info' | 'debug' | 'all';
  maxResults?: number;
  repoContext?: string; // Contexto do repositório para correlacionar
}

export interface LogsAgentOutput {
  summary: string;
  insights: string[];
  recommendations: string[];
  errorPatterns?: {
    pattern: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    possibleCauses: string[];
  }[];
  relatedCode?: {
    file: string;
    line?: number;
    suggestion: string;
  }[];
  rawLogs?: string; // Logs sanitizados para contexto
  metadata: {
    logsAnalyzed: number;
    timeRange: { start: Date; end: Date };
    executionTimeMs: number;
    piiSanitized: boolean;
    piiTypesFound: string[];
  };
}

const LOGS_AGENT_SYSTEM_PROMPT = `Você é um especialista em análise de logs de sistemas legados.

Sua tarefa é analisar logs fornecidos e:
1. Identificar padrões de erro e suas possíveis causas
2. Correlacionar erros com código quando contexto do repositório estiver disponível
3. Sugerir ações corretivas específicas
4. Priorizar issues por impacto e frequência

Regras:
- NUNCA exponha dados sensíveis (já foram sanitizados, mas confirme)
- Seja específico nas recomendações
- Cite linhas de log específicas quando relevante
- Considere o contexto de sistema legado (código antigo, dependências desatualizadas)

Formato de resposta:
- Comece com um resumo executivo
- Liste os principais problemas encontrados
- Forneça recomendações acionáveis
- Se houver contexto de código, sugira arquivos/linhas a modificar`;

export async function runLogsAgent(input: LogsAgentInput): Promise<LogsAgentOutput> {
  const startTime = Date.now();
  
  // Criar provider e buscar logs
  const provider = createLogProvider(input.sourceConfig.provider, input.sourceConfig as unknown as Record<string, unknown>);
  
  // Definir time range (padrão: últimas 24 horas)
  const timeRange = input.timeRange || {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: new Date(),
  };
  
  const query: LogQuery = {
    query: input.userQuery || '*',
    service: input.service,
    level: input.level || 'error',
    startTime: timeRange.start,
    endTime: timeRange.end,
    limit: input.maxResults || 100,
  };
  
  let logResult: LogQueryResult;
  try {
    logResult = await provider.queryLogs(query);
  } catch (error) {
    return {
      summary: `Erro ao consultar logs: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      insights: [],
      recommendations: ['Verifique as credenciais da fonte de logs', 'Confirme que o serviço está acessível'],
      metadata: {
        logsAnalyzed: 0,
        timeRange,
        executionTimeMs: Date.now() - startTime,
        piiSanitized: false,
        piiTypesFound: [],
      },
    };
  }
  
  if (logResult.logs.length === 0) {
    return {
      summary: 'Nenhum log encontrado para os critérios especificados.',
      insights: ['Não há erros registrados no período'],
      recommendations: ['Verifique se o filtro de busca está correto', 'Considere expandir o período de busca'],
      metadata: {
        logsAnalyzed: 0,
        timeRange,
        executionTimeMs: Date.now() - startTime,
        piiSanitized: true,
        piiTypesFound: logResult.piiTypesFound,
      },
    };
  }
  
  // Preparar logs para análise
  const logMessages = logResult.logs.map(l => 
    `[${l.timestamp.toISOString()}] [${l.level}] ${l.service ? `[${l.service}]` : ''} ${l.message}`
  );
  
  const logSummary = createLogSummaryForLLM(logMessages, {
    maxLines: 50,
    maxCharsPerLine: 500,
    maxTotalChars: 8000,
  });
  
  // Construir prompt para análise
  let analysisPrompt = `Analise os seguintes logs:\n\n${logSummary}`;
  
  if (input.repoContext) {
    const sanitizedContext = sanitizePII(input.repoContext);
    analysisPrompt += `\n\n--- CONTEXTO DO REPOSITÓRIO ---\n${sanitizedContext.sanitized}`;
  }
  
  if (input.userQuery && input.userQuery !== '*') {
    analysisPrompt += `\n\nO usuário está investigando especificamente: "${input.userQuery}"`;
  }
  
  // Chamar LLM para análise
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHEAP_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: LOGS_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: analysisPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  
  const analysis = response.choices[0]?.message?.content || '';
  
  // Extrair seções da análise
  const insights = extractListItems(analysis, ['insight', 'problema', 'issue', 'encontrado']);
  const recommendations = extractListItems(analysis, ['recomend', 'sugest', 'ação', 'corrigir']);
  
  // Identificar padrões de erro
  const errorPatterns = identifyErrorPatterns(logResult.logs);
  
  return {
    summary: extractSummary(analysis),
    insights: insights.length > 0 ? insights : ['Análise concluída - veja o resumo'],
    recommendations: recommendations.length > 0 ? recommendations : ['Revise os logs detalhados para mais contexto'],
    errorPatterns,
    rawLogs: logSummary,
    metadata: {
      logsAnalyzed: logResult.logs.length,
      timeRange,
      executionTimeMs: Date.now() - startTime,
      piiSanitized: true,
      piiTypesFound: logResult.piiTypesFound,
    },
  };
}

/**
 * Extrai itens de lista de uma análise de texto
 */
function extractListItems(text: string, keywords: string[]): string[] {
  const lines = text.split('\n');
  const items: string[] = [];
  
  let inRelevantSection = false;
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Detectar seção relevante
    if (keywords.some(k => lowerLine.includes(k))) {
      inRelevantSection = true;
    }
    
    // Extrair itens de lista
    if (inRelevantSection) {
      const listMatch = line.match(/^[\s]*[-•*]\s*(.+)$/);
      const numberedMatch = line.match(/^[\s]*\d+[.)]\s*(.+)$/);
      
      if (listMatch) {
        items.push(listMatch[1].trim());
      } else if (numberedMatch) {
        items.push(numberedMatch[1].trim());
      }
    }
    
    // Sair da seção em linha vazia após coletar itens
    if (inRelevantSection && line.trim() === '' && items.length > 0) {
      break;
    }
  }
  
  return items.slice(0, 5); // Limitar a 5 itens
}

/**
 * Extrai resumo do início da análise
 */
function extractSummary(text: string): string {
  const lines = text.split('\n').filter(l => l.trim());
  
  // Procurar por parágrafo inicial ou seção "resumo"
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (line.length > 50 && !line.startsWith('#') && !line.startsWith('-')) {
      return line.trim();
    }
    if (line.toLowerCase().includes('resumo') && i + 1 < lines.length) {
      return lines[i + 1].trim();
    }
  }
  
  return lines[0] || 'Análise de logs concluída.';
}

/**
 * Identifica padrões de erro nos logs
 */
function identifyErrorPatterns(logs: Array<{ timestamp: Date; level: string; message: string }>): Array<{
  pattern: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  possibleCauses: string[];
}> {
  const patterns = new Map<string, {
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    messages: string[];
  }>();
  
  for (const log of logs) {
    if (log.level === 'error' || log.level === 'warn') {
      // Normalizar mensagem para encontrar padrões
      const pattern = normalizeLogMessage(log.message);
      
      const existing = patterns.get(pattern) || {
        count: 0,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        messages: [],
      };
      
      existing.count++;
      if (log.timestamp < existing.firstSeen) existing.firstSeen = log.timestamp;
      if (log.timestamp > existing.lastSeen) existing.lastSeen = log.timestamp;
      if (existing.messages.length < 3) existing.messages.push(log.message);
      
      patterns.set(pattern, existing);
    }
  }
  
  // Converter para array e ordenar por frequência
  return Array.from(patterns.entries())
    .filter(([_, data]) => data.count >= 2) // Só padrões que aparecem 2+ vezes
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10) // Top 10 padrões
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      possibleCauses: inferPossibleCauses(pattern),
    }));
}

/**
 * Normaliza mensagem de log para identificar padrões
 */
function normalizeLogMessage(message: string): string {
  return message
    // Remover timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]')
    // Remover IDs/UUIDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
    // Remover números longos (IDs, etc)
    .replace(/\b\d{6,}\b/g, '[ID]')
    // Remover paths específicos
    .replace(/\/[a-zA-Z0-9/_-]+\.[a-z]+/g, '[PATH]')
    // Remover URLs
    .replace(/https?:\/\/[^\s]+/g, '[URL]')
    // Truncar para padrão
    .slice(0, 200);
}

/**
 * Infere possíveis causas baseado no padrão de erro
 */
function inferPossibleCauses(pattern: string): string[] {
  const causes: string[] = [];
  const lowerPattern = pattern.toLowerCase();
  
  if (lowerPattern.includes('timeout')) {
    causes.push('Serviço externo lento ou indisponível');
    causes.push('Configuração de timeout muito baixa');
  }
  
  if (lowerPattern.includes('connection') || lowerPattern.includes('connect')) {
    causes.push('Problema de conectividade de rede');
    causes.push('Serviço destino indisponível');
  }
  
  if (lowerPattern.includes('memory') || lowerPattern.includes('heap')) {
    causes.push('Vazamento de memória');
    causes.push('Limite de memória insuficiente');
  }
  
  if (lowerPattern.includes('null') || lowerPattern.includes('undefined')) {
    causes.push('Dados não inicializados');
    causes.push('Resposta de API incompleta');
  }
  
  if (lowerPattern.includes('permission') || lowerPattern.includes('denied') || lowerPattern.includes('unauthorized')) {
    causes.push('Credenciais inválidas ou expiradas');
    causes.push('Permissões insuficientes');
  }
  
  if (lowerPattern.includes('database') || lowerPattern.includes('sql')) {
    causes.push('Conexão com banco de dados falhou');
    causes.push('Query malformada ou timeout');
  }
  
  return causes.length > 0 ? causes : ['Requer análise manual detalhada'];
}

export default {
  runLogsAgent,
};
