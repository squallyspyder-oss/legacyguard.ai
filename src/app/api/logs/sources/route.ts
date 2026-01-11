import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logEvent } from '@/lib/audit';
import { encryptConfig, decryptConfig, LOG_PROVIDERS } from '@/lib/log-providers';
import { randomUUID } from 'crypto';

// In-memory store for demo (use PostgreSQL in production)
// TODO: Replace with PostgreSQL using scripts/log_sources_schema.sql
interface LogSourceRecord {
  id: string;
  name: string;
  provider: string;
  encrypted_config: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  last_used_at: string | null;
}

const logSourcesStore = new Map<string, LogSourceRecord>();

/**
 * GET /api/logs/sources
 * 
 * Lista todas as fontes de logs configuradas.
 * Requer permissão: logs:read
 */
export async function GET() {
  const auth = await requirePermission('logs:read');
  if (!auth.authorized) return auth.response;
  
  try {
    const sources = Array.from(logSourcesStore.values()).map(source => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      enabled: source.enabled,
      created_at: source.created_at,
      updated_at: source.updated_at,
      last_used_at: source.last_used_at,
      // Nunca retorna config descriptografada
    }));
    
    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Error listing log sources:', error);
    return NextResponse.json(
      { error: 'Erro ao listar fontes de logs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/logs/sources
 * 
 * Cria uma nova fonte de logs.
 * Requer permissão: logs:configure
 * 
 * Body:
 * {
 *   name: string,
 *   provider: 'datadog' | 'cloudwatch' | 'elasticsearch' | 'splunk',
 *   config: { apiKey, appKey, site, ... } // específico do provider
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('logs:configure');
  if (!auth.authorized) return auth.response;
  
  try {
    const body = await req.json();
    const { name, provider, config } = body;
    
    // Validação
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Nome é obrigatório' },
        { status: 400 }
      );
    }
    
    if (!provider || !LOG_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Provider inválido. Opções: ${LOG_PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }
    
    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { error: 'Configuração é obrigatória' },
        { status: 400 }
      );
    }
    
    // Validar config específica do provider
    const validationError = validateProviderConfig(provider, config);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }
    
    // Criptografar config
    const encryptedConfig = encryptConfig(config);
    
    // Criar registro
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: LogSourceRecord = {
      id,
      name,
      provider,
      encrypted_config: encryptedConfig,
      enabled: true,
      created_at: now,
      updated_at: now,
      created_by: auth.user?.email || 'unknown',
      last_used_at: null,
    };
    
    logSourcesStore.set(id, record);
    
    // Audit log
    await logEvent({
      action: 'logs.source.created',
      severity: 'info',
      message: `Log source created: ${name} (${provider})`,
      metadata: {
        sourceId: id,
        provider,
        userId: auth.user?.email,
      },
    });
    
    return NextResponse.json({
      id,
      name,
      provider,
      enabled: true,
      created_at: now,
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating log source:', error);
    return NextResponse.json(
      { error: 'Erro ao criar fonte de logs' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/logs/sources?id=xxx
 * 
 * Remove uma fonte de logs.
 * Requer permissão: logs:configure
 */
export async function DELETE(req: NextRequest) {
  const auth = await requirePermission('logs:configure');
  if (!auth.authorized) return auth.response;
  
  try {
    const id = req.nextUrl.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID é obrigatório' },
        { status: 400 }
      );
    }
    
    const source = logSourcesStore.get(id);
    if (!source) {
      return NextResponse.json(
        { error: 'Fonte de logs não encontrada' },
        { status: 404 }
      );
    }
    
    logSourcesStore.delete(id);
    
    // Audit log
    await logEvent({
      action: 'logs.source.deleted',
      severity: 'warn',
      message: `Log source deleted: ${source.name} (${source.provider})`,
      metadata: {
        sourceId: id,
        provider: source.provider,
        userId: auth.user?.email,
      },
    });
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting log source:', error);
    return NextResponse.json(
      { error: 'Erro ao remover fonte de logs' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/logs/sources
 * 
 * Atualiza uma fonte de logs (habilitar/desabilitar).
 * Requer permissão: logs:configure
 * 
 * Body:
 * {
 *   id: string,
 *   enabled?: boolean,
 *   name?: string
 * }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requirePermission('logs:configure');
  if (!auth.authorized) return auth.response;
  
  try {
    const body = await req.json();
    const { id, enabled, name } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID é obrigatório' },
        { status: 400 }
      );
    }
    
    const source = logSourcesStore.get(id);
    if (!source) {
      return NextResponse.json(
        { error: 'Fonte de logs não encontrada' },
        { status: 404 }
      );
    }
    
    // Atualizar campos
    if (typeof enabled === 'boolean') {
      source.enabled = enabled;
    }
    if (typeof name === 'string' && name.trim()) {
      source.name = name.trim();
    }
    source.updated_at = new Date().toISOString();
    
    logSourcesStore.set(id, source);
    
    // Audit log
    await logEvent({
      action: 'logs.source.updated',
      severity: 'info',
      message: `Log source updated: ${source.name}`,
      metadata: {
        sourceId: id,
        enabled: source.enabled,
        userId: auth.user?.email,
      },
    });
    
    return NextResponse.json({
      id: source.id,
      name: source.name,
      provider: source.provider,
      enabled: source.enabled,
      updated_at: source.updated_at,
    });
    
  } catch (error) {
    console.error('Error updating log source:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar fonte de logs' },
      { status: 500 }
    );
  }
}

// Helper para exportar store para uso no query endpoint
export function getLogSource(id: string): LogSourceRecord | undefined {
  return logSourcesStore.get(id);
}

export function getLogSourceConfig(id: string): Record<string, unknown> | null {
  const source = logSourcesStore.get(id);
  if (!source) return null;
  return decryptConfig(source.encrypted_config);
}

export function getAllEnabledSources(): LogSourceRecord[] {
  return Array.from(logSourcesStore.values()).filter(s => s.enabled);
}

export function updateLastUsed(id: string): void {
  const source = logSourcesStore.get(id);
  if (source) {
    source.last_used_at = new Date().toISOString();
    logSourcesStore.set(id, source);
  }
}

// Validação de config por provider
function validateProviderConfig(provider: string, config: Record<string, unknown>): string | null {
  switch (provider) {
    case 'datadog':
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        return 'Datadog requer apiKey';
      }
      if (!config.appKey || typeof config.appKey !== 'string') {
        return 'Datadog requer appKey';
      }
      if (config.site && typeof config.site !== 'string') {
        return 'site deve ser uma string (ex: datadoghq.com)';
      }
      break;
      
    case 'cloudwatch':
      if (!config.accessKeyId || typeof config.accessKeyId !== 'string') {
        return 'CloudWatch requer accessKeyId';
      }
      if (!config.secretAccessKey || typeof config.secretAccessKey !== 'string') {
        return 'CloudWatch requer secretAccessKey';
      }
      if (!config.region || typeof config.region !== 'string') {
        return 'CloudWatch requer region';
      }
      break;
      
    case 'elasticsearch':
      if (!config.url || typeof config.url !== 'string') {
        return 'Elasticsearch requer url';
      }
      break;
      
    case 'splunk':
      if (!config.url || typeof config.url !== 'string') {
        return 'Splunk requer url';
      }
      if (!config.token || typeof config.token !== 'string') {
        return 'Splunk requer token';
      }
      break;
      
    default:
      return `Provider não suportado: ${provider}`;
  }
  
  return null;
}
