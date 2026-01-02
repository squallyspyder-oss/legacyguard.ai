import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.legacyguard');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  sandboxEnabled: true,
  sandboxFailMode: 'fail',
  safeMode: true,
  workerEnabled: false, // Temporariamente desabilitado por causa do Redis
  maskingEnabled: true,
  deepSearch: false,
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
  console.log('[CONFIG] Retornando configuração:', cfg);
  return NextResponse.json({ config: cfg });
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
