/**
 * Log Providers - Integrações com serviços de logs externos
 * 
 * Providers suportados:
 * - Datadog
 * - AWS CloudWatch (futuro)
 * - Papertrail (futuro)
 * - Sentry (futuro)
 */

import { sanitizeLogLines, type PIIType } from './pii-sanitizer';

export type LogProvider = 'datadog' | 'cloudwatch' | 'papertrail' | 'sentry' | 'logtail';

export interface LogSourceConfig {
  provider: LogProvider;
  name: string;
  
  // Datadog
  datadogApiKey?: string;
  datadogAppKey?: string;
  datadogSite?: string; // 'datadoghq.com', 'datadoghq.eu', etc.
  
  // CloudWatch
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  logGroupName?: string;
  
  // Comum
  serviceFilter?: string;
  environment?: string;
  maxResults?: number;
}

export interface LogQuery {
  query?: string;        // Query de busca
  service?: string;      // Filtro por serviço
  level?: 'error' | 'warn' | 'info' | 'debug' | 'all';
  startTime: Date;
  endTime: Date;
  limit?: number;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  service?: string;
  host?: string;
  attributes?: Record<string, unknown>;
}

export interface LogQueryResult {
  logs: LogEntry[];
  totalCount: number;
  hasMore: boolean;
  query: LogQuery;
  executionTimeMs: number;
  sanitized: boolean;
  piiTypesFound: PIIType[];
}

/**
 * Interface base para providers de log
 */
export interface ILogProvider {
  name: LogProvider;
  testConnection(): Promise<{ success: boolean; message: string }>;
  queryLogs(query: LogQuery): Promise<LogQueryResult>;
  getServices(): Promise<string[]>;
}

/**
 * Provider do Datadog
 */
export class DatadogProvider implements ILogProvider {
  name: LogProvider = 'datadog';
  private apiKey: string;
  private appKey: string;
  private site: string;

  constructor(config: LogSourceConfig) {
    if (!config.datadogApiKey || !config.datadogAppKey) {
      throw new Error('Datadog requires apiKey and appKey');
    }
    this.apiKey = config.datadogApiKey;
    this.appKey = config.datadogAppKey;
    this.site = config.datadogSite || 'datadoghq.com';
  }

  private get baseUrl(): string {
    return `https://api.${this.site}`;
  }

