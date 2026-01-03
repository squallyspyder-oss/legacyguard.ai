import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { checkRagStatus } from '@/lib/indexer-pgvector';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const DATA_DIR = path.join(process.cwd(), '.legacyguard');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Timeout para verificação RAG (evita requests travados)
const RAG_CHECK_TIMEOUT_MS = 5000;

// NOTA: ragReady foi REMOVIDO do DEFAULT_CONFIG
// Agora é verificado em tempo real via checkRagStatus()
// MANIFESTO Regra 1: Não mentir sobre status
const DEFAULT_CONFIG = {
  sandboxEnabled: true,
  sandboxFailMode: 'fail',
  safeMode: true,
  workerEnabled: false, // Temporariamente desabilitado por causa do Redis
  maskingEnabled: true,
  deepSearch: false,
  apiEnabled: false,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readConfig() {
  console.log('[CONFIG] Iniciando leitura da configuração...');
  try {
    const configExists = fs.existsSync(CONFIG_FILE);
    console.log(`[CONFIG] Arquivo de configuração existe: ${configExists} (${CONFIG_FILE})`);

    if (!configExists) {
      console.log('[CONFIG] Usando configuração padrão:', DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }

    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    console.log('[CONFIG] Conteúdo bruto do arquivo:', raw);

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    console.log('[CONFIG] Configuração parseada:', parsed);

    const merged = { ...DEFAULT_CONFIG, ...parsed };
    console.log('[CONFIG] Configuração final mesclada:', merged);
    console.log('[CONFIG] workerEnabled final:', merged.workerEnabled);

    return merged;
  } catch (error) {
    console.error('[CONFIG] Erro ao ler configuração:', error);
    console.log('[CONFIG] Retornando configuração padrão devido ao erro');
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(cfg: Record<string, unknown>) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

export async function GET() {
  console.log('[CONFIG] GET /api/config chamado');
  const cfg = readConfig();
  
  // Verificar se usuário está autenticado para decidir nível de detalhe
  let isAuthenticated = false;
  try {
    const session = await getServerSession(authOptions);
    isAuthenticated = !!session?.user;
  } catch {
    // Sessão não disponível - tratar como não autenticado
  }
  
  // Verificar RAG status em tempo REAL - não hardcoded
  // MANIFESTO Regra 1: Features devem falhar honestamente
  // Usuários autenticados veem detalhes, anônimos veem apenas ready/not ready
  let ragStatus: {
    ready: boolean;
    configured: boolean;
    connected?: boolean;
    tableExists?: boolean;
    documentCount: number;
    error?: string;
  } = {
    ready: false,
    configured: false,
    documentCount: 0,
    error: 'Verificação não executada',
  };
  
  try {
    ragStatus = await checkRagStatus({
      timeoutMs: RAG_CHECK_TIMEOUT_MS,
      includeDetails: isAuthenticated, // Só expõe contagem se autenticado
    });
    console.log('[CONFIG] RAG status verificado:', ragStatus);
  } catch (err) {
    console.error('[CONFIG] Erro ao verificar RAG:', err);
    ragStatus.error = err instanceof Error ? err.message : 'Erro desconhecido';
  }
  
  // Para requests não autenticados, limitar informação exposta
  const sanitizedRagStatus = isAuthenticated
    ? ragStatus
    : {
        ready: ragStatus.ready,
        configured: ragStatus.configured,
        // Omitir: connected, tableExists, documentCount, error (podem expor infra)
      };
  
  // Mesclar config com status real do RAG
  const response = {
    config: {
      ...cfg,
      ragReady: ragStatus.ready,
    },
    ragStatus: sanitizedRagStatus,
  };
  
  console.log('[CONFIG] Retornando configuração:', response);
  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
  console.log('[CONFIG] POST /api/config chamado');
  const body = await req.json().catch(() => ({}));
  console.log('[CONFIG] Corpo da requisição:', body);

  const current = readConfig();
  console.log('[CONFIG] Configuração atual antes do merge:', current);

  const merged = { ...current, ...body };
  console.log('[CONFIG] Configuração após merge:', merged);

  writeConfig(merged);
  console.log('[CONFIG] Configuração salva no arquivo');

  return NextResponse.json({ saved: true, config: merged });
}
