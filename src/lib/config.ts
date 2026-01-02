export const REDIS_URL = process.env.REDIS_URL || '';
export const REDIS_TLS_URL = process.env.REDIS_TLS_URL || '';

/**
 * Retorna a URL do Redis a ser usada. Prefere `REDIS_TLS_URL` se definida,
 * depois `REDIS_URL`. Em produção, lança erro se não configurado.
 */
export function getRedisUrl(): string {
  // Lê dinamicamente para garantir que pegue valores atualizados
  const tlsUrl = process.env.REDIS_TLS_URL || '';
  const redisUrl = process.env.REDIS_URL || '';
  const url = tlsUrl || redisUrl;

  console.log('[CONFIG] getRedisUrl() chamada');
  console.log('[CONFIG] REDIS_TLS_URL:', tlsUrl ? `${tlsUrl.substring(0, 20)}...` : '(vazio)');
  console.log('[CONFIG] REDIS_URL:', redisUrl ? `${redisUrl.substring(0, 20)}...` : '(vazio)');

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL ou REDIS_TLS_URL deve ser configurado em produção');
    }
    console.warn('[CONFIG] Redis não configurado - algumas funcionalidades podem não funcionar');
    return '';
  }

  console.log('[CONFIG] URL do Redis encontrada:', url.substring(0, 30) + '...');
  return url;
}

/**
 * Verifica se o worker está habilitado nas configurações.
 * Retorna true se o worker estiver habilitado, false caso contrário.
 */
export function isWorkerEnabled(): boolean {
  console.log('[CONFIG] isWorkerEnabled() chamada');
  try {
    const fs = require('fs');
    const path = require('path');

    const DATA_DIR = path.join(process.cwd(), '.legacyguard');
    const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

    console.log('[CONFIG] Verificando arquivo:', CONFIG_FILE);
    const fileExists = fs.existsSync(CONFIG_FILE);
    console.log('[CONFIG] Arquivo existe:', fileExists);

    if (!fileExists) {
      console.log('[CONFIG] Arquivo não existe, retornando false');
      return false; // Padrão é false
    }

    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    console.log('[CONFIG] Conteúdo do arquivo:', raw);

    const config = JSON.parse(raw);
    console.log('[CONFIG] Configuração parseada:', config);

    const workerEnabled = config.workerEnabled ?? false;
    console.log('[CONFIG] workerEnabled final:', workerEnabled);

    return workerEnabled;
  } catch (error) {
    console.error('[CONFIG] Erro em isWorkerEnabled:', error);
    return false; // Em caso de erro, assume desabilitado
  }
}

export default {
  REDIS_URL,
  REDIS_TLS_URL,
  getRedisUrl,
  isWorkerEnabled,
};