  private get headers(): Record<string, string> {
    return {
      'DD-API-KEY': this.apiKey,
      'DD-APPLICATION-KEY': this.appKey,
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/validate`, {
        method: 'GET',
        headers: this.headers,
      });

      if (response.ok) {
        return { success: true, message: 'Conexão com Datadog validada com sucesso' };
      }

      const error = await response.json().catch(() => ({}));
      return {
        success: false,
        message: error.errors?.[0] || `Erro HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro de conexão',
      };
    }
  }

  async queryLogs(query: LogQuery): Promise<LogQueryResult> {
    const startTime = Date.now();
    
    // Construir query do Datadog
    let ddQuery = query.query || '*';
    
    if (query.service) {
      ddQuery = `service:${query.service} ${ddQuery}`;
    }
    
    if (query.level && query.level !== 'all') {
      ddQuery = `status:${query.level} ${ddQuery}`;
    }

    const body = {
      filter: {
        query: ddQuery,
        from: query.startTime.toISOString(),
        to: query.endTime.toISOString(),
      },
      sort: 'timestamp',
      page: {
        limit: Math.min(query.limit || 100, 100), // Max 100 por requisição
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/v2/logs/events/search`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.errors?.[0]?.detail || `Erro HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Mapear logs do Datadog para formato interno
      const logs: LogEntry[] = (data.data || []).map((log: any) => ({
        timestamp: new Date(log.attributes?.timestamp || Date.now()),
        level: log.attributes?.status || 'info',
        message: log.attributes?.message || '',
        service: log.attributes?.service || undefined,
        host: log.attributes?.host || undefined,
        attributes: log.attributes?.attributes || {},
      }));

      // Sanitizar PII
      const messages = logs.map(l => l.message);
      const { lines: sanitizedMessages, piiTypes } = sanitizeLogLines(messages);
      
      logs.forEach((log, i) => {
        log.message = sanitizedMessages[i];
      });

      return {
        logs,
        totalCount: data.meta?.page?.after ? logs.length + 1 : logs.length,
        hasMore: !!data.meta?.page?.after,
        query,
        executionTimeMs: Date.now() - startTime,
        sanitized: true,
        piiTypesFound: piiTypes,
      };
    } catch (error) {
      throw new Error(`Erro ao consultar Datadog: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async getServices(): Promise<string[]> {
    try {
      // Usar API de métricas para listar serviços conhecidos
      const response = await fetch(`${this.baseUrl}/api/v1/tags/hosts`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      // Extrair serviços únicos das tags
      const services = new Set<string>();
      Object.values(data.tags || {}).forEach((tags: any) => {
        if (Array.isArray(tags)) {
          tags.filter((t: string) => t.startsWith('service:')).forEach((t: string) => {
            services.add(t.replace('service:', ''));
          });
        }
      });

      return Array.from(services).sort();
    } catch {
      return [];
    }
  }
}

/**
 * Provider do AWS CloudWatch (placeholder para implementação futura)
 */
export class CloudWatchProvider implements ILogProvider {
  name: LogProvider = 'cloudwatch';
  
  constructor(_config: LogSourceConfig) {
    // TODO: Implementar CloudWatch
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'CloudWatch provider não implementado ainda' };
  }

  async queryLogs(_query: LogQuery): Promise<LogQueryResult> {
    throw new Error('CloudWatch provider não implementado ainda');
  }

  async getServices(): Promise<string[]> {
    return [];
  }
}

/**
 * Factory para criar provider correto baseado na configuração
 */
export function createLogProvider(providerType: string, config: Record<string, unknown>): ILogProvider {
  // Converter config para LogSourceConfig
  const sourceConfig: LogSourceConfig = {
    provider: providerType as LogProvider,
    name: (config.name as string) || 'unknown',
    datadogApiKey: config.apiKey as string,
    datadogAppKey: config.appKey as string,
    datadogSite: (config.site as string) || 'datadoghq.com',
    awsAccessKeyId: config.accessKeyId as string,
    awsSecretAccessKey: config.secretAccessKey as string,
    awsRegion: config.region as string,
    logGroupName: config.logGroupName as string,
  };
  
  switch (providerType) {
    case 'datadog':
      return new DatadogProvider(sourceConfig);
    case 'cloudwatch':
      return new CloudWatchProvider(sourceConfig);
    default:
      throw new Error(`Provider ${providerType} não suportado`);
  }
}

/**
 * Lista de providers suportados
 */
export const LOG_PROVIDERS = ['datadog', 'cloudwatch', 'elasticsearch', 'splunk'] as const;

/**
 * Criptografia de configuração sensível
 */
export function encryptConfig(config: Record<string, unknown>, encryptionKey?: string): string {
  // Usar uma chave padrão se não fornecida (em produção, usar variável de ambiente)
  const key = encryptionKey || process.env.LOG_CONFIG_ENCRYPTION_KEY || 'legacyguard-default-key-change-in-prod';
  
  const json = JSON.stringify(config);
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = new TextEncoder().encode(json);
  
  const encrypted = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return Buffer.from(encrypted).toString('base64');
}

export function decryptConfig(encrypted: string, encryptionKey?: string): Record<string, unknown> {
  const key = encryptionKey || process.env.LOG_CONFIG_ENCRYPTION_KEY || 'legacyguard-default-key-change-in-prod';
  
  const encryptedBytes = Buffer.from(encrypted, 'base64');
  const keyBytes = new TextEncoder().encode(key);
  
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json);
}

export default {
  createLogProvider,
  encryptConfig,
  decryptConfig,
  DatadogProvider,
  CloudWatchProvider,
};
